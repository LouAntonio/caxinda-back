import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import {
	buildPagination,
	paginate,
	type PaginatedResult,
} from '../common/dto/paginated-result.dto';
import { CacheService } from '../cache/cache.service';
import { MediaService } from '../media/media.service';
import { newId } from '../libs/id';
import { buildSearchOR } from '../common/helpers/search.helper';
import {
	AdminListAdsQueryDto,
	AdQueryDto,
	CreateAdDto,
	ModerateAdDto,
	UpdateAdDto,
	UpdateVisibilityDto,
} from './ads.dto';
import { slugify } from '../categories/categories.service';
import { AnalyticsService } from '../analytics/analytics.service';

export interface AdSessionUser {
	id: string;
	role: string;
}

/** JSON-safe shape of an ad row used for the public `getById` cache. */
interface CacheableAd {
	id: string;
	slug: string;
	title: string;
	description: string;
	price: string | null;
	status: string;
	visibility: string;
	verified: boolean;
	createdAt: Date;
	updatedAt: Date;
	averageRating: number | null;
	reviewCount: number;
	featured: boolean;
	featuredUntil: Date | null;
	featuredAt: Date | null;
	image: string | null;
	imageId: string | null;
	gallery: unknown;
	userId: string;
	viewCount: number;
	categories: unknown[];
	user: unknown;
}

type AdDetail = Prisma.AdGetPayload<{ include: typeof AD_INCLUDE }>;

const FEATURED_DURATION_DAYS = 30;

const AD_INCLUDE = {
	categories: true,
	user: {
		select: {
			id: true,
			name: true,
			surname: true,
			image: true,
			trustScore: true,
			isVerified: true,
		},
	},
} as const;

function isPrismaError(
	error: unknown,
	code: string,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === code
	);
}

@Injectable()
export class AdsService {
	private readonly AD_TTL_MS = 60_000;

	constructor(
		private readonly prisma: PrismaService,
		private readonly cache: CacheService,
		private readonly media: MediaService,
		private readonly analytics: AnalyticsService,
	) {}

	private isPrivileged(viewer?: AdSessionUser | null): boolean {
		return viewer?.role === 'ADMIN' || viewer?.role === 'MODERATOR';
	}

