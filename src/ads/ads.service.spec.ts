import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { CacheService } from '../cache/cache.service';
import { MediaService } from '../media/media.service';
import { AnalyticsService } from '../analytics/analytics.service';

jest.mock('../media/media.service', () => ({
	MediaService: jest.fn(),
}));
import { Prisma } from '../generated/prisma/client';
import { AdsService, AdSessionUser } from './ads.service';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
	const error = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
	error.code = code;
	return error;
}

describe('AdsService', () => {
	let service: AdsService;
	let prisma: {
		ad: {
			findMany: jest.Mock;
			findUnique: jest.Mock;
			count: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			updateMany: jest.Mock;
			delete: jest.Mock;
		};
		category: { findMany: jest.Mock };
		user: { findUnique: jest.Mock };
		$queryRaw: jest.Mock;
		$executeRaw: jest.Mock;
	};

	let cache: {
		wrap: jest.Mock;
		get: jest.Mock;
		set: jest.Mock;
		del: jest.Mock;
		delMany: jest.Mock;
	};

	const owner: AdSessionUser = { id: 'owner-id', role: 'USER' };
	const admin: AdSessionUser = { id: 'admin-id', role: 'ADMIN' };
	const stranger: AdSessionUser = { id: 'other-id', role: 'USER' };

	const media = {
		enqueueDeletion: jest.fn(() => undefined),
	};

	const analytics = {
		trackView: jest.fn(() => undefined),
	};

	const adRow = {
		id: 'ad-1',
		slug: 'iphone-12',
		title: 'iPhone 12',
		description: 'Ótimo estado',
		price: {
			toNumber: () => 250000,
			toJSON: () => '250000',
		} as unknown as Prisma.Decimal,
		status: 'ACTIVE',
		visibility: 'VISIBLE',
		verified: false,
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		image: null,
		imageId: null,
		gallery: [],
		userId: 'owner-id',
		categories: [],
		user: { id: 'owner-id', name: 'João', surname: 'Silva' },
		featured: false,
		featuredUntil: null,
		featuredAt: null,
	};

	function publicAd(overrides: Record<string, unknown> = {}) {
		return {
			id: adRow.id,
			slug: adRow.slug,
			title: adRow.title,
			description: adRow.description,
			price: 250000,
			status: 'ACTIVE',
			visibility: 'VISIBLE',
			verified: false,
			createdAt: adRow.createdAt,
			updatedAt: adRow.updatedAt,
			image: null,
			imageId: null,
			gallery: [],
			userId: 'owner-id',
			distanceKm: undefined,
			featured: false,
			featuredUntil: null,
			...overrides,
		};
	}

	beforeEach(async () => {
		jest.clearAllMocks();
		prisma = {
			ad: {
				findMany: jest.fn(),
				findUnique: jest.fn(),
				count: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn().mockResolvedValue({ count: 0 }),
				delete: jest.fn(),
			},
			category: { findMany: jest.fn() },
			user: { findUnique: jest.fn() },
			$queryRaw: jest.fn().mockResolvedValue([]),
			$executeRaw: jest.fn(),
		};

		cache = {
			wrap: jest.fn(async <T>(_key: string, fn: () => Promise<T>) =>
				fn(),
			),
			get: jest.fn(),
			set: jest.fn(),
			del: jest.fn(),
			delMany: jest.fn(),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				AdsService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: CacheService, useValue: cache },
				{ provide: MediaService, useValue: media },
				{ provide: AnalyticsService, useValue: analytics },
			],
		}).compile();

		service = moduleRef.get(AdsService);
	});

	describe('list', () => {
		it('filtra por ACTIVE + VISIBLE e retorna preço como número', async () => {
			prisma.ad.count.mockResolvedValue(1);
			prisma.ad.findMany.mockResolvedValue([adRow]);

			const result = await service.list();

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { status: 'ACTIVE', visibility: 'VISIBLE' },
					include: expect.objectContaining({
						categories: true,
						user: expect.objectContaining({
							select: expect.any(Object),
						}),
					}),
				}),
			);
			expect(result.total).toBe(1);
			expect(result.items[0]).toEqual(publicAd());
		});

		it('ADMIN com includeInactive ignora status e visibility', async () => {
			prisma.ad.count.mockResolvedValue(0);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list({ includeInactive: true }, admin);

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {},
				}),
			);
		});

		it('includeInactive é ignorado para usuário comum', async () => {
			prisma.ad.count.mockResolvedValue(0);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list({ includeInactive: true }, stranger);

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { status: 'ACTIVE', visibility: 'VISIBLE' },
				}),
			);
		});

		it('filtra por categoryIds (csv) e busca', async () => {
			prisma.ad.count.mockResolvedValue(0);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list(
				{ categoryIds: 'cat-1, cat-2', q: 'iphone' },
				null,
			);

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						categories: {
							some: { id: { in: ['cat-1', 'cat-2'] } },
						},
						OR: [
							{
								title: {
									contains: 'iphone',
									mode: 'insensitive',
								},
							},
							{
								description: {
									contains: 'iphone',
									mode: 'insensitive',
								},
							},
						],
					}),
				}),
			);
		});

		it('filtra por preço', async () => {
			prisma.ad.count.mockResolvedValue(0);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list(
				{
					minPrice: 100,
					maxPrice: 500,
				},
				null,
			);

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						price: { gte: 100, lte: 500 },
					}),
				}),
			);
		});

		it('lança BadRequest quando só um de lat/lng é informado', async () => {
			await expect(service.list({ lat: -8.8383 })).rejects.toBeInstanceOf(
				BadRequestException,
			);
			await expect(service.list({ lng: 13.2344 })).rejects.toBeInstanceOf(
				BadRequestException,
			);
		});

		it('lança BadRequest quando sortBy=distance sem lat/lng', async () => {
			await expect(
				service.list({ sortBy: 'distance' }),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('lança BadRequest quando radiusKm fora do intervalo', async () => {
			await expect(
				service.list({ lat: -8.8, lng: 13.2, radiusKm: 200 }),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('lança BadRequest quando proximidade é solicitada', async () => {
			prisma.$queryRaw.mockResolvedValue([
				{ id: 'ad-near', distance_m: 500 },
				{ id: 'ad-1', distance_m: 5000 },
			]);
			prisma.ad.count.mockResolvedValue(2);
			prisma.ad.findMany.mockResolvedValue([
				adRow,
				{ ...adRow, id: 'ad-near' },
			]);

			await expect(
				service.list(
					{ sortBy: 'distance', lat: -8.8, lng: 13.2 },
					null,
				),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(prisma.ad.findMany).not.toHaveBeenCalled();
		});

		it('lança BadRequest quando lat/lng são informados', async () => {
			prisma.$queryRaw.mockResolvedValue([]);

			await expect(
				service.list({ lat: -8.8, lng: 13.2 }, null),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(prisma.ad.count).not.toHaveBeenCalled();
		});
	});

	describe('list (destaques)', () => {
		it('filtra apenas anúncios em destaque ativos quando featured=true', async () => {
			prisma.ad.count.mockResolvedValue(1);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list({ featured: true });

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						status: 'ACTIVE',
						visibility: 'VISIBLE',
						featured: true,
						featuredUntil: { gt: expect.any(Date) },
					}),
				}),
			);
		});

		it('prioriza destaques na ordem padrão (newest)', async () => {
			prisma.ad.count.mockResolvedValue(0);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list({});

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					orderBy: [
						{ featured: 'desc' },
						{ featuredUntil: 'asc' },
						{ createdAt: 'desc' },
					],
				}),
			);
		});

		it('não prioriza destaques em ordenações explícitas (price_asc)', async () => {
			prisma.ad.count.mockResolvedValue(0);
			prisma.ad.findMany.mockResolvedValue([]);

			await service.list({ sortBy: 'price_asc' });

			expect(prisma.ad.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					orderBy: [{ price: 'asc' }, { createdAt: 'desc' }],
				}),
			);
		});
	});

	describe('feature', () => {
		it('lança NotFound para anúncio inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(service.feature('owner-id', 'ad-x')).rejects.toThrow(
				NotFoundException,
			);
		});

		it('lança Forbidden se não é o dono', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				userId: 'other',
			});

			await expect(service.feature('owner-id', 'ad-1')).rejects.toThrow(
				ForbiddenException,
			);
		});

		it('lança BadRequest se anúncio não está ativo/visível', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				status: 'ARCHIVED',
			});

			await expect(service.feature('owner-id', 'ad-1')).rejects.toThrow(
				BadRequestException,
			);
		});

		it('lança Conflict se já está em destaque ativo', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				featured: true,
				featuredUntil: new Date(Date.now() + 999999),
			});

			await expect(service.feature('owner-id', 'ad-1')).rejects.toThrow(
				ConflictException,
			);
		});

		it('destaca anúncio até now + 30 dias', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue({ ...adRow, featured: true });

			await service.feature('owner-id', 'ad-1');

			expect(prisma.ad.update).toHaveBeenCalled();
			const updateArg = prisma.ad.update.mock.calls[0][0];
			expect(updateArg.where.id).toBe('ad-1');
			expect(updateArg.data.featured).toBe(true);
			expect(updateArg.data.featuredUntil).toBeInstanceOf(Date);
			expect(updateArg.data.featuredAt).toBeInstanceOf(Date);
		});
	});

	describe('unfeature', () => {
		it('lança NotFound para anúncio inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(
				service.unfeature('owner-id', 'USER', 'ad-x'),
			).rejects.toThrow(NotFoundException);
		});

		it('lança Forbidden para não-dono não-privilegiado', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				userId: 'other',
			});

			await expect(
				service.unfeature('owner-id', 'USER', 'ad-1'),
			).rejects.toThrow(ForbiddenException);
		});

		it('limpa os campos de destaque', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue({ ...adRow, featured: false });

			await service.unfeature('owner-id', 'USER', 'ad-1');

			expect(prisma.ad.update).toHaveBeenCalledWith({
				where: { id: 'ad-1' },
				data: {
					featured: false,
					featuredUntil: null,
					featuredAt: null,
				},
				include: expect.any(Object),
			});
		});
	});

	describe('getById', () => {
		it('retorna um anúncio visível para qualquer usuário', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			const result = await service.getById('ad-1', null);

			expect(result.id).toBe('ad-1');
		});

		it('esconde anúncio oculto/inativo de visitantes', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				visibility: 'HIDDEN',
			});

			await expect(service.getById('ad-1', null)).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});

		it('permite o dono ver seu anúncio oculto', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				visibility: 'HIDDEN',
			});

			const result = await service.getById('ad-1', owner);

			expect(result.id).toBe('ad-1');
		});

		it('permite ADMIN ver qualquer anúncio', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				status: 'REJECTED',
			});

			const result = await service.getById('ad-1', admin);

			expect(result.id).toBe('ad-1');
		});

		it('lança NotFoundException quando não existe', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(service.getById('ghost', null)).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});

		it('serve anúncio visível do cache para visitantes anônimos', async () => {
			cache.get.mockResolvedValue({
				...adRow,
				price: '250000',
			});

			const result = await service.getById('ad-1', null);

			expect(prisma.ad.findUnique).not.toHaveBeenCalled();
			expect((result as { id: string }).id).toBe('ad-1');
		});

		it('não usa o cache para dono/admin autenticados', async () => {
			cache.get.mockResolvedValue({
				...adRow,
				price: '250000',
			});
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				visibility: 'HIDDEN',
			});

			await service.getById('ad-1', owner);

			expect(prisma.ad.findUnique).toHaveBeenCalled();
		});

		it('não calcula distância quando proximidade é informada (sem PostGIS)', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			const result = await service.getById('ad-1', null, {
				lat: -8.8,
				lng: 13.2,
			});

			expect(
				(result as { distanceKm?: number | undefined }).distanceKm,
			).toBeUndefined();
			expect(result.location).toBeNull();
		});

		it('não usa o cache quando proximidade é informada', async () => {
			cache.get.mockResolvedValue({
				...adRow,
				price: '250000',
			});
			prisma.ad.findUnique.mockResolvedValue(adRow);

			const result = await service.getById('ad-1', null, {
				lat: -8.8,
				lng: 13.2,
			});

			expect(cache.get).toHaveBeenCalledTimes(0);
			expect(prisma.ad.findUnique).toHaveBeenCalled();
			expect(result.id).toBe('ad-1');
			expect(
				(result as { distanceKm?: number | undefined }).distanceKm,
			).toBeUndefined();
		});

		it('conta view para visitantes anônimos', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			await service.getById('ad-1', null);

			expect(analytics.trackView).toHaveBeenCalledWith(
				'AD',
				'ad-1',
				null,
			);
		});

		it('conta view servida do cache para visitantes anônimos', async () => {
			cache.get.mockResolvedValue({
				...adRow,
				price: '250000',
			});

			await service.getById('ad-1', null);

			expect(analytics.trackView).toHaveBeenCalledWith('AD', 'ad-1');
		});

		it('não conta view do próprio dono', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			await service.getById('ad-1', owner);

			expect(analytics.trackView).not.toHaveBeenCalled();
		});

		it('não conta view de ADMIN/MODERATOR', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			await service.getById('ad-1', admin);

			expect(analytics.trackView).not.toHaveBeenCalled();
		});

		it('não conta view de anúncio oculto', async () => {
			prisma.ad.findUnique.mockResolvedValue({
				...adRow,
				visibility: 'HIDDEN',
			});

			await service.getById('ad-1', admin);

			expect(analytics.trackView).not.toHaveBeenCalled();
		});
	});

	describe('create', () => {
		const dto = {
			title: 'iPhone 12',
			description: 'Ótimo estado',
			price: 250000,
			categoryIds: ['cat-1', 'cat-2'],
		};

		it('bloqueia criação por usuário comum', async () => {
			await expect(
				service.create('owner-id', 'USER', dto),
			).rejects.toBeInstanceOf(ForbiddenException);
			expect(prisma.ad.create).not.toHaveBeenCalled();
		});

		it('valida categorias e cria o anúncio', async () => {
			prisma.category.findMany.mockResolvedValue([
				{ id: 'cat-1' },
				{ id: 'cat-2' },
			]);
			prisma.ad.create.mockResolvedValue(adRow);

			const result = await service.create('admin-id', 'ADMIN', dto);

			expect(prisma.category.findMany).toHaveBeenCalledWith({
				where: { id: { in: ['cat-1', 'cat-2'] }, type: 'AD' },
				select: { id: true },
			});
			expect(prisma.ad.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						userId: 'admin-id',
						title: 'iPhone 12',
						categories: {
							connect: [{ id: 'cat-1' }, { id: 'cat-2' }],
						},
					}),
				}),
			);
			expect(prisma.$executeRaw).not.toHaveBeenCalled();
			expect(result.id).toBe('ad-1');
		});

		it('lança BadRequest quando location é informada', async () => {
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
			prisma.ad.create.mockResolvedValue(adRow);
			prisma.$executeRaw.mockResolvedValue(1);

			await expect(
				service.create('admin-id', 'ADMIN', {
					...dto,
					categoryIds: ['cat-1'],
					location: { lat: -8.8, lng: 13.2 },
				}),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(prisma.ad.create).not.toHaveBeenCalled();
			expect(prisma.$executeRaw).not.toHaveBeenCalled();
		});

		it('lança BadRequest quando uma categoria não existe', async () => {
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);

			await expect(
				service.create('admin-id', 'ADMIN', dto),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(prisma.ad.create).not.toHaveBeenCalled();
		});

		it('gera slug único a partir do título', async () => {
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
			prisma.ad.create.mockResolvedValue(adRow);

			await service.create('admin-id', 'ADMIN', {
				...dto,
				categoryIds: ['cat-1'],
			});

			expect(prisma.ad.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						slug: 'iphone-12',
					}),
				}),
			);
		});

		it('desambigua slug quando o base já existe', async () => {
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
			prisma.ad.create.mockResolvedValue(adRow);
			prisma.ad.findUnique
				.mockResolvedValueOnce({ id: 'outro-id' })
				.mockResolvedValueOnce(null);

			await service.create('admin-id', 'ADMIN', {
				...dto,
				categoryIds: ['cat-1'],
			});

			expect(prisma.ad.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ slug: 'iphone-12-2' }),
				}),
			);
		});

		it('usa slug explícito quando informado', async () => {
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
			prisma.ad.create.mockResolvedValue(adRow);

			await service.create('admin-id', 'ADMIN', {
				...dto,
				categoryIds: ['cat-1'],
				slug: 'meu-iphone',
			});

			expect(prisma.ad.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ slug: 'meu-iphone' }),
				}),
			);
		});

		it('lança ConflictException quando o slug explícito já existe', async () => {
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
			prisma.ad.findUnique.mockResolvedValue({ id: 'outro-id' });

			await expect(
				service.create('admin-id', 'ADMIN', {
					...dto,
					categoryIds: ['cat-1'],
					slug: 'taken',
				}),
			).rejects.toBeInstanceOf(ConflictException);
			expect(prisma.ad.create).not.toHaveBeenCalled();
		});
	});

	describe('update', () => {
		it('lança ForbiddenException para quem não é dono/moderador/admin', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			await expect(
				service.update('other-id', 'USER', 'ad-1', {
					title: 'X',
				}),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('dono atualiza campos e substitui categorias', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.category.findMany.mockResolvedValue([{ id: 'cat-9' }]);
			prisma.ad.update.mockResolvedValue(adRow);

			await service.update('owner-id', 'USER', 'ad-1', {
				title: 'iPhone 12 128GB',
				categoryIds: ['cat-9'],
			});

			expect(prisma.ad.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'ad-1' },
					data: expect.objectContaining({
						title: 'iPhone 12 128GB',
						categories: { set: [{ id: 'cat-9' }] },
					}),
				}),
			);
		});

		it('moderador pode editar anúncio de outro usuário', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue(adRow);

			const result = await service.update('mod-id', 'MODERATOR', 'ad-1', {
				title: 'Fix',
			});

			expect(result.id).toBe('ad-1');
		});

		it('regenera slug quando o título muda', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue(adRow);

			await service.update('owner-id', 'USER', 'ad-1', {
				title: 'iPhone 12 128GB',
			});

			expect(prisma.ad.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ slug: 'iphone-12-128gb' }),
				}),
			);
		});

		it('mantém o slug quando título não muda', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue(adRow);

			await service.update('owner-id', 'USER', 'ad-1', {
				description: 'Still ótimo',
			});

			expect(prisma.ad.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ slug: 'iphone-12' }),
				}),
			);
		});

		it('lança ConflictException quando slug explícito pertence a outro anúncio', async () => {
			prisma.ad.findUnique
				.mockResolvedValueOnce(adRow)
				.mockResolvedValueOnce({ id: 'outro-id' });

			await expect(
				service.update('owner-id', 'USER', 'ad-1', {
					slug: 'taken',
				}),
			).rejects.toBeInstanceOf(ConflictException);
		});
	});

	describe('setVisibility', () => {
		it('dono alterna visibilidade', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue({
				...adRow,
				visibility: 'HIDDEN',
			});

			const result = await service.setVisibility(
				'owner-id',
				'USER',
				'ad-1',
				{ visibility: 'HIDDEN' },
			);

			expect(prisma.ad.update).toHaveBeenCalledWith({
				where: { id: 'ad-1' },
				data: { visibility: 'HIDDEN' },
			});
			expect(result.visibility).toBe('HIDDEN');
		});

		it('lança ForbiddenException para estranho', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			await expect(
				service.setVisibility('other-id', 'USER', 'ad-1', {
					visibility: 'HIDDEN',
				}),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('ADMIN pode alternar visibilidade de qualquer anúncio', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.update.mockResolvedValue({
				...adRow,
				visibility: 'HIDDEN',
			});

			const result = await service.setVisibility(
				'admin-id',
				'ADMIN',
				'ad-1',
				{ visibility: 'HIDDEN' },
			);

			expect(result.visibility).toBe('HIDDEN');
		});
	});

	describe('moderate', () => {
		it('lança BadRequest sem nenhum campo', async () => {
			await expect(service.moderate('ad-1', {})).rejects.toBeInstanceOf(
				BadRequestException,
			);
		});

		it('atualiza verified e status', async () => {
			prisma.ad.update.mockResolvedValue({
				...adRow,
				verified: true,
				status: 'ACTIVE',
			});

			const result = await service.moderate('ad-1', {
				verified: true,
				status: 'ACTIVE',
			});

			expect(prisma.ad.update).toHaveBeenCalledWith({
				where: { id: 'ad-1' },
				data: { verified: true, status: 'ACTIVE' },
				include: expect.any(Object),
			});
			expect(result.verified).toBe(true);
		});
	});

	describe('remove', () => {
		it('dono remove o anúncio', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.delete.mockResolvedValue(adRow);

			await service.remove('owner-id', 'USER', 'ad-1');

			expect(prisma.ad.delete).toHaveBeenCalledWith({
				where: { id: 'ad-1' },
			});
		});

		it('lança ForbiddenException para moderador que não é dono', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);

			await expect(
				service.remove('mod-id', 'MODERATOR', 'ad-1'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('ADMIN remove anúncio de outro usuário', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.delete.mockResolvedValue(adRow);

			await service.remove('admin-id', 'ADMIN', 'ad-1');

			expect(prisma.ad.delete).toHaveBeenCalled();
		});

		it('lança ConflictException quando o anúncio possui conversas', async () => {
			prisma.ad.findUnique.mockResolvedValue(adRow);
			prisma.ad.delete.mockRejectedValue(prismaError('P2003'));

			await expect(
				service.remove('owner-id', 'USER', 'ad-1'),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('lança NotFoundException quando não existe', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(
				service.remove('owner-id', 'USER', 'ghost'),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});
});
