import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const AD_STATUSES = ['ACTIVE', 'SOLD', 'ARCHIVED', 'REJECTED'] as const;
export const AD_VISIBILITIES = ['VISIBLE', 'HIDDEN'] as const;
export const AD_SORTS = [
	'newest',
	'oldest',
	'price_asc',
	'price_desc',
	'distance',
] as const;

function toBoolean(value: unknown): boolean {
	if (value === true || value === 'true') {
		return true;
	}
	return false;
}

export class GalleryItemDto {
	@ApiProperty({ example: 'https://cdn.test/img.jpg' })
	@IsUrl({}, { message: 'url deve ser uma URL válida' })
	url: string;

	@ApiProperty({ example: 'ads/img-123' })
	@IsString()
	cloudinaryId: string;

	@ApiPropertyOptional({ example: 'image' })
	@IsOptional()
	@IsString()
	type?: string;
}

export class LocationDto {
	@ApiProperty({ example: -8.8383 })
	@IsNumber({}, { message: 'lat deve ser um número' })
	@Min(-90)
	@Max(90)
	lat: number;

	@ApiProperty({ example: 13.2344 })
	@IsNumber({}, { message: 'lng deve ser um número' })
	@Min(-180)
	@Max(180)
	lng: number;
}

export class CreateAdDto {
	@ApiProperty({ example: 'iPhone 12 64GB' })
	@IsString()
	@IsNotEmpty({ message: 'title é obrigatório' })
	@MaxLength(140, { message: 'title deve ter no máximo 140 caracteres' })
	title: string;

	@ApiProperty({ example: 'Em ótimo estado, com caixa e carregador.' })
	@IsString()
	@IsNotEmpty({ message: 'description é obrigatória' })
	@MaxLength(5000, {
		message: 'description deve ter no máximo 5000 caracteres',
	})
	description: string;

