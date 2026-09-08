import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class MagicLinkRequestDto {
	@ApiProperty({ example: 'user@example.com' })
	@IsEmail()
	email: string;
}

export class MagicLinkVerifyDto {
	@ApiProperty({ description: 'Token recebido pelo link do e-mail' })
	@IsString()
	token: string;
}

export class SetPasswordDto {
	@ApiProperty({ minLength: 8 })
	@IsString()
	@MinLength(8)
	@MaxLength(72)
	newPassword: string;
}
