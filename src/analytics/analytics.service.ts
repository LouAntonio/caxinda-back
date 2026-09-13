import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.module';
import { newId } from '../libs/id';
import {
	AnalyticsQuery,
	AnalyticsRange,
	ContactChannel,
} from './analytics.dto';

export type AnalyticsEntityType = 'AD' | 'BUSINESS';

export interface AnalyticsSessionUser {
	id: string;
	role: string;
}

const RETENTION_DAYS = 730;
const UNIQUE_SET_TTL_S = 60 * 60 * 48;

type ClickMap = Partial<Record<ContactChannel, number>>;

interface PendingState {
	entityId: string;
	dateStr: string;
	views: number;
	uniqueViews: number;
	clicks: ClickMap;
}

function dayKey(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function mergeClicks(
	existing: unknown,
	increment: ClickMap,
): Array<{ channel: string; count: number }> {
	const totals = new Map<string, number>();
	if (Array.isArray(existing)) {
		for (const item of existing) {
			if (
				item &&
				typeof item === 'object' &&
				'channel' in item &&
				'count' in item
			) {
				const { channel, count } = item as {
					channel: string;
					count: number;
				};
				totals.set(channel, (totals.get(channel) ?? 0) + count);
			}
		}
	}
	for (const [channel, count] of Object.entries(increment)) {
		totals.set(channel, (totals.get(channel) ?? 0) + (count ?? 0));
	}
	return [...totals.entries()].map(([channel, count]) => ({
		channel,
		count,
	}));
}

@Injectable()
export class AnalyticsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly redis: Redis,
	) {}

	private isPrivileged(role?: string): boolean {
		return role === 'ADMIN' || role === 'MODERATOR';
	}

	/**
	 * Regista uma view de anúncio/empresa no Redis (fire-and-forget).
	 * Views são contadas por pedido; a deduplicação por dia usa utilizador
	 * autenticado (visitantes anónimos contam cada abertura como única).
	 */
	async trackView(
		type: AnalyticsEntityType,
		entityId: string,
		viewer?: AnalyticsSessionUser | null,
	): Promise<void> {
		try {
			const dateStr = dayKey();
			await this.redis.incr(`ana:vc:${type}:${entityId}:${dateStr}`);
			const token = viewer?.id;
			if (token) {
				const uniqKey = `ana:vu:${type}:${entityId}:${dateStr}`;
				await this.redis.sadd(uniqKey, `u:${token}`);
				await this.redis.expire(uniqKey, UNIQUE_SET_TTL_S);
			}
		} catch {
			// Analytics é best-effort — nunca deve quebrar o pedido principal.
		}
	}

	async trackClick(
		businessId: string,
		channel: ContactChannel,
	): Promise<void> {
		try {
			await this.redis.incr(
				`ana:cc:${channel}:${businessId}:${dayKey()}`,
			);
		} catch {
			// Best-effort.
		}
	}

	async trackBusinessClick(
		businessId: string,
		channel: ContactChannel,
	): Promise<void> {
		const business = await this.prisma.business.findUnique({
			where: { id: businessId },
			select: { status: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (business.status !== 'SHOW') {
			throw new BadRequestException(
				'Empresa não está disponível para contacto.',
			);
		}
		await this.trackClick(businessId, channel);
	}

	async flush(): Promise<void> {
		const states = await this.collectPending();
		if (states.keys.length === 0) {
			return;
		}

		await this.prisma.$transaction(async (tx) => {
			for (const state of states.ad.values()) {
				const date = new Date(`${state.dateStr}T00:00:00.000Z`);
				const existing = await tx.analyticsDaily.findUnique({
					where: { adId_date: { adId: state.entityId, date } },
					select: { uniqueViews: true },
				});
				const uniqueViews = Math.max(
					existing?.uniqueViews ?? 0,
					state.uniqueViews,
				);
				await tx.analyticsDaily.upsert({
					where: { adId_date: { adId: state.entityId, date } },
					create: {
						id: newId(),
						adId: state.entityId,
						date,
						views: state.views,
						uniqueViews: state.uniqueViews,
					},
					update: {
						views: { increment: state.views },
						uniqueViews: { set: uniqueViews },
					},
				});
				await tx.ad.updateMany({
					where: { id: state.entityId },
					data: { viewCount: { increment: state.views } },
				});
			}

			for (const state of states.business.values()) {
				const date = new Date(`${state.dateStr}T00:00:00.000Z`);
				const clicks = mergeClicks([], state.clicks);
				await tx.analyticsDaily.upsert({
					where: {
						businessId_date: { businessId: state.entityId, date },
					},
					create: {
						id: newId(),
						businessId: state.entityId,
						date,
						views: state.views,
						uniqueViews: state.uniqueViews,
						clicks: clicks,
					},
					update: {
						views: { increment: state.views },
					},
				});
				const current = await tx.analyticsDaily.findUnique({
					where: {
						businessId_date: { businessId: state.entityId, date },
					},
					select: { clicks: true, uniqueViews: true },
				});
				const merged = mergeClicks(current?.clicks ?? [], state.clicks);
				const uniqueViews = Math.max(
					current?.uniqueViews ?? 0,
					state.uniqueViews,
				);
				await tx.analyticsDaily.update({
					where: {
						businessId_date: { businessId: state.entityId, date },
					},
					data: { uniqueViews: { set: uniqueViews }, clicks: merged },
				});
				await tx.business.updateMany({
					where: { id: state.entityId },
					data: {
						viewCount: { increment: state.views },
						clickCount: { increment: this.clicksSum(state.clicks) },
					},
				});
			}
		});

		await this.redis.del(...states.keys);
	}

	async prune(): Promise<void> {
		const cutoff = new Date();
		cutoff.setHours(0, 0, 0, 0);
		cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
		await this.prisma.analyticsDaily.deleteMany({
			where: { date: { lt: cutoff } },
		});
	}

	async getAdStats(
		userId: string,
		role: string,
		adId: string,
		query: AnalyticsRange | AnalyticsQuery = '30d',
	) {
		const ad = await this.prisma.ad.findUnique({
			where: { id: adId },
			select: { userId: true },
		});
		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}
		if (ad.userId !== userId && !this.isPrivileged(role)) {
			throw new ForbiddenException(
				'Sem permissão para ver as estatísticas deste anúncio.',
			);
		}

		const { from, to } = this.resolveDateRange(query);
		const rows = await this.prisma.analyticsDaily.findMany({
			where: { adId, date: { gte: from, lte: to } },
			orderBy: { date: 'asc' },
			select: { date: true, views: true, uniqueViews: true },
		});

		let views = 0;
		let uniqueViews = 0;
		for (const row of rows) {
			views += row.views;
			uniqueViews += row.uniqueViews;
		}

		return {
			adId,
			totals: { views, uniqueViews },
			daily: rows.map((row) => ({
				date: row.date,
				views: row.views,
				uniqueViews: row.uniqueViews,
			})),
		};
	}

	async getBusinessStats(
		userId: string,
		role: string,
		businessId: string,
		query: AnalyticsRange | AnalyticsQuery = '30d',
	) {
		const business = await this.prisma.business.findUnique({
			where: { id: businessId },
			select: { ownerId: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (business.ownerId !== userId && !this.isPrivileged(role)) {
			throw new ForbiddenException(
				'Sem permissão para ver as estatísticas desta empresa.',
			);
		}

		const { from, to } = this.resolveDateRange(query);
		const rows = await this.prisma.analyticsDaily.findMany({
			where: { businessId, date: { gte: from, lte: to } },
			orderBy: { date: 'asc' },
			select: {
				date: true,
				views: true,
				uniqueViews: true,
				clicks: true,
			},
		});

		let views = 0;
		let uniqueViews = 0;
		const channelTotal = new Map<string, number>();
		for (const row of rows) {
			views += row.views;
			uniqueViews += row.uniqueViews;
			for (const item of mergeClicks(row.clicks, {})) {
				channelTotal.set(
					item.channel,
					(channelTotal.get(item.channel) ?? 0) + item.count,
				);
			}
		}

		return {
			businessId,
			totals: {
				views,
				uniqueViews,
				clicks: [...channelTotal.values()].reduce(
					(acc, count) => acc + count,
					0,
				),
				clicksByChannel: [...channelTotal.entries()].map(
					([channel, count]) => ({ channel, count }),
				),
			},
			daily: rows.map((row) => ({
				date: row.date,
				views: row.views,
				uniqueViews: row.uniqueViews,
				clicks: this.clicksSum(row.clicks),
				clicksByChannel: mergeClicks(row.clicks, {}),
			})),
		};
	}

	async getPlatformStats(query: AnalyticsRange | AnalyticsQuery = '30d') {
		const { from, to } = this.resolveDateRange(query);
		const rows = await this.prisma.analyticsDaily.findMany({
			where: { date: { gte: from, lte: to } },
			orderBy: { date: 'asc' },
			select: {
				date: true,
				views: true,
				uniqueViews: true,
				clicks: true,
			},
		});

		const byDate = new Map<
			string,
			{
				views: number;
				uniqueViews: number;
				clicks: number;
				clicksByChannel: Map<string, number>;
			}
		>();
		let views = 0;
		let uniqueViews = 0;
		const channelTotal = new Map<string, number>();
		for (const row of rows) {
			views += row.views;
			uniqueViews += row.uniqueViews;
			const key = dayKey(row.date);
			const day = byDate.get(key) ?? {
				views: 0,
				uniqueViews: 0,
				clicks: 0,
				clicksByChannel: new Map<string, number>(),
			};
			day.views += row.views;
			day.uniqueViews += row.uniqueViews;
			const rowClicks = mergeClicks(row.clicks, {});
			day.clicks += this.clicksSum(row.clicks);
			for (const item of rowClicks) {
				day.clicksByChannel.set(
					item.channel,
					(day.clicksByChannel.get(item.channel) ?? 0) + item.count,
				);
				channelTotal.set(
					item.channel,
					(channelTotal.get(item.channel) ?? 0) + item.count,
				);
			}
			byDate.set(key, day);
		}

		return {
			totals: {
				views,
				uniqueViews,
				clicks: [...channelTotal.values()].reduce(
					(acc, count) => acc + count,
					0,
				),
				clicksByChannel: [...channelTotal.entries()].map(
					([channel, count]) => ({ channel, count }),
				),
			},
			daily: [...byDate.entries()].map(([date, totals]) => ({
				date,
				views: totals.views,
				uniqueViews: totals.uniqueViews,
				clicks: totals.clicks,
				clicksByChannel: [...totals.clicksByChannel.entries()].map(
					([channel, count]) => ({ channel, count }),
				),
			})),
		};
	}

	async getPlatformOverview(query: AnalyticsRange | AnalyticsQuery = '30d') {
		const stats = await this.getPlatformStats(query);
		const { from, to } = this.resolveDateRange(query);
		const rows = await this.prisma.analyticsDaily.findMany({
			where: { date: { gte: from, lte: to } },
			select: { adId: true, businessId: true, views: true, clicks: true },
		});
		const ads = new Map<
			string,
			{ id: string; views: number; clicks: number }
		>();
		const businesses = new Map<
			string,
			{ id: string; views: number; clicks: number }
		>();
		for (const row of rows) {
			if (row.adId) {
				const item = ads.get(row.adId) ?? {
					id: row.adId,
					views: 0,
					clicks: 0,
				};
				item.views += row.views;
				item.clicks += this.clicksSum(row.clicks);
				ads.set(row.adId, item);
			}
			if (row.businessId) {
				const item = businesses.get(row.businessId) ?? {
					id: row.businessId,
					views: 0,
					clicks: 0,
				};
				item.views += row.views;
				item.clicks += this.clicksSum(row.clicks);
				businesses.set(row.businessId, item);
			}
		}
		const topAds = [...ads.values()]
			.sort((a, b) => b.views - a.views)
			.slice(0, 5);
		const topBusinesses = [...businesses.values()]
			.sort((a, b) => b.views - a.views)
			.slice(0, 5);
		let adDetails: Array<{
			id: string;
			title: string;
			slug: string;
			image: string | null;
		}> = [];
		let businessDetails: Array<{
			id: string;
			name: string;
			slug: string;
			coverUrl: string | null;
		}> = [];
		if (topAds.length > 0) {
			adDetails = await this.prisma.ad.findMany({
				where: { id: { in: topAds.map((item) => item.id) } },
				select: {
					id: true,
					title: true,
					slug: true,
					image: true,
				},
			});
		}
		if (topBusinesses.length > 0) {
			businessDetails = await this.prisma.business.findMany({
				where: { id: { in: topBusinesses.map((item) => item.id) } },
				select: {
					id: true,
					name: true,
					slug: true,
					coverUrl: true,
				},
			});
		}
		const adById = new Map(adDetails.map((item) => [item.id, item]));
		const businessById = new Map(
			businessDetails.map((item) => [item.id, item]),
		);
		const enrichedAds = topAds
			.map((item) => ({
				...item,
				...adById.get(item.id),
			}))
			.filter((item): item is typeof item & { title: string } =>
				Boolean(item.title),
			);
		const enrichedBusinesses = topBusinesses
			.map((item) => ({
				...item,
				...businessById.get(item.id),
			}))
			.filter((item): item is typeof item & { name: string } =>
				Boolean(item.name),
			);
		return {
			...stats,
			topAds: enrichedAds,
			topBusinesses: enrichedBusinesses,
		};
	}

	async getPlatformCsv(query: AnalyticsRange | AnalyticsQuery = '30d') {
		const stats = await this.getPlatformStats(query);
		const header = [
			'date',
			'views',
			'uniqueViews',
			'clicks',
			'phone',
			'whatsapp',
			'email',
			'website',
		];
		const rows = stats.daily.map((day) => {
			const channels = new Map(
				day.clicksByChannel.map((item) => [item.channel, item.count]),
			);
			return [
				day.date,
				day.views,
				day.uniqueViews,
				day.clicks,
				channels.get('phone') ?? 0,
				channels.get('whatsapp') ?? 0,
				channels.get('email') ?? 0,
				channels.get('website') ?? 0,
			];
		});
		return [header, ...rows]
			.map((row) =>
				row
					.map((value) => `"${String(value).replace(/"/g, '""')}"`)
					.join(','),
			)
			.join('\n');
	}

	private resolveDateRange(query: AnalyticsRange | AnalyticsQuery): {
		from: Date;
		to: Date;
	} {
		if (typeof query !== 'string' && (query.from || query.to)) {
			const from = query.from
				? this.parseDate(query.from, true)
				: this.fromDate(query.range ?? '30d');
			const to = query.to
				? this.parseDate(query.to, false)
				: this.todayEnd();
			if (from > to) {
				throw new BadRequestException(
					'A data inicial não pode ser posterior à data final.',
				);
			}
			return { from, to };
		}
		const range =
			typeof query === 'string' ? query : (query.range ?? '30d');
		return { from: this.fromDate(range), to: this.todayEnd() };
	}

	private parseDate(value: string, endOfDay: boolean): Date {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			throw new BadRequestException(
				'As datas inicial e final devem ser válidas.',
			);
		}
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			date.setUTCHours(
				endOfDay ? 23 : 0,
				endOfDay ? 59 : 0,
				endOfDay ? 59 : 0,
				endOfDay ? 999 : 0,
			);
		}
		return date;
	}

	private todayEnd(): Date {
		const now = new Date();
		now.setHours(23, 59, 59, 999);
		return now;
	}

	private clicksSum(clicks: unknown): number {
		if (!clicks || typeof clicks !== 'object') {
			return 0;
		}
		if (Array.isArray(clicks)) {
			return clicks.reduce<number>((acc, item) => {
				const count = (item as { count?: unknown } | null)?.count;
				if (typeof count === 'number') {
					return acc + count;
				}
				return acc;
			}, 0);
		}
		return Object.values(clicks).reduce<number>(
			(acc, count) => acc + (typeof count === 'number' ? count : 0),
			0,
		);
	}

	private fromDate(range: AnalyticsRange): Date {
		const days = Number(range.replace('d', ''));
		const cutoff = new Date();
		cutoff.setHours(0, 0, 0, 0);
		cutoff.setDate(cutoff.getDate() - (days - 1));
		return cutoff;
	}

	private async scanAll(pattern: string): Promise<string[]> {
		const keys: string[] = [];
		let cursor = '0';
		do {
			const [nextCursor, found] = await this.redis.scan(
				cursor,
				'MATCH',
				pattern,
				'COUNT',
				500,
			);
			cursor = nextCursor;
			keys.push(...found);
		} while (cursor !== '0');
		return keys;
	}

	private async collectPending(): Promise<{
		ad: Map<string, PendingState>;
		business: Map<string, PendingState>;
		keys: string[];
	}> {
		const ad = new Map<string, PendingState>();
		const business = new Map<string, PendingState>();
		const keys: string[] = [];

		const viewKeys = await this.scanAll('ana:vc:*');
		for (const key of viewKeys) {
			const parts = key.split(':');
			if (parts.length !== 5) {
				continue;
			}
			const [, , type, entityId, dateStr] = parts;
			const value = await this.redis.incrby(key, 0);
			const target =
				type === 'AD' ? ad : type === 'BUSINESS' ? business : null;
			if (!target) {
				continue;
			}
			const mapKey = `${entityId}:${dateStr}`;
			const state = target.get(mapKey) ?? {
				entityId,
				dateStr,
				views: 0,
				uniqueViews: 0,
				clicks: {},
			};
			state.views += value;
			target.set(mapKey, state);
			keys.push(key);
		}

		const uniqKeys = await this.scanAll('ana:vu:*');
		for (const key of uniqKeys) {
			const parts = key.split(':');
			if (parts.length !== 5) {
				continue;
			}
			const [, , type, entityId, dateStr] = parts;
			const target =
				type === 'AD' ? ad : type === 'BUSINESS' ? business : null;
			if (!target) {
				continue;
			}
			const mapKey = `${entityId}:${dateStr}`;
			const state = target.get(mapKey) ?? {
				entityId,
				dateStr,
				views: 0,
				uniqueViews: 0,
				clicks: {},
			};
			state.uniqueViews = await this.redis.scard(key);
			target.set(mapKey, state);
			keys.push(key);
		}

		const clickKeys = await this.scanAll('ana:cc:*');
		for (const key of clickKeys) {
			const parts = key.split(':');
			if (parts.length !== 5) {
				continue;
			}
			const [, , channel, entityId, dateStr] = parts;
			const state = business.get(`${entityId}:${dateStr}`) ?? {
				entityId,
				dateStr,
				views: 0,
				uniqueViews: 0,
				clicks: {},
			};
			state.clicks[channel as ContactChannel] = await this.redis.incrby(
				key,
				0,
			);
			business.set(`${entityId}:${dateStr}`, state);
			keys.push(key);
		}

		// Filtra estados sem contadores, mas mantém as chaves reais a apagar.
		return {
			ad,
			business,
			keys: [...new Set(keys)],
		};
	}
}
