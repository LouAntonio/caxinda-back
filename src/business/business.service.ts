import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { Province } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { buildPagination, paginate } from '../common/dto/paginated-result.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { PaymentsService } from '../payments/payments.service';
import { newId } from '../libs/id';
import { buildSearchOR } from '../common/helpers/search.helper';
import { slugify } from '../categories/categories.service';
import {
	BusinessesQueryDto,
	CreateBusinessDto,
	ModerateBusinessDto,
	UpdateBusinessDto,
	UpdateBusinessStatusDto,
} from './business.dto';

const BUSINESS_INCLUDE = {
	owner: {
		select: {
			id: true,
			name: true,
			surname: true,
			image: true,
			isVerified: true,
		},
	},
	category: {
		select: {
			id: true,
			slug: true,
			name: true,
		},
	},
	_count: { select: { reviews: true } },
} as const;

type BusinessWithInclude = Prisma.BusinessGetPayload<{
	include: typeof BUSINESS_INCLUDE;
}>;

export interface BusinessSessionUser {
	id: string;
	role: string;
}

const FEATURED_DURATION_DAYS = 30;

function isUniqueViolation(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2002'
	);
}

@Injectable()
export class BusinessesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly paymentsService: PaymentsService,
		private readonly analytics: AnalyticsService,
	) {}

	async listPublic(query: BusinessesQueryDto, viewer?: BusinessSessionUser) {
		await this.paymentsService.expireStaleSubscriptions();
		const { page, limit, skip, take } = buildPagination(
			query.page,
			query.limit,
		);
		const privileged = this.isPrivileged(viewer);

		const provinces = query.provinces
			? query.provinces
					.split(',')
					.map((p) => p.trim())
					.filter(Boolean)
			: [];
		const categoryIds = query.categoryIds
			? query.categoryIds
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			: [];

		const where: Prisma.BusinessWhereInput = {
			...(query.ownerId && { ownerId: query.ownerId }),
			...(query.province && { province: query.province }),
			...(provinces.length > 0 && {
				province: { in: provinces as Province[] },
			}),
			...(query.categoryId && { categoryId: query.categoryId }),
			...(categoryIds.length > 0 && { categoryId: { in: categoryIds } }),
			...(query.q && {
				OR: buildSearchOR(['name', 'description', 'phone'], query.q),
			}),
			// Ocultas ficam visíveis apenas para donos (na sua própria listagem)
			// e utilizadores privilegiados.
			...(!privileged &&
				!(viewer?.id && query.ownerId === viewer.id) && {
					status: 'SHOW',
				}),
		};

		const [total, businesses] = await Promise.all([
			this.prisma.business.count({ where }),
			this.prisma.business.findMany({
				where,
				orderBy: this.orderBy(query.sortBy),
				skip,
				take,
				include: BUSINESS_INCLUDE,
			}),
		]);

		return paginate(await this.toPublicBusinesses(businesses), total, {
			page,
			limit,
		});
	}

	async getBySlug(slug: string, viewer?: BusinessSessionUser) {
		await this.paymentsService.expireStaleSubscriptions();
		const business = await this.prisma.business.findUnique({
			where: { slug },
			include: BUSINESS_INCLUDE,
		});
		if (!business || !this.canView(business, viewer)) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (
			business.status === 'SHOW' &&
			viewer?.id !== business.ownerId &&
			!this.isPrivileged(viewer)
		) {
			void this.analytics.trackView('BUSINESS', business.id, viewer);
		}
		const [item] = await this.toPublicBusinesses([business]);
		return item;
	}

	async getById(id: string, viewer?: BusinessSessionUser) {
		await this.paymentsService.expireStaleSubscriptions();
		const business = await this.prisma.business.findUnique({
			where: { id },
			include: BUSINESS_INCLUDE,
		});
		if (!business || !this.canView(business, viewer)) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (
			business.status === 'SHOW' &&
			viewer?.id !== business.ownerId &&
			!this.isPrivileged(viewer)
		) {
			void this.analytics.trackView('BUSINESS', business.id, viewer);
		}
		const [item] = await this.toPublicBusinesses([business]);
		return item;
	}

	async create(userId: string, role: string, dto: CreateBusinessDto) {
		if (!this.canManage(role)) {
			throw new ForbiddenException('Permissão insuficiente.');
		}

		if (!this.isPrivileged({ id: userId, role })) {
			await this.assertApprovedKyc(userId);
		}

		const slug = dto.slug ?? slugify(dto.name);
		if (!slug) {
			throw new BadRequestException(
				'Nome inválido para gerar um slug para a empresa.',
			);
		}

		await this.assertBusinessCategory(dto.categoryId);

		const existing = await this.prisma.business.findUnique({
			where: { slug },
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException('Já existe uma empresa com este slug.');
		}

		try {
			const created = await this.prisma.business.create({
				data: {
					id: newId(),
					ownerId: userId,
					name: dto.name,
					slug,
					description: dto.description,
					address: dto.address,
					province: dto.province,
					phone: dto.phone,
					whatsapp: dto.whatsapp,
					email: dto.email,
					website: dto.website,
					logoUrl: dto.logoUrl,
					logoId: dto.logoId,
					coverUrl: dto.coverUrl,
					coverId: dto.coverId,
					gallery: (dto.gallery ??
						[]) as unknown as Prisma.InputJsonValue,
					categoryId: dto.categoryId,
				},
				include: BUSINESS_INCLUDE,
			});
			const [item] = await this.toPublicBusinesses([created]);
			return item;
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(
					'Já existe uma empresa com este slug.',
				);
			}
			throw error;
		}
	}

	async update(
		userId: string,
		role: string,
		id: string,
		dto: UpdateBusinessDto,
	) {
		const business = await this.prisma.business.findUnique({
			where: { id },
			select: { id: true, ownerId: true, slug: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (!this.isOwnerOrPrivileged(business, userId, role)) {
			throw new ForbiddenException(
				'Sem permissão para editar esta empresa.',
			);
		}

		const slug = dto.slug ?? (dto.name ? slugify(dto.name) : undefined);
		if (slug && slug !== business.slug) {
			const existing = await this.prisma.business.findUnique({
				where: { slug },
				select: { id: true },
			});
			if (existing && existing.id !== business.id) {
				throw new ConflictException(
					'Já existe uma empresa com este slug.',
				);
			}
		}

		if (dto.categoryId) {
			await this.assertBusinessCategory(dto.categoryId);
		}

		try {
			const updated = await this.prisma.business.update({
				where: { id },
				data: {
					name: dto.name,
					slug,
					description: dto.description,
					address: dto.address,
					province: dto.province,
					phone: dto.phone,
					whatsapp: dto.whatsapp,
					email: dto.email,
					website: dto.website,
					logoUrl: dto.logoUrl,
					logoId: dto.logoId,
					coverUrl: dto.coverUrl,
					coverId: dto.coverId,
					gallery: dto.gallery as unknown as
						Prisma.InputJsonValue | undefined,
					categoryId: dto.categoryId,
				},
				include: BUSINESS_INCLUDE,
			});
			const [item] = await this.toPublicBusinesses([updated]);
			return item;
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(
					'Já existe uma empresa com este slug.',
				);
			}
			throw error;
		}
	}

	async setStatus(
		userId: string,
		role: string,
		id: string,
		dto: UpdateBusinessStatusDto,
	) {
		const business = await this.prisma.business.findUnique({
			where: { id },
			select: { id: true, ownerId: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (!this.isOwnerOrPrivileged(business, userId, role)) {
			throw new ForbiddenException(
				'Sem permissão para alterar o estado desta empresa.',
			);
		}

		const updated = await this.prisma.business.update({
			where: { id },
			data: { status: dto.status },
			include: BUSINESS_INCLUDE,
		});
		const [item] = await this.toPublicBusinesses([updated]);
		return item;
	}

	async moderate(id: string, dto: ModerateBusinessDto) {
		const business = await this.prisma.business.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}

		const updated = await this.prisma.business.update({
			where: { id },
			data: {
				isVerified: dto.isVerified,
				status: dto.status,
			},
			include: BUSINESS_INCLUDE,
		});
		const [item] = await this.toPublicBusinesses([updated]);
		return item;
	}

	async remove(userId: string, role: string, id: string) {
		const business = await this.prisma.business.findUnique({
			where: { id },
			select: { id: true, ownerId: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (!this.isOwnerOrPrivileged(business, userId, role)) {
			throw new ForbiddenException(
				'Sem permissão para remover esta empresa.',
			);
		}
		await this.prisma.business.delete({ where: { id } });
	}

	private async assertBusinessCategory(categoryId: string) {
		const category = await this.prisma.category.findUnique({
			where: { id: categoryId },
			select: { id: true, type: true },
		});
		if (!category || category.type !== 'BUSINESS') {
			throw new BadRequestException('Categoria de empresa inválida.');
		}
	}

	private isPrivileged(user?: BusinessSessionUser): boolean {
		return user?.role === 'ADMIN' || user?.role === 'MODERATOR';
	}

	private canManage(role: string): boolean {
		return role === 'ADMIN' || role === 'MODERATOR' || role === 'PROMOTER';
	}

	private async assertApprovedKyc(userId: string): Promise<void> {
		const kyc = await this.prisma.kYC.findUnique({
			where: { userId },
			select: { status: true },
		});
		if (kyc?.status !== 'APPROVED') {
			throw new ForbiddenException(
				'É necessário ter o KYC aprovado para registar empresas.',
			);
		}
	}

	private isOwnerOrPrivileged(
		business: { ownerId: string },
		userId: string,
		role: string,
	): boolean {
		return (
			business.ownerId === userId ||
			this.isPrivileged({ id: userId, role })
		);
	}

	async feature(
		userId: string,
		viewerRole: string,
		businessId: string,
		endDate?: string,
	) {
		const privileged = this.isPrivileged({ id: userId, role: viewerRole });
		const business = await this.prisma.business.findUnique({
			where: { id: businessId },
			select: {
				id: true,
				ownerId: true,
				status: true,
				featured: true,
				featuredUntil: true,
			},
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (business.ownerId !== userId && !privileged) {
			throw new ForbiddenException(
				'Você só pode destacar as suas próprias empresas.',
			);
		}
		if (business.status !== 'SHOW') {
			throw new BadRequestException(
				'Uma empresa só pode ser destacada quando está visível.',
			);
		}
		if (
			business.featured &&
			business.featuredUntil &&
			business.featuredUntil > new Date()
		) {
			throw new ConflictException('Esta empresa já está em destaque.');
		}

		await this.expireStaleFeaturedBusinesses();

		if (!privileged) {
			await this.assertBusinessFeatureQuota(userId, businessId);
		}

		const now = new Date();
		const featuredUntil = this.resolveFeatureDate(endDate);

		const updated = await this.prisma.business.update({
			where: { id: businessId },
			data: { featured: true, featuredUntil, featuredAt: now },
			include: BUSINESS_INCLUDE,
		});

		return this.toPublicBusiness(updated);
	}

	private resolveFeatureDate(endDate?: string): Date {
		if (!endDate) {
			return new Date(
				Date.now() + FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000,
			);
		}
		const end = new Date(endDate);
		if (Number.isNaN(end.getTime())) {
			throw new BadRequestException('endDate deve ser uma data válida.');
		}
		const diffDays = Math.ceil(
			(end.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
		);
		if (diffDays < 1) {
			throw new BadRequestException(
				'A data de término do destaque deve estar no futuro.',
			);
		}
		if (diffDays > 90) {
			throw new BadRequestException(
				'O destaque não pode exceder 90 dias.',
			);
		}
		return end;
	}

	async unfeature(userId: string, viewerRole: string, businessId: string) {
		const business = await this.prisma.business.findUnique({
			where: { id: businessId },
			select: { id: true, ownerId: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (
			business.ownerId !== userId &&
			!this.isPrivileged({ id: userId, role: viewerRole })
		) {
			throw new ForbiddenException(
				'Permissão insuficiente para remover o destaque.',
			);
		}

		const updated = await this.prisma.business.update({
			where: { id: businessId },
			data: { featured: false, featuredUntil: null, featuredAt: null },
			include: BUSINESS_INCLUDE,
		});

		return this.toPublicBusiness(updated);
	}

	private async expireStaleFeaturedBusinesses() {
		const now = new Date();
		await this.prisma.business.updateMany({
			where: { featured: true, featuredUntil: { lt: now } },
			data: { featured: false, featuredUntil: null, featuredAt: null },
		});
	}

	private async assertBusinessFeatureQuota(
		userId: string,
		businessId: string,
	): Promise<void> {
		const now = new Date();
		const [subscription, activeFeatured, quotaRows] = await Promise.all([
			this.prisma.subscription.findFirst({
				where: {
					businessId,
					userId,
					status: 'ACTIVE',
					endDate: { gt: now },
				},
				orderBy: { endDate: 'desc' },
				select: { plan: { select: { featuredAdsLimit: true } } },
			}),
			this.prisma.business.count({
				where: {
					ownerId: userId,
					featured: true,
					featuredUntil: { gt: now },
				},
			}),
			this.prisma.subscription.findMany({
				where: {
					userId,
					status: 'ACTIVE',
					endDate: { gt: now },
					plan: { featuredAdsLimit: { gt: 0 } },
				},
				select: { plan: { select: { featuredAdsLimit: true } } },
			}),
		]);
		if (!subscription || subscription.plan.featuredAdsLimit <= 0) {
			throw new ForbiddenException(
				'Esta empresa não tem um plano ativo que inclua destaque.',
			);
		}
		const quota = quotaRows.reduce(
			(sum, row) => sum + row.plan.featuredAdsLimit,
			0,
		);
		if (activeFeatured >= quota) {
			throw new ConflictException(
				'Atingiste o limite de empresas em destaque do teu plano.',
			);
		}
	}

	private canView(
		business: { ownerId: string; status: string },
		viewer?: BusinessSessionUser,
	): boolean {
		if (business.status === 'SHOW') {
			return true;
		}
		return this.isPrivileged(viewer) || business.ownerId === viewer?.id;
	}

	private orderBy(
		sortBy?: string,
	): Prisma.BusinessOrderByWithRelationInput[] {
		const sort: Prisma.BusinessOrderByWithRelationInput[] = [
			{ featured: 'desc' },
		];
		switch (sortBy) {
			case 'name_asc':
				sort.push({ name: 'asc' });
				break;
			case 'name_desc':
				sort.push({ name: 'desc' });
				break;
			case 'oldest':
				sort.push({ createdAt: 'asc' });
				break;
			default:
				sort.push({ createdAt: 'desc' });
				break;
		}
		return sort;
	}

	private async toPublicBusinesses(
		items: BusinessWithInclude[],
	): Promise<PublicBusiness[]> {
		if (items.length === 0) {
			return [];
		}

		const agg = await this.prisma.review.groupBy({
			by: ['businessId'],
			where: { businessId: { in: items.map((item) => item.id) } },
			_avg: { rating: true },
			_count: { _all: true },
		});
		const stats = new Map<
			string,
			{ averageRating: number | null; reviewCount: number }
		>();
		for (const row of agg) {
			if (row.businessId) {
				stats.set(row.businessId, {
					averageRating: row._avg.rating ?? null,
					reviewCount: row._count._all,
				});
			}
		}

		return items.map((item) =>
			this.toPublicBusiness(item, stats.get(item.id)),
		);
	}

	private toPublicBusiness(
		business: BusinessWithInclude,
		stats?: { averageRating: number | null; reviewCount: number },
	): PublicBusiness {
		return {
			id: business.id,
			slug: business.slug,
			name: business.name,
			description: business.description,
			address: business.address,
			province: business.province,
			phone: business.phone,
			whatsapp: business.whatsapp,
			email: business.email,
			website: business.website,
			logoUrl: business.logoUrl,
			logoId: business.logoId,
			coverUrl: business.coverUrl,
			coverId: business.coverId,
			gallery: (business.gallery as unknown as GalleryItem[]) ?? [],
			category: business.category,
			owner: business.owner,
			isVerified: business.isVerified,
			status: business.status,
			viewCount: business.viewCount,
			clickCount: business.clickCount,
			featured: business.featured,
			featuredUntil: business.featuredUntil,
			reviewCount: stats?.reviewCount ?? business._count.reviews,
			averageRating: stats?.averageRating ?? null,
			createdAt: business.createdAt,
			updatedAt: business.updatedAt,
		};
	}
}

interface GalleryItem {
	url: string;
	cloudinaryId: string;
	type?: string;
}

export interface PublicBusiness {
	id: string;
	slug: string;
	name: string;
	description: string;
	address: string | null;
	province: string;
	phone: string;
	whatsapp: string | null;
	email: string | null;
	website: string | null;
	logoUrl: string | null;
	logoId: string | null;
	coverUrl: string | null;
	coverId: string | null;
	gallery: GalleryItem[];
	category: {
		id: string;
		slug: string;
		name: string;
	};
	owner: {
		id: string;
		name: string;
		surname: string | null;
		image: string | null;
		isVerified: boolean;
	};
	isVerified: boolean;
	status: string;
	viewCount: number;
	clickCount: number;
	featured: boolean;
	featuredUntil: Date | null;
	reviewCount: number;
	averageRating: number | null;
	createdAt: Date;
	updatedAt: Date;
}
