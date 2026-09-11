import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsArray,
	IsBoolean,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';

export class CreatePlanDto {
	@ApiProperty({ example: 'Básico' })
	@IsString()
	@IsNotEmpty({ message: 'name é obrigatório' })
	@MaxLength(80, { message: 'name deve ter no máximo 80 caracteres' })
	name: string;

	@ApiPropertyOptional({ example: 'Plano com anúncios destacados' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string;

	@ApiProperty({ example: 15000 })
	@IsNumber()
	@Min(0, { message: 'price deve ser >= 0' })
	price: number;

	@ApiPropertyOptional({ example: 'AOA' })
	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;

	@ApiPropertyOptional({ example: 30 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	durationDays?: number;

	@ApiPropertyOptional({ example: ['Anúncio na página inicial'] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	benefits?: string[];

	@ApiPropertyOptional({ example: 1 })
	@IsOptional()
	@IsInt()
	@Min(0)
	businessVisibilityLimit?: number;

	@ApiPropertyOptional({ example: 0 })
	@IsOptional()
	@IsInt()
	@Min(0)
	featuredAdsLimit?: number;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class UpdatePlanDto {
	@ApiPropertyOptional({ example: 'Básico' })
	@IsOptional()
	@IsString()
	@MaxLength(80)
	name?: string;

	@ApiPropertyOptional({ example: 'Plano com anúncios destacados' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string;

	@ApiPropertyOptional({ example: 15000 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	price?: number;

	@ApiPropertyOptional({ example: 'AOA' })
	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;

	@ApiPropertyOptional({ example: 30 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	durationDays?: number;

	@ApiPropertyOptional({ example: ['Anúncio na página inicial'] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	benefits?: string[];

	@ApiPropertyOptional({ example: 1 })
	@IsOptional()
	@IsInt()
	@Min(0)
	businessVisibilityLimit?: number;

	@ApiPropertyOptional({ example: 0 })
	@IsOptional()
	@IsInt()
	@Min(0)
	featuredAdsLimit?: number;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
