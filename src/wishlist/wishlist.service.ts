import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { newId } from '../libs/id';
import { AddWishlistDto, WishlistQueryDto } from './wishlist.dto';

const AD_SELECT = {
	id: true,
	slug: true,
	title: true,
	description: true,
	price: true,
	type: true,
	status: true,
	visibility: true,
	verified: true,
	image: true,
	imageId: true,
	userId: true,
	createdAt: true,
	updatedAt: true,
	averageRating: true,
	reviewCount: true,
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

@Injectable()
export class WishlistService {
	constructor(private readonly prisma: PrismaService) {}

	async add(userId: string, dto: AddWishlistDto) {
		const ad = await this.prisma.ad.findUnique({
			where: { id: dto.adId },
			select: { id: true, status: true, visibility: true, userId: true },
		});
		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}
		if (ad.status !== 'ACTIVE' || ad.visibility !== 'VISIBLE') {
			throw new BadRequestException('Este anúncio não está disponível.');
		}

		const existing = await this.prisma.wishlistItem.findUnique({
			where: { userId_adId: { userId, adId: ad.id } },
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(
				'Este anúncio já está na sua lista de desejos.',
			);
		}

		const item = await this.prisma.wishlistItem.create({
			data: { id: newId(), userId, adId: ad.id },
		});

		return { id: item.id };
	}

	async list(userId: string, query: WishlistQueryDto) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Prisma.WishlistItemWhereInput = { userId };

		const [total, items] = await Promise.all([
			this.prisma.wishlistItem.count({ where }),
			this.prisma.wishlistItem.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: { ad: { select: AD_SELECT } },
			}),
		]);

		return {
			items: items.map((item) => ({
				id: item.id,
				createdAt: item.createdAt,
				ad: this.toPublicAd(item.ad),
			})),
			total,
			page,
			limit,
		};
	}

	async check(userId: string, adId: string) {
		const item = await this.prisma.wishlistItem.findUnique({
			where: { userId_adId: { userId, adId } },
			select: { id: true },
		});
		return { saved: !!item };
	}

	async remove(userId: string, adId: string) {
		const item = await this.prisma.wishlistItem.findUnique({
			where: { userId_adId: { userId, adId } },
			select: { id: true },
		});
		if (!item) {
			throw new NotFoundException(
				'Este anúncio não está na sua lista de desejos.',
			);
		}
		await this.prisma.wishlistItem.delete({ where: { id: item.id } });
	}

	private toPublicAd(ad: {
		id: string;
		slug: string;
		title: string;
		description: string;
		price: Prisma.Decimal | null;
		type: string;
		status: string;
		visibility: string;
		verified: boolean;
		image: string | null;
		imageId: string | null;
		userId: string;
		createdAt: Date;
		updatedAt: Date;
		averageRating: number | null;
		reviewCount: number;
		user: {
			id: string;
			name: string;
			surname: string | null;
			image: string | null;
			trustScore: number | null;
			isVerified: boolean;
		};
	}) {
		return {
			id: ad.id,
			slug: ad.slug,
			title: ad.title,
			description: ad.description,
			price: ad.price === null ? null : ad.price.toNumber(),
			type: ad.type,
			status: ad.status,
			visibility: ad.visibility,
			verified: ad.verified,
			image: ad.image,
			imageId: ad.imageId,
			userId: ad.userId,
			createdAt: ad.createdAt,
			updatedAt: ad.updatedAt,
			averageRating: ad.averageRating,
			reviewCount: ad.reviewCount,
			user: ad.user,
		};
	}
}
