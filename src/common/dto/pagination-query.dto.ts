import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsInt,
	IsOptional,
	Min,
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';

export const DEFAULT_LIMIT_MAX = 50;
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;

function MaxLimit(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'paginationMaxLimit',
			target: object.constructor,
			propertyName,
			options: validationOptions,
			validator: {
				validate(value: unknown, args: ValidationArguments) {
					const ctor = args.object.constructor as {
						LIMIT_MAX?: number;
					};
					const max = ctor.LIMIT_MAX ?? DEFAULT_LIMIT_MAX;
					return (
						typeof value === 'number' &&
						Number.isInteger(value) &&
						value <= max
					);
				},
				defaultMessage(args: ValidationArguments) {
					const ctor = args.object.constructor as {
						LIMIT_MAX?: number;
					};
					const max = ctor.LIMIT_MAX ?? DEFAULT_LIMIT_MAX;
					return `limit não pode exceder ${max}`;
				},
			},
		});
	};
}

export class PaginationQueryDto {
	static readonly LIMIT_MAX: number = DEFAULT_LIMIT_MAX;

	@ApiPropertyOptional({ default: DEFAULT_PAGE })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({ default: DEFAULT_LIMIT })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@MaxLimit()
	limit?: number;
}
