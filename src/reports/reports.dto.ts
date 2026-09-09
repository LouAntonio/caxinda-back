import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
	ReportReason,
	ReportStatus,
	ReportTarget,
} from '../generated/prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export class ReportMediaDto {
	@ApiProperty({ example: 'https://cdn.test/rep.jpg' })
	@IsString()
	@IsNotEmpty()
	url: string;

	@ApiProperty({ example: 'reports/rep-123' })
	@IsString()
	@IsNotEmpty()
	cloudinaryId: string;

	@ApiPropertyOptional({ example: 'image' })
	@IsOptional()
	@IsString()
	type?: string;
}

export class CreateReportDto {
	@ApiProperty({
		enum: ReportTarget,
		example: ReportTarget.AD,
		description: 'Tipo do alvo da denúncia',
	})
	@IsEnum(ReportTarget, { message: 'targetType inválido' })
	targetType: ReportTarget;

	@ApiProperty({ example: '00000000-0000-7000-8000-000000000001' })
	@IsUUID('7', { message: 'targetId deve ser um UUID' })
	targetId: string;

	@ApiProperty({
		enum: ReportReason,
		example: ReportReason.FRAUD,
		description: 'Motivo da denúncia',
	})
	@IsEnum(ReportReason, { message: 'reason inválido' })
	reason: ReportReason;

	@ApiPropertyOptional({
		example: 'O anúncio parece ser uma fraude',
		description: 'Descrição textual opcional',
	})
	@IsOptional()
	@IsString()
	@MaxLength(2000, {
		message: 'description deve ter no máximo 2000 caracteres',
	})
	description?: string;

	@ApiPropertyOptional({
		type: [ReportMediaDto],
		description: 'Até 3 imagens [{url, cloudinaryId, type}]',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(3, { message: 'no máximo 3 imagens por denúncia' })
	@ValidateNested({ each: true })
	@Type(() => ReportMediaDto)
	media?: ReportMediaDto[];
}

export class UpdateReportStatusDto {
	@ApiProperty({ enum: ReportStatus, example: ReportStatus.RESOLVED })
	@IsEnum(ReportStatus, { message: 'status inválido' })
	status: ReportStatus;
}

export class ReportsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ enum: ReportStatus })
	@IsOptional()
	@IsEnum(ReportStatus, { message: 'status inválido' })
	status?: ReportStatus;

	@ApiPropertyOptional({ enum: ReportTarget })
	@IsOptional()
	@IsEnum(ReportTarget, { message: 'targetType inválido' })
	targetType?: ReportTarget;

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID('7', { message: 'targetId deve ser um UUID' })
	targetId?: string;
}

export class ReportCountQueryDto {
	@ApiProperty({ enum: ReportTarget })
	@IsEnum(ReportTarget, { message: 'targetType inválido' })
	targetType: ReportTarget;

	@ApiProperty()
	@IsUUID('7', { message: 'targetId deve ser um UUID' })
	targetId: string;
}

export interface ReportSessionUser {
	id: string;
	role: string;
}

export { ReportTarget };
