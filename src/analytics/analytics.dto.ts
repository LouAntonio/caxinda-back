import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

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
}
