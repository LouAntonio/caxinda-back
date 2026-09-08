import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsEmail,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ALL_ROLES } from '../auth/roles';
import { IsIBAN } from '../libs/iban';

export class UpdateProfileDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	name?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	surname?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(40)
	phone?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	neighborhood?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	city?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	province?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(2048)
	image?: string;

	@ApiPropertyOptional({ description: 'Banco para receber o pagamento' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	bankName?: string;

	@ApiPropertyOptional({ description: 'Nome do titular da conta' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	bankHolder?: string;

	@ApiPropertyOptional({ description: 'IBAN' })
	@IsOptional()
	@IsIBAN()
	bankIban?: string;
}

export class CreateUserDto {
	@ApiProperty({ example: 'novo@caxinda.com' })
	@IsEmail({}, { message: 'email deve ser um email válido' })
	email: string;

	@ApiProperty({ example: 'João' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	name: string;

	@ApiPropertyOptional({ enum: ALL_ROLES, default: 'USER' })
	@IsOptional()
	@IsIn(ALL_ROLES, { message: 'role inválida' })
	role?: string;
}

export class BanUserDto {
	@ApiPropertyOptional({ description: 'Motivo do banimento' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	reason?: string;

	@ApiPropertyOptional({
		description: 'Duração em segundos. Omita para banimento permanente.',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Type(() => Number)
	banExpiresIn?: number;
}

export class SetRoleDto {
	@ApiProperty({ enum: ALL_ROLES })
	@IsIn(ALL_ROLES, { message: 'role deve ser uma role válida' })
	role: string;
}

export class ListUsersQueryDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	searchValue?: string;

	@ApiPropertyOptional({ enum: ['email', 'name'] })
	@IsOptional()
	@IsIn(['email', 'name'])
	searchField?: 'email' | 'name';

	@ApiPropertyOptional({ enum: ['contains', 'starts_with', 'ends_with'] })
	@IsOptional()
	@IsIn(['contains', 'starts_with', 'ends_with'])
	searchOperator?: 'contains' | 'starts_with' | 'ends_with';

	@ApiPropertyOptional()
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number;

	@ApiPropertyOptional()
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset?: number;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	sortBy?: string;

	@ApiPropertyOptional({ enum: ['asc', 'desc'] })
	@IsOptional()
	@IsIn(['asc', 'desc'])
	sortDirection?: 'asc' | 'desc';

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	filterField?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@ValidateIf((o: ListUsersQueryDto) => o.filterField !== undefined)
	@IsString()
	filterValue?: string;

	@ApiPropertyOptional({
		enum: [
			'eq',
			'ne',
			'gt',
			'gte',
			'lt',
			'lte',
			'in',
			'not_in',
			'contains',
			'starts_with',
			'ends_with',
		],
	})
	@IsOptional()
	@IsIn([
		'eq',
		'ne',
		'gt',
		'gte',
		'lt',
		'lte',
		'in',
		'not_in',
		'contains',
		'starts_with',
		'ends_with',
	])
	filterOperator?: string;
}
