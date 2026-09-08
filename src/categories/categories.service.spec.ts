import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { CacheService } from '../cache/cache.service';
import { Prisma } from '../generated/prisma/client';
import { CategoriesService, slugify } from './categories.service';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
	const error = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
	error.code = code;
	return error;
}

describe('slugify', () => {
	it('normaliza acentuação, minúsculas e hífens', () => {
		expect(slugify('Eletrónica & Cia')).toBe('eletronica-cia');
	});

	it('remove hífens das bordas', () => {
		expect(slugify('  Veículos Usados  ')).toBe('veiculos-usados');
	});
});

describe('CategoriesService', () => {
	let service: CategoriesService;
	let prisma: {
		category: {
			findMany: jest.Mock;
			findUnique: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			delete: jest.Mock;
		};
	};

	const categoryRow = {
		id: 'cat-1',
		slug: 'eletronica',
		name: 'Eletrónica',
		type: 'AD',
		_count: { ads: 3, businesses: 0 },
	};

	const cache = {
		wrap: jest.fn(async <T>(_key: string, fn: () => Promise<T>) => fn()),
		get: jest.fn(),
		set: jest.fn(),
		del: jest.fn(),
		delMany: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		prisma = {
			category: {
				findMany: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
			},
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				CategoriesService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: CacheService, useValue: cache },
			],
		}).compile();

		service = moduleRef.get(CategoriesService);
	});

	describe('list', () => {
		it('ordena por nome e inclui adCount e businessCount', async () => {
			prisma.category.findMany.mockResolvedValue([categoryRow]);

			const result = await service.list();

			expect(prisma.category.findMany).toHaveBeenCalledWith({
				where: undefined,
				orderBy: [{ name: 'asc' }],
				include: {
					_count: { select: { ads: true, businesses: true } },
				},
			});
			expect(result).toEqual([
				{
					id: 'cat-1',
					slug: 'eletronica',
					name: 'Eletrónica',
					type: 'AD',
					adCount: 3,
					businessCount: 0,
				},
			]);
		});

		it('filtra por tipo quando informado', async () => {
			prisma.category.findMany.mockResolvedValue([categoryRow]);

			const result = await service.list('BUSINESS');

			expect(prisma.category.findMany).toHaveBeenCalledWith({
				where: { type: 'BUSINESS' },
				orderBy: [{ name: 'asc' }],
				include: {
					_count: { select: { ads: true, businesses: true } },
				},
			});
			expect(result).toHaveLength(1);
		});
	});

	describe('getBySlug', () => {
		it('retorna a categoria quando existe', async () => {
			prisma.category.findMany.mockResolvedValue([categoryRow]);

			const result = await service.getBySlug('eletronica');

			expect(prisma.category.findMany).toHaveBeenCalledWith({
				where: undefined,
				orderBy: [{ name: 'asc' }],
				include: {
					_count: { select: { ads: true, businesses: true } },
				},
			});
			expect(result.adCount).toBe(3);
		});

		it('lança NotFoundException quando não existe', async () => {
			prisma.category.findMany.mockResolvedValue([categoryRow]);

			await expect(service.getBySlug('fantasma')).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});
	});

	describe('create', () => {
		it('gera slug a partir do nome quando não informado', async () => {
			prisma.category.findUnique.mockResolvedValue(null);
			prisma.category.create.mockResolvedValue({
				...categoryRow,
				slug: 'eletronica',
			});

			const result = await service.create({ name: 'Eletrónica' });

			expect(prisma.category.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					slug: 'eletronica',
					name: 'Eletrónica',
					type: 'AD',
				}),
			});
			expect(result.slug).toBe('eletronica');
		});

		it('usa o tipo informado quando fornecido', async () => {
			prisma.category.findUnique.mockResolvedValue(null);
			prisma.category.create.mockResolvedValue({
				...categoryRow,
				type: 'BUSINESS',
			});

			await service.create({
				name: 'Restaurantes',
				type: 'BUSINESS',
			});

			expect(prisma.category.create).toHaveBeenCalledWith({
				data: expect.objectContaining({ type: 'BUSINESS' }),
			});
		});

		it('usa o slug informado quando existe', async () => {
			prisma.category.findUnique.mockResolvedValue(null);
			prisma.category.create.mockResolvedValue(categoryRow);

			const result = await service.create({
				name: 'Eletrónica',
				slug: 'eletronica',
			});

			expect(prisma.category.create).toHaveBeenCalledWith({
				data: expect.objectContaining({ slug: 'eletronica' }),
			});
			expect(result).toEqual(categoryRow);
		});

		it('lança ConflictException quando o slug já existe', async () => {
			prisma.category.findUnique.mockResolvedValue(categoryRow);

			await expect(
				service.create({ name: 'Eletrónica' }),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('lança ConflictException em violação única do banco', async () => {
			prisma.category.findUnique.mockResolvedValue(null);
			prisma.category.create.mockRejectedValue(prismaError('P2002'));

			await expect(
				service.create({ name: 'Eletrónica' }),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('lança ConflictException quando o slug gerado é vazio', async () => {
			await expect(
				service.create({ name: '!!!' }),
			).rejects.toBeInstanceOf(ConflictException);
		});
	});

	describe('update', () => {
		it('atualiza nome e gera novo slug quando o nome muda', async () => {
			prisma.category.findUnique.mockResolvedValue({
				...categoryRow,
				slug: 'eletronica',
				name: 'Eletrónica',
			});
			prisma.category.findUnique.mockResolvedValueOnce({
				...categoryRow,
				slug: 'eletronica',
			});
			prisma.category.findUnique.mockResolvedValueOnce(null);
			prisma.category.update.mockResolvedValue({
				...categoryRow,
				name: 'Eletro',
				slug: 'eletro',
			});

			const result = await service.update('cat-1', {
				name: 'Eletro',
			});

			expect(prisma.category.update).toHaveBeenCalledWith({
				where: { id: 'cat-1' },
				data: expect.objectContaining({ slug: 'eletro' }),
			});
			expect(result.slug).toBe('eletro');
		});

		it('mantém o slug quando só o nome não muda', async () => {
			prisma.category.findUnique.mockResolvedValue({
				...categoryRow,
				slug: 'eletronica',
			});
			prisma.category.update.mockResolvedValue(categoryRow);

			const result = await service.update('cat-1', {
				slug: 'eletronica',
			});

			expect(result.slug).toBe('eletronica');
		});

		it('lança ConflictException quando o slug pertence a outra categoria', async () => {
			prisma.category.findUnique.mockResolvedValueOnce({
				...categoryRow,
				slug: 'eletronica',
			});
			prisma.category.findUnique.mockResolvedValueOnce({
				...categoryRow,
				id: 'cat-outra',
				slug: 'eletro',
			});

			await expect(
				service.update('cat-1', { slug: 'eletro' }),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('lança NotFoundException quando a categoria não existe', async () => {
			prisma.category.findUnique.mockResolvedValue(null);

			await expect(
				service.update('ghost', { name: 'X' }),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('remove', () => {
		it('remove a categoria quando existe', async () => {
			prisma.category.findUnique.mockResolvedValue(categoryRow);
			prisma.category.delete.mockResolvedValue(categoryRow);

			await service.remove('cat-1');

			expect(prisma.category.delete).toHaveBeenCalledWith({
				where: { id: 'cat-1' },
			});
		});

		it('lança NotFoundException quando não existe', async () => {
			prisma.category.findUnique.mockResolvedValue(null);

			await expect(service.remove('ghost')).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});

		it('lança ConflictException quando a categoria tem anúncios', async () => {
			prisma.category.findUnique.mockResolvedValue(categoryRow);
			prisma.category.delete.mockRejectedValue(prismaError('P2003'));

			await expect(service.remove('cat-1')).rejects.toBeInstanceOf(
				ConflictException,
			);
		});
	});
});
