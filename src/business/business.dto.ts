import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsEmail,
	IsEnum,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	Matches,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessStatus, Province } from '../generated/prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BUSINESS_SORTS = [
	'newest',
	'oldest',
	'name_asc',
	'name_desc',
] as const;

export class BusinessGalleryItemDto {
	@ApiProperty({ example: 'https://cdn.test/img.jpg' })
	@IsUrl({}, { message: 'url deve ser uma URL válida' })
	url: string;

	@ApiProperty({ example: 'businesses/img-123' })
	@IsString()
	cloudinaryId: string;

	@ApiPropertyOptional({ example: 'image' })
	@IsOptional()
	@IsString()
	type?: string;
}

export class CreateBusinessDto {
	@ApiProperty({ example: 'Central do Tecido' })
	@IsString()
	@IsNotEmpty({ message: 'name é obrigatório' })
	@MaxLength(140, { message: 'name deve ter no máximo 140 caracteres' })
	name: string;

	@ApiPropertyOptional({
		example: 'central-do-tecido',
		description:
			'Slug opcional; quando ausente é gerado automaticamente a partir do nome',
	})
	@IsOptional()
	@IsString()
	@MaxLength(180)
	@Matches(SLUG_PATTERN, {
		message:
			'slug deve conter apenas letras minúsculas, números e hífens sem espaços',
	})
	slug?: string;

	@ApiProperty({ example: 'Loja de tecidos no mercado do São Paulo.' })
	@IsString()
	@IsNotEmpty({ message: 'description é obrigatória' })
	@MaxLength(5000, {
		message: 'description deve ter no máximo 5000 caracteres',
	})
	description: string;

	@ApiPropertyOptional({ example: 'Rua X, São Paulo, Luanda' })
	@IsOptional()
	@IsString()
	@MaxLength(300, { message: 'address deve ter no máximo 300 caracteres' })
	address?: string;

	@ApiProperty({ enum: Province, example: 'LUANDA' })
	@IsEnum(Province, { message: 'province inválida' })
	province: Province;

	@ApiProperty({ example: '+244 923 000 000' })
	@IsString()
	@IsNotEmpty({ message: 'phone é obrigatório' })
	@MaxLength(40, { message: 'phone deve ter no máximo 40 caracteres' })
	phone: string;

	@ApiPropertyOptional({ example: '+244 923 000 000' })
	@IsOptional()
	@IsString()
	@MaxLength(40)
	whatsapp?: string;

	@ApiPropertyOptional({ example: 'contacto@loja.ao' })
	@IsOptional()
	@IsEmail({}, { message: 'email deve ser um email válido' })
	email?: string;

	@ApiPropertyOptional({ example: 'https://loja.ao' })
	@IsOptional()
	@IsUrl({}, { message: 'website deve ser uma URL válida' })
	website?: string;

	@ApiPropertyOptional({ example: 'https://cdn.test/logo.jpg' })
	@IsOptional()
	@IsUrl({}, { message: 'logoUrl deve ser uma URL válida' })
	logoUrl?: string;

	@ApiPropertyOptional({ example: 'businesses/logo-123' })
	@IsOptional()
	@IsString()
	logoId?: string;

	@ApiPropertyOptional({ example: 'https://cdn.test/capa.jpg' })
	@IsOptional()
	@IsUrl({}, { message: 'coverUrl deve ser uma URL válida' })
	coverUrl?: string;

	@ApiPropertyOptional({ example: 'businesses/capa-123' })
	@IsOptional()
	@IsString()
	coverId?: string;

	@ApiPropertyOptional({
		type: [BusinessGalleryItemDto],
		description: 'Galeria [{ url, cloudinaryId, type }]',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10, { message: 'no máximo 10 itens na galeria' })
	@ValidateNested({ each: true })
	@Type(() => BusinessGalleryItemDto)
	gallery?: BusinessGalleryItemDto[];

	@ApiProperty({ example: 'categoria-id' })
	@IsUUID('7', { message: 'categoryId deve ser um UUID' })
	categoryId: string;
}

export class UpdateBusinessDto {
	@ApiPropertyOptional({ example: 'Central do Tecido' })
	@IsOptional()
	@IsString()
	@MaxLength(140)
	name?: string;

