import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsEnum,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import { Province } from '../generated/prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export const SEARCH_TARGETS = ['AD', 'BUSINESS'] as const;
export type SearchTarget = (typeof SEARCH_TARGETS)[number];

export const SEARCH_SORTS = ['relevance', 'newest', 'oldest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export class GlobalSearchQueryDto extends PaginationQueryDto {
	@ApiProperty({ example: 'iphone', description: 'Termo de pesquisa' })
	@IsString()
	@IsNotEmpty({ message: 'q é obrigatório' })
	@MaxLength(200, { message: 'q deve ter no máximo 200 caracteres' })
	q: string;

	@ApiPropertyOptional({
		enum: SEARCH_TARGETS,
		description: 'Limita a pesquisa a um tipo de resultado',
	})
	@IsOptional()
	@IsIn(SEARCH_TARGETS, { message: 'type inválido' })
	type?: SearchTarget;

	@ApiPropertyOptional({
		enum: SEARCH_SORTS,
		default: 'relevance',
		description: 'Ordenação dos resultados',
	})
	@IsOptional()
	@IsIn(SEARCH_SORTS, { message: 'sortBy inválido' })
	sortBy?: SearchSort;

	@ApiPropertyOptional({
		example: '00000000-0000-7000-8000-000000000001',
		description: 'Filtra anúncios/empresas de uma categoria',
	})
	@IsOptional()
	@IsUUID('7', { message: 'categoryId deve ser um UUID' })
	categoryId?: string;

	@ApiPropertyOptional({
		enum: Province,
		description: 'Filtra anúncios e empresas por província',
	})
	@IsOptional()
	@IsEnum(Province, { message: 'province inválida' })
	province?: Province;
}
