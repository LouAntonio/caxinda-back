import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewDto {
	@ApiPropertyOptional({ example: '00000000-0000-7000-8000-000000000001' })
	@IsOptional()
	@IsUUID('7', { message: 'adId deve ser um UUID' })
	adId?: string;

	@ApiPropertyOptional({ example: '00000000-0000-7000-8000-000000000002' })
	@IsOptional()
	@IsUUID('7', { message: 'businessId deve ser um UUID' })
	businessId?: string;

	@ApiProperty({ example: 5, minimum: 1, maximum: 5 })
	@IsInt()
	@Min(1, { message: 'rating deve ser entre 1 e 5' })
	@Max(5, { message: 'rating deve ser entre 1 e 5' })
	rating: number;

	@ApiPropertyOptional({ example: 'Produto em ótimo estado!' })
	@IsOptional()
	@IsString()
	@MaxLength(1000, { message: 'comment deve ter no máximo 1000 caracteres' })
	comment?: string;
}

export class RespondReviewDto {
	@ApiProperty({ example: 'Obrigado pelo feedback!' })
	@IsString()
	@IsNotEmpty({ message: 'response não pode ser vazio' })
	@MaxLength(1000, {
		message: 'response deve ter no máximo 1000 caracteres',
	})
	response: string;
}

export class ReviewsQueryDto {
	@ApiPropertyOptional({ description: 'Filtrar por anúncio' })
	@IsOptional()
	@IsUUID('7', { message: 'adId deve ser um UUID' })
	adId?: string;

	@ApiPropertyOptional({ description: 'Filtrar por empresa' })
	@IsOptional()
	@IsUUID('7', { message: 'businessId deve ser um UUID' })
	businessId?: string;

	@ApiPropertyOptional({ description: 'Filtrar por usuário avaliado' })
	@IsOptional()
	@IsUUID('7', { message: 'revieweeId deve ser um UUID' })
	revieweeId?: string;

	@ApiPropertyOptional({ default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({ default: 20 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(50)
	limit?: number;
}

export interface ReviewSessionUser {
	id: string;
	role: string;
}
