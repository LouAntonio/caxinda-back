import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { buildPagination, paginate } from '../common/dto/paginated-result.dto';
import { newId } from '../libs/id';
import {
	CreateReviewDto,
	RespondReviewDto,
	ReviewSessionUser,
	ReviewsQueryDto,
} from './reviews.dto';

const REVIEW_INCLUDE = {
	reviewer: {
		select: { id: true, name: true, surname: true, image: true },
	},
	reviewee: {
		select: { id: true, name: true, surname: true, image: true },
	},
	ad: {
		select: {
			id: true,
			title: true,
			slug: true,
			image: true,
			price: true,
		},
	},
	business: {
		select: {
			id: true,
			slug: true,
			name: true,
			coverUrl: true,
		},
	},
} as const;

const USER_SELECT = {
	receivedReviews: {
		select: { rating: true },
	},
} as const;

@Injectable()
export class ReviewsService {
	constructor(private readonly prisma: PrismaService) {}

	private isPrivileged(user?: ReviewSessionUser): boolean {
		return user?.role === 'ADMIN' || user?.role === 'MODERATOR';
	}

	async create(reviewerId: string, dto: CreateReviewDto) {
		if (Boolean(dto.adId) === Boolean(dto.businessId)) {
			throw new BadRequestException(
				'Informe adId ou businessId (apenas um deles).',
			);
		}

		if (dto.adId) {
			return this.createAdReview(reviewerId, dto);
		}
		return this.createBusinessReview(reviewerId, dto);
	}

	private async createAdReview(reviewerId: string, dto: CreateReviewDto) {
		const ad = await this.prisma.ad.findUnique({
			where: { id: dto.adId },
			select: { id: true, userId: true },
		});
		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}
		if (ad.userId === reviewerId) {
			throw new BadRequestException(
				'Não é possível avaliar o seu próprio anúncio.',
			);
		}

		const existing = await this.prisma.review.findUnique({
			where: { reviewerId_adId: { reviewerId, adId: ad.id } },
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException('Você já avaliou este anúncio.');
		}

		const review = await this.prisma.review.create({
			data: {
				id: newId(),
				rating: dto.rating,
				comment: dto.comment?.trim() || null,
				adId: ad.id,
				reviewerId,
				revieweeId: ad.userId,
			},
			include: REVIEW_INCLUDE,
		});

		await this.refreshAdRating(ad.id);
		await this.refreshTrustScore(ad.userId);

		return this.toPublicReview(review);
	}

	private async createBusinessReview(
		reviewerId: string,
		dto: CreateReviewDto,
	) {
		const business = await this.prisma.business.findUnique({
			where: { id: dto.businessId },
			select: { id: true, ownerId: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (business.ownerId === reviewerId) {
			throw new BadRequestException(
				'Não é possível avaliar a sua própria empresa.',
			);
		}

		const existing = await this.prisma.review.findUnique({
			where: {
				reviewerId_businessId: {
					reviewerId,
					businessId: business.id,
				},
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException('Você já avaliou esta empresa.');
		}

		const review = await this.prisma.review.create({
			data: {
				id: newId(),
				rating: dto.rating,
				comment: dto.comment?.trim() || null,
				businessId: business.id,
				reviewerId,
				revieweeId: business.ownerId,
			},
			include: REVIEW_INCLUDE,
		});

		await this.refreshTrustScore(business.ownerId);

		return this.toPublicReview(review);
	}

	async list(query: ReviewsQueryDto) {
		const { page, limit, skip, take } = buildPagination(
			query.page,
			query.limit,
		);
		const where: Prisma.ReviewWhereInput = {
			...(query.adId && { adId: query.adId }),
			...(query.businessId && { businessId: query.businessId }),
			...(query.revieweeId && { revieweeId: query.revieweeId }),
		};

		const [total, reviews] = await Promise.all([
			this.prisma.review.count({ where }),
			this.prisma.review.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take,
				include: REVIEW_INCLUDE,
			}),
		]);

		return paginate(
			reviews.map((review) => this.toPublicReview(review)),
			total,
			{ page, limit },
		);
	}

	async respond(
		responderId: string,
		reviewId: string,
		dto: RespondReviewDto,
	) {
		const review = await this.prisma.review.findUnique({
			where: { id: reviewId },
			select: {
				id: true,
				ad: {
					select: { userId: true },
				},
				business: {
					select: { ownerId: true },
				},
			},
		});
		if (!review) {
			throw new NotFoundException('Avaliação não encontrada.');
		}
		const ownerId = review.ad?.userId ?? review.business?.ownerId;
		if (ownerId !== responderId) {
			throw new ForbiddenException(
				'Apenas o dono do anúncio ou da empresa pode responder a esta avaliação.',
			);
		}

		const updated = await this.prisma.review.update({
			where: { id: reviewId },
			data: { response: dto.response.trim() },
			include: REVIEW_INCLUDE,
		});

		return this.toPublicReview(updated);
	}

	async remove(user: ReviewSessionUser, reviewId: string) {
		const review = await this.prisma.review.findUnique({
			where: { id: reviewId },
			select: {
				id: true,
				reviewerId: true,
				adId: true,
				businessId: true,
				revieweeId: true,
			},
		});
		if (!review) {
			throw new NotFoundException('Avaliação não encontrada.');
		}
		if (review.reviewerId !== user.id && !this.isPrivileged(user)) {
			throw new ForbiddenException(
				'Você não tem permissão para remover esta avaliação.',
			);
		}

		await this.prisma.review.delete({ where: { id: reviewId } });
		if (review.adId) {
			await this.refreshAdRating(review.adId);
		}
		await this.refreshTrustScore(review.revieweeId);
	}

	private async refreshAdRating(adId: string) {
		const agg = await this.prisma.review.aggregate({
			where: { adId },
			_avg: { rating: true },
			_count: true,
		});
		await this.prisma.ad.update({
			where: { id: adId },
			data: {
				averageRating: agg._avg.rating ?? null,
				reviewCount: agg._count,
			},
		});
	}

	private async refreshTrustScore(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: USER_SELECT,
		});
		if (!user) {
			return;
		}
		const ratings = user.receivedReviews.map((review) => review.rating);
		if (ratings.length === 0) {
			return;
		}
		const avg =
			ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
		await this.prisma.user.update({
			where: { id: userId },
			data: { trustScore: avg },
		});
	}

	private toPublicReview(review: {
		id: string;
		rating: number;
		comment: string | null;
		response: string | null;
		createdAt: Date;
		reviewer: {
			id: string;
			name: string;
			surname: string | null;
			image: string | null;
		};
		reviewee: {
			id: string;
			name: string;
			surname: string | null;
			image: string | null;
		};
		ad: {
			id: string;
			title: string;
			slug: string;
			image: string | null;
			price: Prisma.Decimal | null;
		} | null;
		business: {
			id: string;
			slug: string;
			name: string;
			coverUrl: string | null;
		} | null;
	}) {
		return {
			id: review.id,
			rating: review.rating,
			comment: review.comment,
			response: review.response,
			createdAt: review.createdAt,
			reviewer: review.reviewer,
			reviewee: review.reviewee,
			ad: review.ad
				? {
						...review.ad,
						price:
							review.ad.price === null
								? null
								: review.ad.price.toNumber(),
					}
				: null,
			business: review.business,
		};
	}
}
