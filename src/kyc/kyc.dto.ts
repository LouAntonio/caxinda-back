import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SelfieDto {
	@ApiProperty()
	@IsUrl({}, { message: 'url da selfie deve ser uma URL válida' })
	url: string;

	@ApiProperty()
	@IsString()
	cloudinaryId: string;
}

export class SubmitKycDto {
	@ApiProperty({ description: 'URL da foto frente do BI' })
	@IsUrl({}, { message: 'biFrontUrl deve ser uma URL válida' })
	biFrontUrl: string;

	@ApiProperty({ description: 'Public ID no Cloudinary do BI frente' })
	@IsString()
	biFrontId: string;

	@ApiProperty({ description: 'URL da foto verso do BI' })
	@IsUrl({}, { message: 'biBackUrl deve ser uma URL válida' })
	biBackUrl: string;

	@ApiProperty({ description: 'Public ID no Cloudinary do BI verso' })
	@IsString()
	biBackId: string;

	@ApiProperty({
		type: [SelfieDto],
		description: '3 selfies [{ url, cloudinaryId }]',
	})
	@IsArray()
	@ArrayMinSize(3, { message: 'Envie exatamente 3 selfies' })
	@ArrayMaxSize(3, { message: 'Envie exatamente 3 selfies' })
	@ValidateNested({ each: true })
	@Type(() => SelfieDto)
	selfies: SelfieDto[];

	@ApiProperty({ description: 'URL da foto de corpo inteiro' })
	@IsUrl({}, { message: 'fullBodyUrl deve ser uma URL válida' })
	fullBodyUrl: string;

	@ApiProperty({
		description: 'Public ID no Cloudinary da foto de corpo inteiro',
	})
	@IsString()
	fullBodyId: string;
}

export class ReviewKycDto {
	@ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
	@IsIn(['APPROVED', 'REJECTED'], {
		message: 'status deve ser APPROVED ou REJECTED',
	})
	status: 'APPROVED' | 'REJECTED';

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(500)
	rejectionReason?: string;
}

export interface KycSelfie {
	url: string;
	cloudinaryId: string;
}

export class ListKycQueryDto {
	@ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
	@IsOptional()
	@IsIn(['PENDING', 'APPROVED', 'REJECTED'], {
		message: 'status deve ser PENDING, APPROVED ou REJECTED',
	})
	status?: 'PENDING' | 'APPROVED' | 'REJECTED';

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