	@ApiPropertyOptional({ example: 250000 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber({}, { message: 'price deve ser um número' })
	@Min(0)
	price?: number;

	@ApiPropertyOptional({
		example: 'iphone-12-64gb',
		description:
			'Slug opcional; quando ausente é gerado automaticamente a partir do título',
	})
	@IsOptional()
	@IsString()
	@MaxLength(180)
	@Matches(SLUG_PATTERN, {
		message:
			'slug deve conter apenas letras minúsculas, números e hífens sem espaços',
	})
	slug?: string;

	@ApiProperty({
		type: [String],
		example: ['categoria-id-1', 'categoria-id-2'],
		description: 'Uma ou mais categorias',
	})
	@IsArray()
	@ArrayMinSize(1, { message: 'informe ao menos uma categoria' })
	@ArrayMaxSize(5, { message: 'no máximo 5 categorias por anúncio' })
	@IsUUID('7', { each: true, message: 'categoryIds deve conter UUIDs' })
	categoryIds: string[];

	@ApiPropertyOptional({ example: 'https://cdn.test/capa.jpg' })
	@IsOptional()
	@IsUrl({}, { message: 'image deve ser uma URL válida' })
	image?: string;

	@ApiPropertyOptional({ example: 'ads/capa-123' })
	@IsOptional()
	@IsString()
	imageId?: string;

	@ApiPropertyOptional({
		type: [GalleryItemDto],
		description: 'Galeria [{ url, cloudinaryId, type }]',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10, { message: 'no máximo 10 itens na galeria' })
	@ValidateNested({ each: true })
	@Type(() => GalleryItemDto)
	gallery?: GalleryItemDto[];

	@ApiPropertyOptional({
		type: LocationDto,
		description: 'Localização { lat, lng }',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => LocationDto)
	location?: LocationDto;
}

export class UpdateAdDto {
	@ApiPropertyOptional({ example: 'iPhone 12 64GB' })
	@IsOptional()
	@IsString()
	@MaxLength(140)
	title?: string;

	@ApiPropertyOptional({ example: 'Em ótimo estado, com caixa.' })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	description?: string;

	@ApiPropertyOptional({ example: 250000 })
	@IsOptional()
	@Type(() => Number)
	@IsNumber({}, { message: 'price deve ser um número' })
	@Min(0)
	price?: number;

	@ApiPropertyOptional({
		example: 'iphone-12-64gb',
		description:
			'Slug opcional; quando ausente e o título mudar, é regenerado do novo título',
	})
	@IsOptional()
	@IsString()
	@MaxLength(180)
	@Matches(SLUG_PATTERN, {
		message:
			'slug deve conter apenas letras minúsculas, números e hífens sem espaços',
	})
	slug?: string;

	@ApiPropertyOptional({
		type: [String],
		description: 'Substitui todas as categorias do anúncio',
	})
	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(5)
	@IsUUID('7', { each: true })
	categoryIds?: string[];

	@ApiPropertyOptional()
	@IsOptional()
	@IsUrl({})
	image?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	imageId?: string;

	@ApiPropertyOptional({ type: [GalleryItemDto] })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@ValidateNested({ each: true })
	@Type(() => GalleryItemDto)
	gallery?: GalleryItemDto[];

	@ApiPropertyOptional({ type: LocationDto, nullable: true })
	@IsOptional()
	@ValidateNested()
	@Type(() => LocationDto)
	location?: LocationDto | null;
}

export class UpdateVisibilityDto {
	@ApiProperty({ enum: AD_VISIBILITIES, example: 'HIDDEN' })
	@IsIn(AD_VISIBILITIES, { message: 'visibility inválida' })
	visibility: (typeof AD_VISIBILITIES)[number];
}

export class ModerateAdDto {
	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	verified?: boolean;

	@ApiPropertyOptional({ enum: AD_STATUSES })
	@IsOptional()
	@IsIn(AD_STATUSES, { message: 'status inválido' })
	status?: (typeof AD_STATUSES)[number];
}

export class AdQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ enum: AD_SORTS, default: 'newest' })
	@IsOptional()
	@IsIn(AD_SORTS, { message: 'sortBy inválido' })
	sortBy?: (typeof AD_SORTS)[number];

	@ApiPropertyOptional({
		description: 'IDs de categoria separados por vírgula (ex.: a,b,c)',
	})
	@IsOptional()
	@IsString()
	categoryIds?: string;

	@ApiPropertyOptional({
		description:
			'Slugs de categoria separados por vírgula (ex.: carros,tec)',
	})
	@IsOptional()
	@IsString()
	categorySlugs?: string;

	@ApiPropertyOptional({ description: 'Busca em título e descrição' })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	q?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	minPrice?: number;

	@ApiPropertyOptional()
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	maxPrice?: number;

	@ApiPropertyOptional({
		description: 'Listar também inativos/ocultos (apenas MODERATOR/ADMIN)',
	})
	@IsOptional()
	@Transform(({ value }) => toBoolean(value))
	includeInactive?: boolean;

	@ApiPropertyOptional({
		description: 'Filtrar apenas anúncios em destaque',
	})
	@IsOptional()
	@Transform(({ value }) => toBoolean(value))
	featured?: boolean;

	@ApiPropertyOptional({
		description: 'Filtrar anúncios de um utilizador específico',
	})
	@IsOptional()
	@IsString()
	userId?: string;

	@ApiPropertyOptional({
		description: 'Latitude (com lng, ativa proximidade)',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(-90)
	@Max(90)
	lat?: number;

	@ApiPropertyOptional({
		description: 'Longitude (com lat, ativa proximidade)',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(-180)
	@Max(180)
	lng?: number;

	@ApiPropertyOptional({ default: 10, description: 'Raio em km' })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	@Max(199)
	radiusKm?: number;
}

export class AdProximityQueryDto {
	@ApiPropertyOptional({
		description: 'Latitude (com lng, calcula a distância até o anúncio)',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(-90)
	@Max(90)
	lat?: number;

	@ApiPropertyOptional({
		description: 'Longitude (com lat, calcula a distância até o anúncio)',
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(-180)
	@Max(180)
	lng?: number;
}

export class AdminListAdsQueryDto extends PaginationQueryDto {
	static readonly LIMIT_MAX = 100;

	@ApiPropertyOptional({ enum: AD_STATUSES })
	@IsOptional()
	@IsIn(AD_STATUSES)
	status?: (typeof AD_STATUSES)[number];

	@ApiPropertyOptional({ enum: ['VISIBLE', 'HIDDEN'] })
	@IsOptional()
	@IsIn(['VISIBLE', 'HIDDEN'])
	visibility?: 'VISIBLE' | 'HIDDEN';

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(200)
	q?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	sellerName?: string;
}
