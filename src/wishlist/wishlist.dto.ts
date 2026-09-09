import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export class AddWishlistDto {
	@ApiProperty({ example: '00000000-0000-7000-8000-000000000001' })
	@IsUUID('7', { message: 'adId deve ser um UUID' })
	adId: string;
}

export class WishlistQueryDto extends PaginationQueryDto {}
