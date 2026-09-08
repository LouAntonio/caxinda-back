import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsDate,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateConversationDto {
	@ApiProperty({
		example: '00000000-0000-7000-8000-000000000001',
		description: 'Id do anúncio sobre o qual a conversa será aberta',
	})
	@IsUUID('7', { message: 'adId deve ser um UUID' })
	adId: string;
}

export class ChatMediaDto {
	@ApiProperty({ example: 'https://cdn.test/msg.jpg' })
	@IsUrl({}, { message: 'url deve ser uma URL válida' })
	url: string;

	@ApiProperty({ example: 'chat/msg-123' })
	@IsString()
	cloudinaryId: string;

	@ApiPropertyOptional({ example: 'image' })
	@IsOptional()
	@IsString()
	type?: string;
}

export class SendMessageDto {
	@ApiPropertyOptional({ example: 'Olá, o anuncio ainda está disponível?' })
	@IsOptional()
	@IsString()
	@IsNotEmpty({ message: 'content não pode ser vazio' })
	@MaxLength(5000, {
		message: 'content deve ter no máximo 5000 caracteres',
	})
	content?: string;

	@ApiPropertyOptional({
		type: [ChatMediaDto],
		description: 'Mídia da mensagem [{ url, cloudinaryId, type }]',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(10, { message: 'no máximo 10 itens de mídia por mensagem' })
	@ValidateNested({ each: true })
	@Type(() => ChatMediaDto)
	media?: ChatMediaDto[];
}

export class MessageQueryDto {
	@ApiPropertyOptional({ default: 50 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;

	@ApiPropertyOptional({
		description:
			'Cursor: retorna mensagens anteriores a este createdAt (ISO)',
	})
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	before?: Date;
}

export class ConversationsQueryDto {
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

export class ReadConversationDto {
	@ApiProperty({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	readAll?: boolean;
}
