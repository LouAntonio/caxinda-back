import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddWishlistDto {
	@ApiProperty({ example: '00000000-0000-7000-8000-000000000001' })
	@IsUUID('7', { message: 'adId deve ser um UUID' })
	adId: string;
}

export class WishlistQueryDto {
	@ApiProperty({ default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiProperty({ default: 20 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(50)
	limit?: number;
}
