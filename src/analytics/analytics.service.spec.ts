import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { AnalyticsService } from './analytics.service';

jest.mock('../libs/id', () => ({ newId: jest.fn(() => 'row-1') }));

function todayKey(): string {
	const now = new Date();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

describe('AnalyticsService', () => {
	let service: AnalyticsService;
	let redis: {
		incr: jest.Mock;
		incrby: jest.Mock;
		sadd: jest.Mock;
		expire: jest.Mock;
		scard: jest.Mock;
		scan: jest.Mock;
		del: jest.Mock;
	};
	let prisma: {
		ad: { findUnique: jest.Mock; updateMany: jest.Mock };
		business: { findUnique: jest.Mock; updateMany: jest.Mock };
		analyticsDaily: {
			upsert: jest.Mock;
			findUnique: jest.Mock;
			update: jest.Mock;
			findMany: jest.Mock;
			deleteMany: jest.Mock;
		};
		$transaction: jest.Mock;
	};

	const today = todayKey();

	beforeEach(async () => {
		jest.clearAllMocks();

		redis = {
			incr: jest.fn(() => Promise.resolve(1)),
			incrby: jest.fn(() => Promise.resolve(0)),
			sadd: jest.fn(() => Promise.resolve(1)),
			expire: jest.fn(() => Promise.resolve(1)),
			scard: jest.fn(() => Promise.resolve(0)),
			scan: jest.fn(() =>
				Promise.resolve(['0', []] as [string, string[]]),
			),
			del: jest.fn(() => Promise.resolve(1)),
		};

		prisma = {
			ad: {
				findUnique: jest.fn(),
				updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
			},
			business: {
				findUnique: jest.fn(),
				updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
			},
			analyticsDaily: {
				upsert: jest.fn(() => Promise.resolve({})),
				findUnique: jest.fn(() => Promise.resolve({ clicks: [] })),
				update: jest.fn(() => Promise.resolve({})),
				findMany: jest.fn(() => Promise.resolve([])),
				deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
			},
			$transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				AnalyticsService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: Redis, useValue: redis },
			],
		}).compile();

		service = moduleRef.get(AnalyticsService);
	});

	describe('trackView', () => {
		it('incrementa o contador de views do dia', async () => {
			await service.trackView('AD', 'ad-1');

			expect(redis.incr).toHaveBeenCalledWith(`ana:vc:AD:ad-1:${today}`);
		});

		it('deduplica utilizadores autenticados por dia', async () => {
			await service.trackView('BUSINESS', 'biz-1', {
				id: 'u1',
				role: 'USER',
			});

			expect(redis.sadd).toHaveBeenCalledWith(
				`ana:vu:BUSINESS:biz-1:${today}`,
				'u:u1',
			);
			expect(redis.expire).toHaveBeenCalledWith(
				`ana:vu:BUSINESS:biz-1:${today}`,
				60 * 60 * 48,
			);
		});

		it('não registra o set único para anónimos', async () => {
			await service.trackView('AD', 'ad-1', null);

			expect(redis.incr).toHaveBeenCalledTimes(1);
			expect(redis.sadd).not.toHaveBeenCalled();
		});

		it('não lança erro quando o Redis falha (best-effort)', async () => {
			redis.incr.mockRejectedValueOnce(new Error('connection lost'));

			await expect(
				service.trackView('AD', 'ad-1'),
			).resolves.toBeUndefined();
		});
	});

	describe('trackClick', () => {
		it('incrementa o contador de cliques por canal', async () => {
			await service.trackClick('biz-1', 'whatsapp');

			expect(redis.incr).toHaveBeenCalledWith(
				`ana:cc:whatsapp:biz-1:${today}`,
			);
		});
	});

	describe('trackBusinessClick', () => {
		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.trackBusinessClick('ghost', 'phone'),
			).rejects.toBeInstanceOf(NotFoundException);
		});

		it('rejeita cliques em empresas não visíveis', async () => {
			prisma.business.findUnique.mockResolvedValue({ status: 'HIDE' });

			await expect(
				service.trackBusinessClick('biz-1', 'phone'),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(redis.incr).not.toHaveBeenCalled();
		});

		it('conta cliques em empresas SHOW', async () => {
			prisma.business.findUnique.mockResolvedValue({ status: 'SHOW' });

			await service.trackBusinessClick('biz-1', 'email');

			expect(redis.incr).toHaveBeenCalledWith(
				`ana:cc:email:biz-1:${today}`,
			);
		});
	});

	describe('flush', () => {
		it('não faz nada sem chaves pendentes', async () => {
			await service.flush();

			expect(prisma.$transaction).not.toHaveBeenCalled();
			expect(redis.del).not.toHaveBeenCalled();
		});

		it('agrega views, únicos e cliques e apaga as chaves', async () => {
			const adViewKey = `ana:vc:AD:ad-1:${today}`;
			const adUniqKey = `ana:vu:AD:ad-1:${today}`;
			const clickKey = `ana:cc:whatsapp:biz-1:${today}`;

			redis.scan.mockImplementation((_cursor: string, ...args) => {
				const pattern = args[1] as string;
				const table: Record<string, string[]> = {
					'ana:vc:*': [adViewKey],
					'ana:vu:*': [adUniqKey],
					'ana:cc:*': [clickKey],
				};
				return ['0', table[pattern] ?? []] as [string, string[]];
			});
			redis.incrby.mockImplementation((key: string) => {
				const values: Record<string, number> = {
					[adViewKey]: 5,
					[clickKey]: 3,
				};
				return values[key] ?? 0;
			});
			redis.scard.mockResolvedValue(2);

			await service.flush();

			expect(prisma.analyticsDaily.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						adId_date: {
							adId: 'ad-1',
							date: new Date(`${today}T00:00:00.000Z`),
						},
					},
					create: expect.objectContaining({
						views: 5,
						uniqueViews: 2,
					}),
				}),
			);
			expect(prisma.analyticsDaily.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						businessId_date: {
							businessId: 'biz-1',
							date: new Date(`${today}T00:00:00.000Z`),
						},
					},
					create: expect.objectContaining({
						views: 0,
						uniqueViews: 0,
						clicks: [{ channel: 'whatsapp', count: 3 }],
					}),
				}),
			);
			expect(prisma.ad.updateMany).toHaveBeenCalledWith({
				where: { id: 'ad-1' },
				data: { viewCount: { increment: 5 } },
			});
			expect(prisma.business.updateMany).toHaveBeenCalledWith({
				where: { id: 'biz-1' },
				data: {
					viewCount: { increment: 0 },
					clickCount: { increment: 3 },
				},
			});
			expect(redis.del).toHaveBeenCalledWith(
				adViewKey,
				adUniqKey,
				clickKey,
			);
		});
	});

	describe('prune', () => {
		it('apaga registos mais antigos que a retenção', async () => {
			await service.prune();

			const cutoff = new Date();
			cutoff.setHours(0, 0, 0, 0);
			cutoff.setDate(cutoff.getDate() - 730);

			expect(prisma.analyticsDaily.deleteMany).toHaveBeenCalledWith(
				expect.objectContaining({ where: { date: { lt: cutoff } } }),
			);
		});
	});

	describe('getAdStats', () => {
		it('404 para anúncio inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(
				service.getAdStats('u1', 'USER', 'ghost'),
			).rejects.toBeInstanceOf(NotFoundException);
		});

		it('proíbe quem não é dono nem privilegiado', async () => {
			prisma.ad.findUnique.mockResolvedValue({ userId: 'owner-1' });

			await expect(
				service.getAdStats('u1', 'USER', 'ad-1'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('permite ADMIN ver estatísticas de qualquer anúncio', async () => {
			prisma.ad.findUnique.mockResolvedValue({ userId: 'owner-1' });
			prisma.analyticsDaily.findMany.mockResolvedValue([
				{
					date: new Date(`${today}T00:00:00.000Z`),
					views: 4,
					uniqueViews: 3,
				},
			]);

			const result = await service.getAdStats('mod1', 'ADMIN', 'ad-1');

			expect(result.totals).toEqual({ views: 4, uniqueViews: 3 });
			expect(result.daily).toHaveLength(1);
		});

		it('soma views do dono ao longo do range', async () => {
			prisma.ad.findUnique.mockResolvedValue({ userId: 'u1' });
			prisma.analyticsDaily.findMany.mockResolvedValue([
				{ date: new Date(), views: 2, uniqueViews: 1 },
				{ date: new Date(), views: 3, uniqueViews: 2 },
			]);

			const result = await service.getAdStats('u1', 'USER', 'ad-1', '7d');

			expect(result.totals).toEqual({ views: 5, uniqueViews: 3 });
		});
	});

	describe('getBusinessStats', () => {
		it('proíbe quem não é dono nem privilegiado', async () => {
			prisma.business.findUnique.mockResolvedValue({
				ownerId: 'owner-1',
			});

			await expect(
				service.getBusinessStats('u1', 'USER', 'biz-1'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('agrega views, únicos e cliques por canal', async () => {
			prisma.business.findUnique.mockResolvedValue({
				ownerId: 'biz-owner',
			});
			prisma.analyticsDaily.findMany.mockResolvedValue([
				{
					date: new Date(),
					views: 10,
					uniqueViews: 5,
					clicks: [
						{ channel: 'whatsapp', count: 2 },
						{ channel: 'phone', count: 1 },
					],
				},
			]);

			const result = await service.getBusinessStats(
				'biz-owner',
				'PROMOTER',
				'biz-1',
			);

			expect(result.totals).toEqual({
				views: 10,
				uniqueViews: 5,
				clicks: 3,
				clicksByChannel: [
					{ channel: 'whatsapp', count: 2 },
					{ channel: 'phone', count: 1 },
				],
			});
		});
	});

	describe('getPlatformStats', () => {
		it('agrega todas as linhas por dia e canal', async () => {
			prisma.analyticsDaily.findMany.mockResolvedValue([
				{
					date: new Date(),
					views: 10,
					uniqueViews: 5,
					clicks: [{ channel: 'whatsapp', count: 2 }],
				},
				{
					date: new Date(),
					views: 2,
					uniqueViews: 1,
					clicks: null,
				},
			]);

			const result = await service.getPlatformStats('30d');

			expect(result.totals).toEqual({
				views: 12,
				uniqueViews: 6,
				clicks: 2,
				clicksByChannel: [{ channel: 'whatsapp', count: 2 }],
			});
			expect(result.daily).toHaveLength(1);
		});
	});
});
