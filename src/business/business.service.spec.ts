import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { BusinessesService } from './business.service';

function businessRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'biz-1',
		slug: 'loja',
		name: 'Loja',
		description: 'Descrição',
		address: null,
		province: 'LUANDA',
		phone: '+244 923 000 000',
		whatsapp: null,
		email: null,
		website: null,
		logoUrl: null,
		logoId: null,
		coverUrl: null,
		coverId: null,
		gallery: [],
		categoryId: 'cat-1',
		category: { id: 'cat-1', slug: 'lojas', name: 'Lojas' },
		ownerId: 'owner-1',
		owner: {
			id: 'owner-1',
			name: 'Maria',
			surname: 'Santos',
			image: null,
			isVerified: true,
		},
		isVerified: false,
		status: 'SHOW',
		_count: { reviews: 0 },
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

describe('BusinessesService', () => {
	let service: BusinessesService;
	let prisma: {
		business: {
			count: jest.Mock;
			findMany: jest.Mock;
			findUnique: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			delete: jest.Mock;
		};
		category: { findUnique: jest.Mock };
		review: { groupBy: jest.Mock };
	};

	beforeEach(async () => {
		prisma = {
			business: {
				count: jest.fn(),
				findMany: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
			},
			category: { findUnique: jest.fn() },
			review: { groupBy: jest.fn().mockResolvedValue([]) },
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				BusinessesService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(BusinessesService);
	});

	describe('listPublic', () => {
		it('lista apenas empresas SHOW para visitantes', async () => {
			prisma.business.count.mockResolvedValue(1);
			prisma.business.findMany.mockResolvedValue([businessRow()]);

			const result = await service.listPublic({});

			expect(prisma.business.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ status: 'SHOW' }),
				}),
			);
			expect(result.total).toBe(1);
			expect(result.items[0].slug).toBe('loja');
			expect(result.items[0].reviewCount).toBe(0);
		});

		it('inclui HIDE para moderadores', async () => {
			prisma.business.count.mockResolvedValue(1);
			prisma.business.findMany.mockResolvedValue([businessRow()]);

			await service.listPublic({}, { id: 'm1', role: 'MODERATOR' });

			expect(prisma.business.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.not.objectContaining({ status: 'SHOW' }),
				}),
			);
		});

		it('filtra por província e categoria', async () => {
			prisma.business.count.mockResolvedValue(0);
			prisma.business.findMany.mockResolvedValue([]);

			await service.listPublic({
				province: 'BENGUELA',
				categoryId: 'cat-2',
			});

			expect(prisma.business.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						status: 'SHOW',
						province: 'BENGUELA',
						categoryId: 'cat-2',
					}),
				}),
			);
		});
	});

	describe('getBySlug', () => {
		it('retorna a empresa quando existe', async () => {
			prisma.business.findUnique.mockResolvedValue(businessRow());

			const result = await service.getBySlug('loja');

			expect(result.slug).toBe('loja');
			expect(prisma.business.findUnique).toHaveBeenCalledWith({
				where: { slug: 'loja' },
				include: expect.anything(),
			});
		});

		it('404 para empresa oculta para um visitante', async () => {
			prisma.business.findUnique.mockResolvedValue(
				businessRow({ status: 'HIDE' }),
			);

			await expect(service.getBySlug('loja')).rejects.toThrow(
				NotFoundException,
			);
		});

		it('dono e moderador veem empresa oculta', async () => {
			prisma.business.findUnique.mockResolvedValue(
				businessRow({ status: 'HIDE', ownerId: 'owner-1' }),
			);

			const owner = await service.getBySlug('loja', {
				id: 'owner-1',
				role: 'PROMOTER',
			});
			const mod = await service.getBySlug('loja', {
				id: 'm1',
				role: 'MODERATOR',
			});

			expect(owner.status).toBe('HIDE');
			expect(mod.status).toBe('HIDE');
		});

		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(service.getBySlug('fantasma')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('create', () => {
		const dto = {
			name: 'Loja',
			description: 'Descrição',
			province: 'LUANDA' as const,
			phone: '+244',
			categoryId: 'cat-1',
		};

		it('403 para USER', async () => {
			await expect(service.create('u1', 'USER', dto)).rejects.toThrow(
				ForbiddenException,
			);
		});

		it('cria a empresa com slug gerado do nome', async () => {
			prisma.category.findUnique.mockResolvedValue({
				id: 'cat-1',
				type: 'BUSINESS',
			});
			prisma.business.findUnique.mockResolvedValue(null);
			prisma.business.create.mockResolvedValue(businessRow());

			const result = await service.create('owner-1', 'PROMOTER', dto);

			expect(prisma.business.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					slug: 'loja',
					ownerId: 'owner-1',
					categoryId: 'cat-1',
				}),
				include: expect.anything(),
			});
			expect(result.slug).toBe('loja');
		});

		it('usa o slug informado', async () => {
			prisma.category.findUnique.mockResolvedValue({
				id: 'cat-1',
				type: 'BUSINESS',
			});
			prisma.business.findUnique.mockResolvedValue(null);
			prisma.business.create.mockResolvedValue(businessRow());

			await service.create('owner-1', 'ADMIN', {
				...dto,
				slug: 'central-do-tecido',
			});

			expect(prisma.business.create).toHaveBeenCalledWith({
				data: expect.objectContaining({ slug: 'central-do-tecido' }),
				include: expect.anything(),
			});
		});

		it('400 quando a categoria não é de empresas', async () => {
			prisma.category.findUnique.mockResolvedValue({
				id: 'cat-1',
				type: 'AD',
			});

			await expect(
				service.create('owner-1', 'PROMOTER', dto),
			).rejects.toThrow(BadRequestException);
		});

		it('409 quando o slug já existe', async () => {
			prisma.category.findUnique.mockResolvedValue({
				id: 'cat-1',
				type: 'BUSINESS',
			});
			prisma.business.findUnique.mockResolvedValue({ id: 'biz-x' });

			await expect(
				service.create('owner-1', 'PROMOTER', dto),
			).rejects.toThrow(ConflictException);
		});

		it('400 quando o slug gerado é vazio', async () => {
			await expect(
				service.create('owner-1', 'PROMOTER', {
					...dto,
					name: '!!!',
				}),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe('update', () => {
		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.update('owner-1', 'PROMOTER', 'ghost', { name: 'X' }),
			).rejects.toThrow(NotFoundException);
		});

		it('403 para não-dono sem privilégio', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
				slug: 'loja',
			});

			await expect(
				service.update('outro', 'USER', 'biz-1', { name: 'X' }),
			).rejects.toThrow(ForbiddenException);
		});

		it('dono atualiza a empresa e regera o slug do novo nome', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
				slug: 'loja',
			});
			prisma.business.update.mockResolvedValue(businessRow());

			const result = await service.update(
				'owner-1',
				'PROMOTER',
				'biz-1',
				{
					name: 'Nova Loja',
				},
			);

			expect(prisma.business.update).toHaveBeenCalledWith({
				where: { id: 'biz-1' },
				data: expect.objectContaining({ slug: 'nova-loja' }),
				include: expect.anything(),
			});
			expect(result.name).toBe('Loja');
		});

		it('409 quando o novo slug pertence a outra empresa', async () => {
			prisma.business.findUnique
				.mockResolvedValueOnce({
					id: 'biz-1',
					ownerId: 'owner-1',
					slug: 'loja',
				})
				.mockResolvedValueOnce({ id: 'biz-x' });

			await expect(
				service.update('owner-1', 'PROMOTER', 'biz-1', {
					slug: 'loja-outra',
				}),
			).rejects.toThrow(ConflictException);
		});
	});

	describe('setStatus', () => {
		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.setStatus('owner-1', 'PROMOTER', 'ghost', {
					status: 'HIDE',
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('dono alterna o estado', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.business.update.mockResolvedValue(
				businessRow({ status: 'HIDE' }),
			);

			const result = await service.setStatus(
				'owner-1',
				'PROMOTER',
				'biz-1',
				{
					status: 'HIDE',
				},
			);

			expect(result.status).toBe('HIDE');
			expect(prisma.business.update).toHaveBeenCalledWith({
				where: { id: 'biz-1' },
				data: { status: 'HIDE' },
				include: expect.anything(),
			});
		});

		it('403 para não-dono', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});

			await expect(
				service.setStatus('outro', 'USER', 'biz-1', {
					status: 'HIDE',
				}),
			).rejects.toThrow(ForbiddenException);
		});
	});

	describe('moderate', () => {
		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.moderate('ghost', { isVerified: true }),
			).rejects.toThrow(NotFoundException);
		});

		it('modera isVerified e status', async () => {
			prisma.business.findUnique.mockResolvedValue({ id: 'biz-1' });
			prisma.business.update.mockResolvedValue(
				businessRow({ isVerified: true }),
			);

			const result = await service.moderate('biz-1', {
				isVerified: true,
				status: 'HIDE',
			});

			expect(prisma.business.update).toHaveBeenCalledWith({
				where: { id: 'biz-1' },
				data: { isVerified: true, status: 'HIDE' },
				include: expect.anything(),
			});
			expect(result.isVerified).toBe(true);
		});
	});

	describe('remove', () => {
		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.remove('owner-1', 'PROMOTER', 'ghost'),
			).rejects.toThrow(NotFoundException);
		});

		it('dono remove a empresa', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.business.delete.mockResolvedValue({});

			await service.remove('owner-1', 'PROMOTER', 'biz-1');

			expect(prisma.business.delete).toHaveBeenCalledWith({
				where: { id: 'biz-1' },
			});
		});

		it('403 para não-dono', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});

			await expect(
				service.remove('outro', 'USER', 'biz-1'),
			).rejects.toThrow(ForbiddenException);
		});
	});
});
