import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.module';
import { newId } from '../libs/id';
import { AnalyticsRange, ContactChannel } from './analytics.dto';

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
		range: AnalyticsRange = '30d',
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

		const rows = await this.prisma.analyticsDaily.findMany({
			where: { adId, date: { gte: this.fromDate(range) } },
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
		range: AnalyticsRange = '30d',
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

		const rows = await this.prisma.analyticsDaily.findMany({
			where: { businessId, date: { gte: this.fromDate(range) } },
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
				clicks: row.clicks,
			})),
		};
	}

	async getPlatformStats(range: AnalyticsRange = '30d') {
		const rows = await this.prisma.analyticsDaily.findMany({
			where: { date: { gte: this.fromDate(range) } },
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
			{ views: number; uniqueViews: number }
		>();
		let views = 0;
		let uniqueViews = 0;
		const channelTotal = new Map<string, number>();
		for (const row of rows) {
			views += row.views;
			uniqueViews += row.uniqueViews;
			const key = dayKey(row.date);
			const day = byDate.get(key) ?? { views: 0, uniqueViews: 0 };
			day.views += row.views;
			day.uniqueViews += row.uniqueViews;
			byDate.set(key, day);
			for (const item of mergeClicks(row.clicks, {})) {
				channelTotal.set(
					item.channel,
					(channelTotal.get(item.channel) ?? 0) + item.count,
				);
			}
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
				...totals,
			})),
		};
	}

	private clicksSum(clicks: ClickMap): number {
		return Object.values(clicks).reduce(
			(acc, count) => acc + (count ?? 0),
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
