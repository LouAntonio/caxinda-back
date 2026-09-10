import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { SearchService } from './search.service';

describe('SearchService', () => {
	let service: SearchService;
	let prisma: {
		ad: { count: jest.Mock; findMany: jest.Mock };
		business: { count: jest.Mock; findMany: jest.Mock };
	};

	const AD_ROW = {
		id: 'ad-1',
		slug: 'iphone',
		title: 'iPhone 12',
		description: 'Em ótimo estado',
		price: new Prisma.Decimal('250000'),
		image: null,
		verified: false,
		createdAt: new Date('2026-09-01T10:00:00Z'),
		user: { id: 'u1', name: 'Ana', surname: 'Silva', image: null },
	};

	const BUSINESS_ROW = {
		id: 'biz-1',
		slug: 'loja-ana',
		name: 'Loja da Ana',
		description: 'Venda de telemóveis',
		province: 'LUANDA',
		logoUrl: null,
		isVerified: true,
		createdAt: new Date('2026-09-02T10:00:00Z'),
		owner: { id: 'u2', name: 'Ana', surname: 'Silva', image: null },
	};

	beforeEach(async () => {
		prisma = {
			ad: { count: jest.fn(), findMany: jest.fn() },
			business: { count: jest.fn(), findMany: jest.fn() },
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				SearchService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(SearchService);
	});

	it('pesquisa em todas as entidades, agrega e ordena por relevância', async () => {
		prisma.ad.count.mockResolvedValue(1);
		prisma.ad.findMany.mockResolvedValue([AD_ROW]);
		prisma.business.count.mockResolvedValue(1);
		prisma.business.findMany.mockResolvedValue([BUSINESS_ROW]);

		const result = await service.searchPublic({
			q: 'ana',
			page: 1,
			limit: 20,
		});

		expect(result.total).toBe(2);
		expect(result.items).toHaveLength(2);
		expect(result.totalPages).toBe(1);
		expect((result.items[0] as { type: string }).type).toBe('BUSINESS');
		expect((result.items[1] as { type: string }).type).toBe('AD');
		expect(prisma.ad.findMany.mock.calls[0][0].where).toMatchObject({
			status: 'ACTIVE',
			visibility: 'VISIBLE',
			OR: expect.arrayContaining([
				expect.objectContaining({
					title: { contains: 'ana', mode: 'insensitive' },
				}),
			]),
		});
	});

	it('converte price Decimal para number', async () => {
		prisma.ad.count.mockResolvedValue(1);
		prisma.ad.findMany.mockResolvedValue([AD_ROW]);
		prisma.business.count.mockResolvedValue(0);
		prisma.business.findMany.mockResolvedValue([]);

		const result = await service.searchPublic({ q: 'iphone' });

		const ad = result.items.find(
			(item) => (item as { type?: string }).type === 'AD',
		) as {
			price?: number | null;
			user?: unknown;
		};
		expect(ad.price).toBe(250000);
		expect((ad.user as { id: string }).id).toBe('u1');
	});

	it('respeita o filtro de tipo', async () => {
		prisma.business.count.mockResolvedValue(1);
		prisma.business.findMany.mockResolvedValue([BUSINESS_ROW]);

		const result = await service.searchPublic({
			q: 'loja',
			type: 'BUSINESS',
		});

		expect(result.total).toBe(1);
		expect(result.items).toHaveLength(1);
		expect((result.items[0] as { type: string }).type).toBe('BUSINESS');
		expect(prisma.ad.findMany).not.toHaveBeenCalled();
	});

	it('aplica categoryId e province como filtros', async () => {
		prisma.business.count.mockResolvedValue(1);
		prisma.business.findMany.mockResolvedValue([BUSINESS_ROW]);

		await service.searchPublic({
			q: 'loja',
			type: 'BUSINESS',
			categoryId: 'cat-1',
			province: 'LUANDA',
		});

		expect(prisma.business.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: 'SHOW',
					categoryId: 'cat-1',
					province: 'LUANDA',
				}),
			}),
		);
	});

	it('pagina globalmente com totalPages', async () => {
		prisma.ad.count.mockResolvedValue(5);
		prisma.ad.findMany.mockResolvedValue([
			{ ...AD_ROW, id: 'ad-2' },
			{ ...AD_ROW, id: 'ad-3' },
		]);
		prisma.business.count.mockResolvedValue(0);
		prisma.business.findMany.mockResolvedValue([]);

		const result = await service.searchPublic({ q: 'iphone', limit: 2 });

		expect(result.limit).toBe(2);
		expect(result.totalPages).toBe(3);
		expect(result.items).toHaveLength(2);
	});
});
