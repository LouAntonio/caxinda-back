import {
	registerDecorator,
	ValidationOptions,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator';

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

export function normalizeIban(value: string): string {
	return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function mod97(iban: string): boolean {
	const reordered = iban.slice(4) + iban.slice(0, 4);
	let remainder = 0;
	for (const char of reordered) {
		if (/\d/.test(char)) {
			remainder = (remainder * 10 + (char.charCodeAt(0) - 48)) % 97;
		} else {
			const value = char.charCodeAt(0) - 55;
			remainder = (remainder * 100 + value) % 97;
		}
	}
	return remainder === 1;
}

export function isValidIban(value: string): boolean {
	const iban = normalizeIban(value);
	if (iban.length < 15 || iban.length > 34 || !IBAN_REGEX.test(iban)) {
		return false;
	}
	return mod97(iban);
}

@ValidatorConstraint({ name: 'isIban', async: false })
class IsIbanConstraint implements ValidatorConstraintInterface {
	validate(value: unknown): boolean {
		return typeof value === 'string' && isValidIban(value);
	}

	defaultMessage(): string {
		return 'IBAN inválido.';
	}
}

export function IsIBAN(options?: ValidationOptions): PropertyDecorator {
	return (object, propertyName) => {
		registerDecorator({
			target: object.constructor,
			propertyName: propertyName as string,
			options,
			constraints: [],
			validator: IsIbanConstraint,
		});
	};
}
