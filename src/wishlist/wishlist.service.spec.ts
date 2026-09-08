import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { Prisma } from '../generated/prisma/client';
import { WishlistService } from './wishlist.service';

describe('WishlistService', () => {
	let service: WishlistService;
	let prisma: {
		ad: { findUnique: jest.Mock };
		wishlistItem: {
			findUnique: jest.Mock;
			create: jest.Mock;
			findMany: jest.Mock;
			delete: jest.Mock;
			count: jest.Mock;
		};
		$transaction: jest.Mock;
	};

	beforeEach(async () => {
		prisma = {
			ad: { findUnique: jest.fn() },
			wishlistItem: {
				findUnique: jest.fn(),
				create: jest.fn(),
				findMany: jest.fn(),
				delete: jest.fn(),
				count: jest.fn(),
			},
			$transaction: jest.fn((tx: Promise<unknown>[]) => Promise.all(tx)),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				WishlistService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(WishlistService);
	});

	describe('add', () => {
		it('404 para ad inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(service.add('u1', { adId: 'ad-1' })).rejects.toThrow(
				NotFoundException,
			);
		});

		it('400 para ad não ativo/visível', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				id: 'ad-1',
				status: 'ARCHIVED',
				visibility: 'VISIBLE',
				userId: 'owner',
			});

			await expect(service.add('u1', { adId: 'ad-1' })).rejects.toThrow(
				BadRequestException,
			);
		});

		it('409 se já está na lista', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				id: 'ad-1',
				status: 'ACTIVE',
				visibility: 'VISIBLE',
				userId: 'owner',
			});
			prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'w-1' });

			await expect(service.add('u1', { adId: 'ad-1' })).rejects.toThrow(
				ConflictException,
			);
		});

		it('cria item com sucesso', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				id: 'ad-1',
				status: 'ACTIVE',
				visibility: 'VISIBLE',
				userId: 'owner',
			});
			prisma.wishlistItem.findUnique.mockResolvedValue(null);
			prisma.wishlistItem.create.mockResolvedValue({ id: 'w-new' });

			const result = await service.add('u1', { adId: 'ad-1' });

			expect(result.id).toBe('w-new');
			expect(prisma.wishlistItem.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						userId: 'u1',
						adId: 'ad-1',
					}),
				}),
			);
		});
	});

	describe('list', () => {
		it('retorna itens paginados com ad', async () => {
			prisma.wishlistItem.count.mockResolvedValue(1);
			prisma.wishlistItem.findMany.mockResolvedValue([
				{
					id: 'w-1',
					createdAt: new Date(),
					ad: {
						id: 'ad-1',
						slug: 'iphone',
						title: 'iPhone',
						description: 'd',
						price: new Prisma.Decimal('900'),
						type: 'SALE',
						status: 'ACTIVE',
						visibility: 'VISIBLE',
						verified: true,
						image: null,
						imageId: null,
						userId: 'owner',
						createdAt: new Date(),
						updatedAt: new Date(),
						averageRating: 4.5,
						reviewCount: 3,
						user: {
							id: 'owner',
							name: 'Maria',
							surname: null,
							image: null,
							trustScore: 4.8,
							isVerified: true,
						},
					},
				},
			]);

			const result = await service.list('u1', { page: 1, limit: 20 });

			expect(result.total).toBe(1);
			expect(result.items[0].ad.price).toBe(900);
			expect(result.items[0].ad.averageRating).toBe(4.5);
		});
	});

	describe('check', () => {
		it('retorna true se salvo', async () => {
			prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'w-1' });

			const result = await service.check('u1', 'ad-1');

			expect(result.saved).toBe(true);
		});

		it('retorna false se não salvo', async () => {
			prisma.wishlistItem.findUnique.mockResolvedValue(null);

			const result = await service.check('u1', 'ad-1');

			expect(result.saved).toBe(false);
		});
	});

	describe('remove', () => {
		it('404 se não está na lista', async () => {
			prisma.wishlistItem.findUnique.mockResolvedValue(null);

			await expect(service.remove('u1', 'ad-1')).rejects.toThrow(
				NotFoundException,
			);
		});

		it('remove item', async () => {
			prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'w-1' });
			prisma.wishlistItem.delete.mockResolvedValue({});

			await service.remove('u1', 'ad-1');

			expect(prisma.wishlistItem.delete).toHaveBeenCalledWith({
				where: { id: 'w-1' },
			});
		});
	});
});
