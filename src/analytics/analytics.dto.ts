import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsDateString,
	IsEnum,
	IsIn,
	IsOptional,
	IsUUID,
} from 'class-validator';
import { Province } from '../generated/prisma/client';

export const CONTACT_CHANNELS = [
	'phone',
	'whatsapp',
	'email',
	'website',
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const ANALYTICS_RANGES = [
	'7d',
	'30d',
	'90d',
	'180d',
	'365d',
	'730d',
] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const ANALYTICS_GROUP_BY = ['day', 'week', 'month'] as const;

export type AnalyticsGroupBy = (typeof ANALYTICS_GROUP_BY)[number];

export const ANALYTICS_TYPES = ['AD', 'BUSINESS'] as const;

export type AnalyticsType = (typeof ANALYTICS_TYPES)[number];

export interface AnalyticsQuery {
	range?: AnalyticsRange;
	from?: string;
	to?: string;
	groupBy?: AnalyticsGroupBy;
	type?: AnalyticsType;
	categories?: string[];
	provinces?: Province[];
}

/** Transforma um valor separado por vírgulas numa array limpa. */
export function csvToArray(value: unknown): string[] {
	if (typeof value !== 'string') {
		return [];
	}
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export class TrackBusinessClickDto {
	@ApiProperty({ example: '00000000-0000-7000-8000-000000000001' })
	@IsUUID('7', { message: 'businessId deve ser um UUID' })
	businessId: string;

	@ApiProperty({ enum: CONTACT_CHANNELS, example: 'whatsapp' })
	@IsIn(CONTACT_CHANNELS, {
		message: 'channel deve ser phone, whatsapp, email ou website',
	})
	channel: ContactChannel;
}

export class AnalyticsRangeDto {
	@ApiPropertyOptional({ enum: ANALYTICS_RANGES, default: '30d' })
	@IsOptional()
	@IsIn(ANALYTICS_RANGES, {
		message: 'range deve ser 7d, 30d, 90d, 180d, 365d ou 730d',
	})
	range: AnalyticsRange = '30d';

	@ApiPropertyOptional({
		description: 'Data inicial (YYYY-MM-DD)',
		example: '2026-09-01',
	})
	@IsOptional()
	@IsDateString({}, { message: 'from deve ser uma data ISO 8601 válida' })
	from?: string;

	@ApiPropertyOptional({
		description: 'Data final (YYYY-MM-DD)',
		example: '2026-09-12',
	})
	@IsOptional()
	@IsDateString({}, { message: 'to deve ser uma data ISO 8601 válida' })
	to?: string;

	@ApiPropertyOptional({ enum: ANALYTICS_GROUP_BY, default: 'day' })
	@IsOptional()
	@IsIn(ANALYTICS_GROUP_BY, {
		message: 'groupBy deve ser day, week ou month',
	})
	groupBy?: AnalyticsGroupBy;

	@ApiPropertyOptional({ enum: ANALYTICS_TYPES, example: 'AD' })
	@IsOptional()
	@IsIn(ANALYTICS_TYPES, { message: 'type deve ser AD ou BUSINESS' })
	type?: AnalyticsType;

	@ApiPropertyOptional({
		description: 'IDs de categorias separados por vírgula (UUIDs)',
		example: '00000000-0000-7000-8000-00000000000a',
	})
	@IsOptional()
	@Transform(({ value }) => csvToArray(value))
	@IsUUID('7', { each: true, message: 'categories deve conter UUIDs' })
	categories?: string[];

	@ApiPropertyOptional({
		description: 'Províncias separadas por vírgula (ex.: LUANDA,BENGUELA)',
		example: 'LUANDA',
	})
	@IsOptional()
	@Transform(({ value }) => csvToArray(value))
	@IsEnum(Province, { each: true, message: 'province inválida' })
	provinces?: Province[];
}