	async list(query: AdQueryDto = {}, viewer?: AdSessionUser | null) {
		await this.expireStaleFeatured();

		const { page, limit, skip, take } = buildPagination(
			query.page,
			query.limit,
		);
		const sortBy = query.sortBy ?? 'newest';
		const includeInactive = !!(
			query.includeInactive &&
			(this.isPrivileged(viewer) || query.userId === viewer?.id)
		);

		if (sortBy === 'distance') {
			throw new BadRequestException(
				'Ordenação por distância não está disponível neste momento.',
			);
		}

		if (
			query.lat !== undefined ||
			query.lng !== undefined ||
			query.radiusKm !== undefined
		) {
			throw new BadRequestException(
				'Busca por proximidade não está disponível neste momento.',
			);
		}

		// Proximidade (PostGIS) ainda não está ativa — ver prisma/schema.prisma.
		const proximity: null = null;

		const where: Prisma.AdWhereInput = {};

		if (!includeInactive) {
			where.status = 'ACTIVE';
			where.visibility = 'VISIBLE';
		}

		if (query.featured) {
			where.featured = true;
			where.featuredUntil = { gt: new Date() };
		}

		if (query.categorySlugs) {
			const slugs = query.categorySlugs
				.split(',')
				.map((slug) => slug.trim())
				.filter(Boolean);
			if (slugs.length) {
				where.categories = { some: { slug: { in: slugs } } };
			}
		} else if (query.categoryIds) {
			const ids = query.categoryIds
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
			if (ids.length) {
				where.categories = { some: { id: { in: ids } } };
			}
		}

		if (query.userId) {
			where.userId = query.userId;
		}

		if (query.q) {
			where.OR = buildSearchOR(['title', 'description'], query.q);
		}

		if (query.minPrice !== undefined || query.maxPrice !== undefined) {
			where.price = {
				...(query.minPrice !== undefined && { gte: query.minPrice }),
				...(query.maxPrice !== undefined && { lte: query.maxPrice }),
			};
		}

		const distanceMap = new Map<string, number>();

		const total = await this.prisma.ad.count({ where });

		const baseOrderBy = this.buildOrderBy(sortBy);
		const orderBy: Prisma.AdOrderByWithRelationInput[] =
			sortBy === 'newest'
				? [
						{ featured: 'desc' },
						{ featuredUntil: 'asc' },
						...baseOrderBy,
					]
				: baseOrderBy;

		let items: ReturnType<AdsService['toPublicAd']>[] = [];

		if (proximity && distanceMap.size) {
			// Quando há proximidade, a página deve refletir a ordem por
			// distância. Buscamos todos os anúncios dentro do raio (e que
			// cumprem os restantes filtros) e paginamos por distância em
			// memória — em vez de paginar por createdAt no SQL, o que deixaria
			// fora anúncios próximos porém mais antigos.
			const withinRadius = await this.prisma.ad.findMany({
				where,
				include: AD_INCLUDE,
				orderBy: { createdAt: 'desc' },
			});

			withinRadius.sort(
				(a, b) =>
					(distanceMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
					(distanceMap.get(b.id) ?? Number.MAX_SAFE_INTEGER),
			);

			const paged = withinRadius.slice(skip, skip + take);
			items = paged.map((ad) =>
				this.toPublicAd(ad, distanceMap.get(ad.id)),
			);
		} else {
			const ads = await this.prisma.ad.findMany({
				where,
				include: AD_INCLUDE,
				orderBy,
				skip,
				take,
			});
			items = ads.map((ad) => this.toPublicAd(ad));
		}

		return {
			...paginate(items, total, { page, limit }),
			proximity: proximity ? true : undefined,
		};
	}

	async adminList(
		query: AdminListAdsQueryDto = {},
	): Promise<PaginatedResult<AdDetail>> {
		const { page, limit, skip, take } = buildPagination(
			query.page,
			query.limit,
			AdminListAdsQueryDto.LIMIT_MAX,
		);

		const where: Prisma.AdWhereInput = {};
		if (query.status) {
			where.status = query.status;
		}
		if (query.visibility) {
			where.visibility = query.visibility;
		}
		if (query.q) {
			where.OR = buildSearchOR(['title', 'description'], query.q);
		}
		if (query.sellerName) {
			where.user = {
				OR: buildSearchOR(['name', 'surname'], query.sellerName),
			};
		}

		const [found, total] = await Promise.all([
			this.prisma.ad.findMany({
				where,
				include: AD_INCLUDE,
				orderBy: { createdAt: 'desc' },
				skip,
				take,
			}),
			this.prisma.ad.count({ where }),
		]);

		return paginate(
			found.map((ad) => ({
				...this.toPublicAd(ad),
				user: ad.user,
			})) as unknown as AdDetail[],
			total,
			{ page, limit },
		);
	}

	private buildOrderBy(sortBy: string): Prisma.AdOrderByWithRelationInput[] {
		switch (sortBy) {
			case 'oldest':
				return [{ createdAt: 'asc' }];
			case 'price_asc':
				return [{ price: 'asc' }, { createdAt: 'desc' }];
			case 'price_desc':
				return [{ price: 'desc' }, { createdAt: 'desc' }];
			case 'distance':
				return [{ createdAt: 'desc' }];
			default:
				return [{ createdAt: 'desc' }];
		}
	}

	async getById(
		id: string,
		viewer?: AdSessionUser | null,
		proximity?: { lat: number; lng: number },
	) {
		// Cached view is only safe for the public (anonymous) case, where the ad
		// must be ACTIVE + VISIBLE. Authenticated (owner/admin) and hidden ads
		// always read fresh to avoid leaking privileged state. Com proximidade
		// também lemos sempre fresco, pois a distância varia com o referencial.
		if (!proximity && (viewer === null || viewer === undefined)) {
			const cached = await this.cache.get<CacheableAd>(`ad:${id}`);
			if (cached) {
				void this.analytics.trackView('AD', id);
				return this.withLocation(this.restoreAd(cached), id);
			}
		}

		const ad = await this.prisma.ad.findUnique({
			where: { id },
			include: AD_INCLUDE,
		});

		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}

		const isOwner = viewer?.id === ad.userId;
		const visible = ad.status === 'ACTIVE' && ad.visibility === 'VISIBLE';

		if (!visible && !isOwner && !this.isPrivileged(viewer)) {
			throw new NotFoundException('Anúncio não encontrado.');
		}

		if (visible && !isOwner && !this.isPrivileged(viewer)) {
			void this.analytics.trackView('AD', ad.id, viewer);
		}

		if (
			!proximity &&
			(viewer === null || viewer === undefined) &&
			visible
		) {
			await this.cache.set(
				`ad:${id}`,
				this.serializeAd(ad),
				this.AD_TTL_MS,
			);
		}

		const location = await this.getLocation(id);
		const distanceMeters = proximity
			? await this.distanceTo(id, proximity)
			: undefined;
		return { ...this.toPublicAd(ad, distanceMeters), location };
	}

