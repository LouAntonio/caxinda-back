import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	IsUrl,
	MaxLength,
} from 'class-validator';
import { PaymentStatus } from '../generated/prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

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

export class PaymentsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ enum: PaymentStatus })
	@IsOptional()
	@IsIn(Object.values(PaymentStatus), { message: 'status inválido' })
	status?: PaymentStatus;
}
