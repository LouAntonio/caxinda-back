import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { Prisma } from '../generated/prisma/client';
import { ReviewsService } from './reviews.service';

const AD_SEL = {
	id: 'ad-1',
	userId: 'owner-1',
	title: 'iPhone 12',
	slug: 'iphone-12',
	image: null,
	price: new Prisma.Decimal('100.5'),
};

describe('ReviewsService', () => {
	let service: ReviewsService;
	let prisma: {
		ad: { findUnique: jest.Mock; update: jest.Mock };
		review: {
			findUnique: jest.Mock;
			create: jest.Mock;
			findMany: jest.Mock;
			update: jest.Mock;
			delete: jest.Mock;
			aggregate: jest.Mock;
			count: jest.Mock;
		};
		user: {
			findUnique: jest.Mock;
			update: jest.Mock;
		};
		$transaction: jest.Mock;
	};

	const reviewer = {
		id: 'rev-1',
		name: 'João',
		surname: 'Silva',
		image: null,
	};
	const reviewee = {
		id: 'owner-1',
		name: 'Maria',
		surname: 'Santos',
		image: null,
	};

	beforeEach(async () => {
		prisma = {
			ad: { findUnique: jest.fn(), update: jest.fn() },
			review: {
				findUnique: jest.fn(),
				create: jest.fn(),
				findMany: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
				aggregate: jest.fn(),
				count: jest.fn(),
			},
			user: { findUnique: jest.fn(), update: jest.fn() },
			$transaction: jest.fn((tx: Promise<unknown>[]) => Promise.all(tx)),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				ReviewsService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(ReviewsService);
	});

	describe('create', () => {
		it('404 para anúncio inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(
				service.create('rev-1', { adId: 'ad-1', rating: 5 }),
			).rejects.toThrow(NotFoundException);
		});

		it('400 ao avaliar o próprio anúncio', async () => {
			prisma.ad.findUnique.mockResolvedValue(AD_SEL);

			await expect(
				service.create('owner-1', { adId: 'ad-1', rating: 5 }),
			).rejects.toThrow(BadRequestException);
		});

		it('409 se já avaliou o mesmo anúncio', async () => {
			prisma.ad.findUnique.mockResolvedValue(AD_SEL);
			prisma.review.findUnique.mockResolvedValue({ id: 'r-1' });

			await expect(
				service.create('rev-1', { adId: 'ad-1', rating: 5 }),
			).rejects.toThrow(ConflictException);
		});

		it('cria review e atualiza rating/trustScore', async () => {
			prisma.ad.findUnique.mockResolvedValue(AD_SEL);
			prisma.review.findUnique.mockResolvedValue(null);
			const created = {
				id: 'r-new',
				rating: 5,
				comment: 'Bom',
				response: null,
				createdAt: new Date(),
				reviewer,
				reviewee,
				ad: AD_SEL,
			};
			prisma.review.create.mockResolvedValue(created);
			prisma.review.aggregate.mockResolvedValue({
				_avg: { rating: 4.5 },
				_count: 2,
			});
			prisma.user.findUnique.mockResolvedValue({
				receivedReviews: [{ rating: 5 }, { rating: 4 }],
			});

			const result = await service.create('rev-1', {
				adId: 'ad-1',
				rating: 5,
				comment: 'Bom',
			});

			expect(result.id).toBe('r-new');
			expect(prisma.ad.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'ad-1' },
					data: { averageRating: 4.5, reviewCount: 2 },
				}),
			);
			expect(prisma.user.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'owner-1' },
					data: { trustScore: 4.5 },
				}),
			);
		});
	});

	describe('list', () => {
		it('retorna paginado com filtros', async () => {
			const review = {
				id: 'r-1',
				rating: 5,
				comment: 'Bom',
				response: null,
				createdAt: new Date(),
				reviewer,
				reviewee,
				ad: AD_SEL,
			};
			prisma.review.count.mockResolvedValue(1);
			prisma.review.findMany.mockResolvedValue([review]);

			const result = await service.list({
				adId: 'ad-1',
				page: 1,
				limit: 20,
			});

			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].ad.price).toBe(100.5);
			expect(prisma.review.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ adId: 'ad-1' }),
				}),
			);
		});
	});

	describe('respond', () => {
		it('404 para review inexistente', async () => {
			prisma.review.findUnique.mockResolvedValue(null);

			await expect(
				service.respond('owner-1', 'r-1', { response: 'Obrigado' }),
			).rejects.toThrow(NotFoundException);
		});

		it('403 se não é o dono do anúncio', async () => {
			prisma.review.findUnique.mockResolvedValue({
				id: 'r-1',
				ad: { userId: 'other-owner' },
			});

			await expect(
				service.respond('not-owner', 'r-1', { response: 'Obrigado' }),
			).rejects.toThrow(ForbiddenException);
		});

		it('atualiza resposta (upsert)', async () => {
			prisma.review.findUnique.mockResolvedValue({
				id: 'r-1',
				ad: { userId: 'owner-1' },
			});
			prisma.review.update.mockResolvedValue({
				id: 'r-1',
				rating: 5,
				comment: 'Bom',
				response: 'Obrigado',
				createdAt: new Date(),
				reviewer,
				reviewee,
				ad: AD_SEL,
			});

			const result = await service.respond('owner-1', 'r-1', {
				response: 'Obrigado',
			});

			expect(result.response).toBe('Obrigado');
			expect(prisma.review.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'r-1' },
					data: { response: 'Obrigado' },
				}),
			);
		});
	});

	describe('remove', () => {
		it('404 para review inexistente', async () => {
			prisma.review.findUnique.mockResolvedValue(null);

			await expect(
				service.remove({ id: 'rev-1', role: 'USER' }, 'r-1'),
			).rejects.toThrow(NotFoundException);
		});

		it('403 para não-autor não-privilegiado', async () => {
			prisma.review.findUnique.mockResolvedValue({
				id: 'r-1',
				reviewerId: 'someone-else',
				adId: 'ad-1',
				revieweeId: 'owner-1',
			});

			await expect(
				service.remove({ id: 'rev-1', role: 'USER' }, 'r-1'),
			).rejects.toThrow(ForbiddenException);
		});

		it('autor pode remover', async () => {
			prisma.review.findUnique.mockResolvedValue({
				id: 'r-1',
				reviewerId: 'rev-1',
				adId: 'ad-1',
				revieweeId: 'owner-1',
			});
			prisma.review.delete.mockResolvedValue({});
			prisma.review.aggregate.mockResolvedValue({
				_avg: { rating: null },
				_count: 0,
			});

			await service.remove({ id: 'rev-1', role: 'USER' }, 'r-1');

			expect(prisma.review.delete).toHaveBeenCalledWith({
				where: { id: 'r-1' },
			});
		});
	});
});
