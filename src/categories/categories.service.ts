import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { CacheService } from '../cache/cache.service';
import { Prisma } from '../generated/prisma/client';
import { CategoryType } from '../generated/prisma/client';
import { newId } from '../libs/id';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

export function slugify(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function isUniqueViolation(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2002'
	);
}

function isForeignKeyViolation(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2003'
	);
}

@Injectable()
export class CategoriesService {
	private readonly LIST_KEY = 'categories:all';
	private readonly TTL_MS = 60_000;

	constructor(
		private readonly prisma: PrismaService,
		private readonly cache: CacheService,
	) {}

	async list(type?: CategoryType) {
		const key = type ? `categories:${type}` : this.LIST_KEY;

		return this.cache.wrap(
			key,
			async () => {
				const categories = await this.prisma.category.findMany({
					where: type ? { type } : undefined,
					orderBy: [{ name: 'asc' }],
					include: {
						_count: { select: { ads: true, businesses: true } },
					},
				});

				return categories.map((category) => ({
					id: category.id,
					slug: category.slug,
					name: category.name,
					type: category.type,
					adCount: category._count.ads,
					businessCount: category._count.businesses,
				}));
			},
			this.TTL_MS,
		);
	}

	async getBySlug(slug: string) {
		const list = await this.list();

		const category = list.find((item) => item.slug === slug);
		if (!category) {
			throw new NotFoundException('Categoria não encontrada.');
		}

		return category;
	}

	async create(dto: CreateCategoryDto) {
		const slug = dto.slug ?? slugify(dto.name);
		if (!slug) {
			throw new ConflictException(
				'Nome inválido para gerar um slug para a categoria.',
			);
		}

		const existing = await this.findBySlug(slug);
		if (existing) {
			throw new ConflictException(
				'Já existe uma categoria com este slug.',
			);
		}

		try {
			return await this.prisma.category.create({
				data: {
					id: newId(),
					slug,
					name: dto.name,
					type: dto.type ?? 'AD',
				},
			});
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(
					'Já existe uma categoria com este slug.',
				);
			}
			throw error;
		}
	}

	async update(id: string, dto: UpdateCategoryDto) {
		const category = await this.prisma.category.findUnique({
			where: { id },
		});
		if (!category) {
			throw new NotFoundException('Categoria não encontrada.');
		}

		const slug = dto.slug ?? (dto.name ? slugify(dto.name) : undefined);

		if (slug && slug !== category.slug) {
			const existing = await this.findBySlug(slug);
			if (existing && existing.id !== category.id) {
				throw new ConflictException(
					'Já existe uma categoria com este slug.',
				);
			}
		}

		try {
			const updated = await this.prisma.category.update({
				where: { id },
				data: {
					name: dto.name,
					slug,
					type: dto.type,
				},
			});
			await this.invalidateCache();
			return updated;
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(
					'Já existe uma categoria com este slug.',
				);
			}
			throw error;
		}
	}

	async remove(id: string) {
		const category = await this.prisma.category.findUnique({
			where: { id },
		});
		if (!category) {
			throw new NotFoundException('Categoria não encontrada.');
		}

		try {
			await this.prisma.category.delete({ where: { id } });
			await this.invalidateCache();
		} catch (error) {
			if (isForeignKeyViolation(error)) {
				throw new ConflictException(
					'Não é possível remover uma categoria que possui anúncios ou empresas.',
				);
			}
			throw error;
		}
	}

	private async findBySlug(slug: string) {
		return this.prisma.category.findUnique({ where: { slug } });
	}

	private async invalidateCache() {
		await this.cache.delMany([
			this.LIST_KEY,
			...Object.values(CategoryType).map((type) => `categories:${type}`),
		]);
	}
}
