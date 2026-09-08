import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	IsUrl,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatus } from '../generated/prisma/client';

export class CreatePaymentDto {
	@ApiProperty({
		example: '00000000-0000-7000-8000-000000000001',
		description: 'Id da empresa que será tornada visível',
	})
	@IsUUID('7', { message: 'businessId deve ser um UUID' })
	businessId: string;

	@ApiProperty({
		example: '00000000-0000-7000-8000-000000000002',
		description: 'Id do plano a subscrever',
	})
	@IsUUID('7', { message: 'planId deve ser um UUID' })
	planId: string;
}

export class SubmitPaymentProofDto {
	@ApiProperty({ example: 'https://cdn.test/comprovativo.jpg' })
	@IsUrl({}, { message: 'proofUrl deve ser uma URL válida' })
	proofUrl: string;

	@ApiProperty({ example: 'payments/prova-123' })
	@IsString()
	@IsNotEmpty({ message: 'proofId é obrigatório' })
	proofId: string;
}

export class ReviewPaymentDto {
	@ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
	@IsIn(['APPROVED', 'REJECTED'], {
		message: 'decision deve ser APPROVED ou REJECTED',
	})
	decision: string;

	@ApiPropertyOptional({ example: 'Comprovativo válido.' })
	@IsOptional()
	@IsString()
	@MaxLength(500, { message: 'note deve ter no máximo 500 caracteres' })
	note?: string;
}

export class PaymentsQueryDto {
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

	@ApiPropertyOptional({ enum: PaymentStatus })
	@IsOptional()
	@IsIn(Object.values(PaymentStatus), { message: 'status inválido' })
	status?: PaymentStatus;
}
