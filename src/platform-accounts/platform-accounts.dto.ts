import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class CreatePlatformAccountDto {
	@ApiProperty({ example: 'BFA' })
	@IsString()
	@IsNotEmpty({ message: 'bankName é obrigatório' })
	@MaxLength(120)
	bankName: string;

	@ApiProperty({ example: 'Caxinda Lda.' })
	@IsString()
	@IsNotEmpty({ message: 'bankHolder é obrigatório' })
	@MaxLength(120)
	bankHolder: string;

	@ApiProperty({ example: 'AO060000000000000000000001' })
	@IsString()
	@IsNotEmpty({ message: 'bankIban é obrigatório' })
	@MaxLength(60)
	bankIban: string;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class UpdatePlatformAccountDto {
	@ApiPropertyOptional({ example: 'BAI' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	bankName?: string;

	@ApiPropertyOptional({ example: 'Caxinda Lda.' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	bankHolder?: string;

	@ApiPropertyOptional({ example: 'AO060000000000000000000001' })
	@IsOptional()
	@IsString()
	@MaxLength(60)
	bankIban?: string;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
