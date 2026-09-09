import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { buildPagination, paginate } from '../common/dto/paginated-result.dto';
import { buildSearchOR } from '../common/helpers/search.helper';
import { GlobalSearchQueryDto, SearchTarget } from './search.dto';

const AD_SEARCH_SELECT = {
	id: true,
	slug: true,
	title: true,
	description: true,
	price: true,
	image: true,
	verified: true,
	createdAt: true,
	user: {
		select: { id: true, name: true, surname: true, image: true },
	},
} as const;

const BUSINESS_SEARCH_SELECT = {
	id: true,
	slug: true,
	name: true,
	description: true,
	province: true,
	logoUrl: true,
	isVerified: true,
	createdAt: true,
	owner: {
		select: { id: true, name: true, surname: true, image: true },
	},
} as const;

const USER_SEARCH_SELECT = {
	id: true,
	name: true,
	surname: true,
	image: true,
	createdAt: true,
} as const;

const MAX_PER_ENTITY = 500;

type GroupedResult = [SearchTarget, number, object[]];

@Injectable()
export class SearchService {
	constructor(private readonly prisma: PrismaService) {}

	async searchPublic(query: GlobalSearchQueryDto) {
		const pagination = buildPagination(query.page, query.limit);
		const q = query.q.trim();
		const target = query.type;
		const perEntityTake = Math.min(
			pagination.skip + pagination.take,
			MAX_PER_ENTITY,
		);

		const queries: Promise<GroupedResult>[] = [];
		if (!target || target === 'AD') {
			queries.push(this.searchAds(q, query.categoryId, perEntityTake));
		}
		if (!target || target === 'BUSINESS') {
			queries.push(
				this.searchBusinesses(
					q,
					query.categoryId,
					query.province,
					perEntityTake,
				),
			);
		}
		if (!target || target === 'USER') {
			queries.push(this.searchUsers(q, perEntityTake));
		}

		const results = await Promise.all(queries);

		const total = results.reduce((sum, [, count]) => sum + count, 0);

		const merged = results
			.flatMap(([, , items]) => items)
			.sort((a, b) => {
				const scoreDiff =
					Number((b as { relevance: number }).relevance) -
					Number((a as { relevance: number }).relevance);
				if (scoreDiff !== 0) {
					return scoreDiff;
				}
				const dateDiff =
					new Date((b as { createdAt: string }).createdAt).getTime() -
					new Date((a as { createdAt: string }).createdAt).getTime();
				return dateDiff || 0;
			});

		return paginate(
			merged.slice(pagination.skip, pagination.skip + pagination.take),
			total,
			pagination,
		);
	}

	private async searchAds(
		q: string,
		categoryId: string | undefined,
		take: number,
	): Promise<GroupedResult> {
		const where: Prisma.AdWhereInput = {
			status: 'ACTIVE',
			visibility: 'VISIBLE',
			...(q ? { OR: buildSearchOR(['title', 'description'], q) } : {}),
			...(categoryId ? { categories: { some: { id: categoryId } } } : {}),
		};

		const [total, rows] = await Promise.all([
			this.prisma.ad.count({ where }),
			this.prisma.ad.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take,
				select: AD_SEARCH_SELECT,
			}),
		]);

		const items = rows.map((row) => ({
			type: 'AD' as const,
			relevance: this.relevance(
				q,
				[row.title, row.description],
				[20, 10],
			),
			id: row.id,
			slug: row.slug,
			title: row.title,
			description: row.description,
			price: row.price === null ? null : row.price.toNumber(),
			image: row.image,
			verified: row.verified,
			createdAt: row.createdAt,
			user: row.user,
		}));

		return ['AD', total, items];
	}

	private async searchBusinesses(
		q: string,
		categoryId: string | undefined,
		province: string | undefined,
		take: number,
	): Promise<GroupedResult> {
		const where: Prisma.BusinessWhereInput = {
			status: 'SHOW',
			...(q
				? {
						OR: buildSearchOR(['name', 'description', 'phone'], q),
					}
				: {}),
			...(categoryId ? { categoryId } : {}),
			...(province
				? {
						province:
							province as Prisma.BusinessWhereInput['province'],
					}
				: {}),
		};

		const [total, rows] = await Promise.all([
			this.prisma.business.count({ where }),
			this.prisma.business.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take,
				select: BUSINESS_SEARCH_SELECT,
			}),
		]);

		const items = rows.map((row) => ({
			type: 'BUSINESS' as const,
			relevance: this.relevance(q, [row.name, row.description], [20, 10]),
			id: row.id,
			slug: row.slug,
			name: row.name,
			description: row.description,
			province: row.province,
			logoUrl: row.logoUrl,
			isVerified: row.isVerified,
			createdAt: row.createdAt,
			owner: row.owner,
		}));

		return ['BUSINESS', total, items];
	}

	private async searchUsers(q: string, take: number): Promise<GroupedResult> {
		const where: Prisma.UserWhereInput = q
			? {
					OR: buildSearchOR(['name', 'surname'], q),
				}
			: {};

		const [total, rows] = await Promise.all([
			this.prisma.user.count({ where }),
			this.prisma.user.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take,
				select: USER_SEARCH_SELECT,
			}),
		]);

		const items = rows.map((row) => ({
			type: 'USER' as const,
			relevance: this.relevance(
				q,
				[[row.name, row.surname].filter(Boolean).join(' ')] as string[],
				[20],
			),
			id: row.id,
			name: row.name,
			surname: row.surname,
			image: row.image,
			createdAt: row.createdAt,
		}));

		return ['USER', total, items];
	}

	private relevance(
		query: string,
		fields: readonly string[],
		weights: readonly number[],
	): number {
		const words = query
			.toLowerCase()
			.split(/\s+/)
			.filter((word) => word.length > 0);
		if (words.length === 0) {
			return 0;
		}

		let score = 0;
		for (let i = 0; i < fields.length; i++) {
			const value = (fields[i] ?? '').toLowerCase();
			const weight = weights[i] ?? 5;
			for (const word of words) {
				if (value === word) {
					score += weight + 10;
				} else if (value.includes(word)) {
					score += weight;
				}
			}
		}
		return score;
	}
}
