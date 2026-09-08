import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
} from 'class-validator';
import { CategoryType } from '../generated/prisma/client';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
	@ApiProperty({ example: 'Eletrónica' })
	@IsString()
	@IsNotEmpty({ message: 'name é obrigatório' })
	@MaxLength(80, { message: 'name deve ter no máximo 80 caracteres' })
	name: string;

	@ApiPropertyOptional({
		example: 'AD',
		enum: CategoryType,
		description: 'Tipo da categoria (AD ou BUSINESS). Padrão: AD',
	})
	@IsOptional()
	@IsEnum(CategoryType, {
		message: 'type deve ser AD ou BUSINESS',
	})
	type?: CategoryType;

	@ApiPropertyOptional({
		example: 'eletronica',
		description: 'Slug automático a partir do nome se não informado',
	})
	@IsOptional()
	@IsString()
	@MaxLength(80)
	@Matches(SLUG_PATTERN, {
		message:
			'slug deve conter apenas letras minúsculas, números e hífens sem espaços',
	})
	slug?: string;
}

export class UpdateCategoryDto {
	@ApiPropertyOptional({ example: 'Eletrónica' })
	@IsOptional()
	@IsString()
	@MaxLength(80)
	name?: string;

	@ApiPropertyOptional({ example: 'eletronica' })
	@IsOptional()
	@IsString()
	@MaxLength(80)
	@Matches(SLUG_PATTERN, {
		message:
			'slug deve conter apenas letras minúsculas, números e hífens sem espaços',
	})
	slug?: string;

	@ApiPropertyOptional({
		example: 'BUSINESS',
		enum: CategoryType,
	})
	@IsOptional()
	@IsEnum(CategoryType, {
		message: 'type deve ser AD ou BUSINESS',
	})
	type?: CategoryType;
}