	async getBySlug(
		slug: string,
		viewer?: AdSessionUser | null,
		proximity?: { lat: number; lng: number },
	) {
		const cachedKey = `ad:slug:${slug}`;
		if (!proximity && (viewer === null || viewer === undefined)) {
			const cached = await this.cache.get<CacheableAd>(cachedKey);
			if (cached) {
				void this.analytics.trackView('AD', cached.id);
				return this.withLocation(this.restoreAd(cached), cached.id);
			}
		}

		const ad = await this.prisma.ad.findUnique({
			where: { slug },
			include: AD_INCLUDE,
		});

		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}

		const isOwner = viewer?.id === ad.userId;
		const visible = ad.status === 'ACTIVE' && ad.visibility === 'VISIBLE';

		if (!visible && !isOwner && !this.isPrivileged(viewer)) {
			throw new NotFoundException('Anúncio não encontrado.');
		}

		if (visible && !isOwner && !this.isPrivileged(viewer)) {
			void this.analytics.trackView('AD', ad.id, viewer);
		}

		if (
			!proximity &&
			(viewer === null || viewer === undefined) &&
			visible
		) {
			await this.cache.set(
				cachedKey,
				this.serializeAd(ad),
				this.AD_TTL_MS,
			);
		}

		const location = await this.getLocation(ad.id);
		const distanceMeters = proximity
			? await this.distanceTo(ad.id, proximity)
			: undefined;
		return { ...this.toPublicAd(ad, distanceMeters), location };
	}

	/** Extrai a localização (lat/lng) de um anúncio, se existir. */
	private getLocation(id: string): Promise<null> {
		void id;
		// PostGIS ainda não está ativo — localização indisponível.
		return Promise.resolve(null);
	}

	/** Anexa a localização ao payload de resposta sem contaminar a cache. */
	private async withLocation<T extends object>(ad: T, id: string) {
		const location = await this.getLocation(id);
		return { ...ad, location };
	}

	/** Distância em metros até o anúncio — indisponível sem PostGIS. */
	private distanceTo(
		id: string,
		proximity: { lat: number; lng: number },
	): Promise<number | undefined> {
		void id;
		void proximity;
		return Promise.resolve(undefined);
	}

	async feature(userId: string, adId: string) {
		const ad = await this.prisma.ad.findUnique({
			where: { id: adId },
			select: {
				id: true,
				userId: true,
				status: true,
				visibility: true,
				featured: true,
				featuredUntil: true,
			},
		});
		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}
		if (ad.userId !== userId) {
			throw new ForbiddenException(
				'Você só pode destacar os seus próprios anúncios.',
			);
		}
		if (ad.status !== 'ACTIVE' || ad.visibility !== 'VISIBLE') {
			throw new BadRequestException(
				'Um anúncio só pode ser destacado quando está ativo e visível.',
			);
		}

		if (ad.featured && ad.featuredUntil && ad.featuredUntil > new Date()) {
			throw new ConflictException('Este anúncio já está em destaque.');
		}

		await this.expireStaleFeatured();

		const now = new Date();
		const featuredUntil = new Date(
			now.getTime() + FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000,
		);

		const updated = await this.prisma.ad.update({
			where: { id: adId },
			data: { featured: true, featuredUntil, featuredAt: now },
			include: AD_INCLUDE,
		});

		await this.invalidateAdCache(adId);

		return updated;
	}

	async unfeature(userId: string, viewerRole: string, adId: string) {
		const ad = await this.prisma.ad.findUnique({
			where: { id: adId },
			select: { id: true, userId: true },
		});
		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}
		if (
			ad.userId !== userId &&
			!this.isPrivileged({ id: userId, role: viewerRole })
		) {
			throw new ForbiddenException(
				'Permissão insuficiente para remover o destaque.',
			);
		}

		const updated = await this.prisma.ad.update({
			where: { id: adId },
			data: { featured: false, featuredUntil: null, featuredAt: null },
			include: AD_INCLUDE,
		});

		await this.invalidateAdCache(adId);

		return updated;
	}

	private async expireStaleFeatured() {
		const now = new Date();
		await this.prisma.ad.updateMany({
			where: {
				featured: true,
				featuredUntil: { lt: now },
			},
			data: { featured: false, featuredUntil: null, featuredAt: null },
		});
	}

	async create(userId: string, viewerRole: string, dto: CreateAdDto) {
		if (!this.isPrivileged({ id: userId, role: viewerRole })) {
			throw new ForbiddenException(
				'Apenas administradores e moderadores podem criar anúncios.',
			);
		}

		if (dto.location) {
			throw new BadRequestException(
				'Localização (proximidade) não está disponível neste momento.',
			);
		}

		await this.assertCategoriesExist(dto.categoryIds);

		const slug = await this.createSlug(dto.slug, dto.title);

		const ad = await this.prisma.ad.create({
			data: {
				id: newId(),
				userId,
				slug,
				title: dto.title,
				description: dto.description,
				price: dto.price,
				image: dto.image,
				imageId: dto.imageId,
				gallery: (dto.gallery ??
					[]) as unknown as Prisma.InputJsonValue,
				categories: {
					connect: dto.categoryIds.map((id) => ({ id })),
				},
			},
			include: AD_INCLUDE,
		});

		return ad;
	}

	async update(
		userId: string,
		viewerRole: string,
		id: string,
		dto: UpdateAdDto,
	) {
		const ad = await this.findOwned(id, userId, viewerRole);

		if (dto.location !== undefined) {
			throw new BadRequestException(
				'Localização (proximidade) não está disponível neste momento.',
			);
		}

		if (dto.categoryIds) {
			await this.assertCategoriesExist(dto.categoryIds);
		}

		const slug = await this.updateSlug(ad, dto);

		const updated = await this.prisma.ad.update({
			where: { id },
			data: {
				slug,
				title: dto.title,
				description: dto.description,
				price: dto.price,
				image: dto.image,
				imageId: dto.imageId,
				gallery:
					dto.gallery !== undefined
						? (dto.gallery as unknown as Prisma.InputJsonValue)
						: undefined,
				...(dto.categoryIds && {
					categories: {
						set: dto.categoryIds.map((id) => ({ id })),
					},
				}),
			},
			include: AD_INCLUDE,
		});

		await this.invalidateAdCache(id);

		await this.enqueueReplacedMedia(ad, dto);

		return updated;
	}

	async setVisibility(
		userId: string,
		viewerRole: string,
		id: string,
		dto: UpdateVisibilityDto,
	) {
		await this.findOwned(id, userId, viewerRole);

		const updated = await this.prisma.ad.update({
			where: { id },
			data: { visibility: dto.visibility },
		});
		await this.invalidateAdCache(id);

		return updated;
	}

	async moderate(id: string, dto: ModerateAdDto) {
		if (dto.verified === undefined && dto.status === undefined) {
			throw new BadRequestException(
				'Informe ao menos verified ou status.',
			);
		}

		const updated = await this.prisma.ad.update({
			where: { id },
			data: {
				verified: dto.verified,
				status: dto.status,
			},
			include: AD_INCLUDE,
		});
		await this.invalidateAdCache(id);

		return updated;
	}

	async remove(userId: string, viewerRole: string, id: string) {
		const ad = await this.findOwned(id, userId, viewerRole, {
			allowAdminOnly: true,
		});

		try {
			await this.prisma.ad.delete({ where: { id: ad.id } });
		} catch (error) {
			if (isPrismaError(error, 'P2003')) {
				throw new ConflictException(
					'Não é possível remover um anúncio que possui conversas.',
				);
			}
			throw error;
		}
		await this.invalidateAdCache(ad.id);
		await this.media.enqueueDeletion(
			this.collectPublicIds(ad.imageId, ad.gallery),
		);
	}

	private async enqueueReplacedMedia(
		ad: {
			imageId: string | null;
			gallery: unknown;
		},
		dto: UpdateAdDto,
	) {
		const oldIds = this.collectPublicIds(ad.imageId, ad.gallery);
		if (oldIds.length === 0) {
			return;
		}

		const kept = new Set<string>();
		if (dto.imageId) {
			kept.add(dto.imageId);
		}
		for (const item of (dto.gallery ?? []) as Array<{
			cloudinaryId?: string;
		}>) {
			if (item.cloudinaryId) {
				kept.add(item.cloudinaryId);
			}
		}

		const orphaned = oldIds.filter((id) => !kept.has(id));
		if (orphaned.length > 0) {
			await this.media.enqueueDeletion(orphaned);
		}
	}

	private collectPublicIds(
		imageId: string | null,
		gallery: unknown,
	): string[] {
		const ids: string[] = [];
		if (imageId) {
			ids.push(imageId);
		}
		if (Array.isArray(gallery)) {
			for (const item of gallery) {
				const rec = item as { cloudinaryId?: string };
				if (rec.cloudinaryId) {
					ids.push(rec.cloudinaryId);
				}
			}
		}
		return ids;
	}

	private async findOwned(
		id: string,
		userId: string,
		viewerRole: string,
		options: { allowAdminOnly?: boolean } = {},
	) {
		const ad = await this.prisma.ad.findUnique({ where: { id } });
		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}

		const isOwner = ad.userId === userId;
		const isModerator = viewerRole === 'MODERATOR';
		const isAdmin = viewerRole === 'ADMIN';
		const allowed = options.allowAdminOnly
			? isOwner || isAdmin
			: isOwner || isModerator || isAdmin;

		if (!allowed) {
			throw new ForbiddenException(
				'Permissão insuficiente para este anúncio.',
			);
		}

		return ad;
	}

	private async assertCategoriesExist(categoryIds: string[]) {
		const unique = Array.from(new Set(categoryIds));
		const found = await this.prisma.category.findMany({
			where: { id: { in: unique }, type: 'AD' },
			select: { id: true },
		});

		if (found.length !== unique.length) {
			throw new BadRequestException(
				'Uma ou mais categorias informadas não existem.',
			);
		}
	}

	private async isSlugTaken(
		slug: string,
		excludeId?: string,
	): Promise<boolean> {
		const existing = await this.prisma.ad.findUnique({
			where: { slug },
			select: { id: true },
		});
		return !!existing && existing.id !== excludeId;
	}

	private async ensureSlugFree(slug: string, excludeId?: string) {
		if (await this.isSlugTaken(slug, excludeId)) {
			throw new ConflictException('Já existe um anúncio com este slug.');
		}
	}

	private async generateUniqueSlug(base: string, excludeId?: string) {
		let slug = base;
		let counter = 1;
		while (await this.isSlugTaken(slug, excludeId)) {
			counter += 1;
			if (counter > 100) {
				throw new BadRequestException(
					'Não foi possível gerar um slug único para o anúncio.',
				);
			}
			slug = `${base}-${counter}`;
		}
		return slug;
	}

	private async createSlug(explicitSlug?: string, title?: string) {
		if (explicitSlug) {
			await this.ensureSlugFree(explicitSlug);
			return explicitSlug;
		}
		const base = slugify(title ?? '');
		if (!base) {
			throw new BadRequestException(
				'Não foi possível gerar um slug a partir do título.',
			);
		}
		return this.generateUniqueSlug(base);
	}

	private async updateSlug(
		ad: { id: string; slug: string },
		dto: UpdateAdDto,
	) {
		if (dto.slug !== undefined) {
			if (dto.slug !== ad.slug) {
				await this.ensureSlugFree(dto.slug, ad.id);
			}
			return dto.slug;
		}
		if (dto.title !== undefined) {
			const base = slugify(dto.title);
			if (!base) {
				throw new BadRequestException(
					'Não foi possível gerar um slug a partir do título.',
				);
			}
			return this.generateUniqueSlug(base, ad.id);
		}
		return ad.slug;
	}

	private async invalidateAdCache(id: string) {
		await this.cache.del(`ad:${id}`);
	}

	private serializeAd(ad: AdDetail): CacheableAd {
		const { price, ...rest } = ad;
		return {
			...rest,
			price: price === null ? null : price.toJSON(),
		};
	}

	private restoreAd(cached: CacheableAd): AdDetail {
		return cached as unknown as AdDetail;
	}

	private toPublicAd(
		ad: {
			id: string;
			slug: string;
			title: string;
			description: string;
			price: Prisma.Decimal | null;
			status: string;
			visibility: string;
			verified: boolean;
			createdAt: Date;
			updatedAt: Date;
			image: string | null;
			imageId: string | null;
			gallery: unknown;
			userId: string;
			averageRating: number | null;
			reviewCount: number;
			featured: boolean;
			featuredUntil: Date | null;
			viewCount: number;
		},
		distanceMeters?: number,
	) {
		return {
			id: ad.id,
			slug: ad.slug,
			title: ad.title,
			description: ad.description,
			price: ad.price === null ? null : ad.price.toNumber(),
			status: ad.status,
			visibility: ad.visibility,
			verified: ad.verified,
			createdAt: ad.createdAt,
			updatedAt: ad.updatedAt,
			image: ad.image,
			imageId: ad.imageId,
			gallery: ad.gallery,
			userId: ad.userId,
			averageRating: ad.averageRating,
			reviewCount: ad.reviewCount,
			featured: ad.featured,
			featuredUntil: ad.featuredUntil,
			views: ad.viewCount,
			distanceKm:
				distanceMeters === undefined
					? undefined
					: Math.round((distanceMeters / 100) * 10) / 100,
		};
	}
}