	@ApiPropertyOptional({ example: 'central-do-tecido' })
	@IsOptional()
	@IsString()
	@MaxLength(180)
	@Matches(SLUG_PATTERN, {
		message:
			'slug deve conter apenas letras minúsculas, números e hífens sem espaços',
	})
	slug?: string;

	@ApiPropertyOptional({
		example: 'Loja de tecidos no mercado do São Paulo.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	description?: string;

	@ApiPropertyOptional({ example: 'Rua X, São Paulo, Luanda' })
	@IsOptional()
	@IsString()
	@MaxLength(300)
	address?: string;

	@ApiPropertyOptional({ enum: Province })
	@IsOptional()
	@IsEnum(Province, { message: 'province inválida' })
	province?: Province;

	@ApiPropertyOptional({ example: '+244 923 000 000' })
	@IsOptional()
	@IsString()
	@MaxLength(40)
	phone?: string;

	@ApiPropertyOptional({ example: '+244 923 000 000' })
	@IsOptional()
	@IsString()
	@MaxLength(40)
	whatsapp?: string;

	@ApiPropertyOptional({ example: 'contacto@loja.ao' })
	@IsOptional()
	@IsEmail({}, { message: 'email deve ser um email válido' })
	email?: string;

	@ApiPropertyOptional({ example: 'https://loja.ao' })
	@IsOptional()
	@IsUrl({}, { message: 'website deve ser uma URL válida' })
	website?: string;

	@ApiPropertyOptional({ example: 'https://cdn.test/logo.jpg' })
	@IsOptional()
	@IsUrl({})
	logoUrl?: string;

	@ApiPropertyOptional({ example: 'businesses/logo-123' })
	@IsOptional()
	@IsString()
	logoId?: string;

	@ApiPropertyOptional({ example: 'https://cdn.test/capa.jpg' })
	@IsOptional()
	@IsUrl({})
	coverUrl?: string;

	@ApiPropertyOptional({ example: 'businesses/capa-123' })
	@IsOptional()
	@IsString()
	coverId?: string;

	@ApiPropertyOptional({ type: [BusinessGalleryItemDto] })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10)
	@ValidateNested({ each: true })
	@Type(() => BusinessGalleryItemDto)
	gallery?: BusinessGalleryItemDto[];

	@ApiPropertyOptional({ example: 'categoria-id' })
	@IsOptional()
	@IsUUID('7', { message: 'categoryId deve ser um UUID' })
	categoryId?: string;
}

export class UpdateBusinessStatusDto {
	@ApiProperty({ enum: BusinessStatus, example: 'HIDE' })
	@IsEnum(BusinessStatus, { message: 'status inválido' })
	status: BusinessStatus;
}

export class ModerateBusinessDto {
	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isVerified?: boolean;

	@ApiPropertyOptional({ enum: BusinessStatus })
	@IsOptional()
	@IsEnum(BusinessStatus, { message: 'status inválido' })
	status?: BusinessStatus;
}

export class BusinessesQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ enum: BUSINESS_SORTS, default: 'newest' })
	@IsOptional()
	@IsIn(BUSINESS_SORTS, { message: 'sortBy inválido' })
	sortBy?: (typeof BUSINESS_SORTS)[number];

	@ApiPropertyOptional({ description: 'Busca em nome, descrição e telefone' })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	q?: string;

	@ApiPropertyOptional({ enum: Province })
	@IsOptional()
	@IsEnum(Province, { message: 'province inválida' })
	province?: Province;

	@ApiPropertyOptional({ description: 'Filtrar por categoria' })
	@IsOptional()
	@IsUUID('7', { message: 'categoryId deve ser um UUID' })
	categoryId?: string;
}
