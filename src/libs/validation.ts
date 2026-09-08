import type { ValidationError } from 'class-validator';

const ENGLISH_DEFAULT =
	/\b(must|should|cannot|can't|invalid|not valid|not empty)\b/i;

const CONSTRAINT_PT: Record<string, string> = {
	isNotEmpty: 'não pode estar vazio',
	isString: 'deve ser texto',
	isNumber: 'deve ser um número',
	isInt: 'deve ser um número inteiro',
	isBoolean: 'deve ser verdadeiro ou falso',
	isEmail: 'deve ser um email válido',
	isUrl: 'deve ser uma URL válida',
	isArray: 'deve ser uma lista',
	isDate: 'deve ser uma data válida',
	isIn: 'tem um valor inválido',
	isEnum: 'tem um valor inválido',
	matches: 'tem um formato inválido',
	isUuid: 'deve ser um ID válido',
	isPhoneNumber: 'deve ser um telefone válido',
	isStrongPassword: 'deve ser uma senha forte',
	isMimeType: 'deve ser um tipo de ficheiro válido',
};

const HAS_ACCENTED_CHARS = /[ãàáâäáéèêëíìîïóòôöõúùûüçñ]/i;

export function validationErrorMessage(errors: ValidationError[]): string {
	for (const error of errors) {
		const constraints = error.constraints ?? {};
		const firstKey = Object.keys(constraints)[0];
		if (!firstKey) {
			return `Dados inválidos no campo ${error.property}.`;
		}
		const custom = constraints[firstKey];
		if (HAS_ACCENTED_CHARS.test(custom) || !ENGLISH_DEFAULT.test(custom)) {
			return custom;
		}
		const pt = CONSTRAINT_PT[firstKey];
		return pt
			? `Dados inválidos: ${error.property} ${pt}.`
			: `Dados inválidos no campo ${error.property}.`;
	}
	return 'Dados inválidos.';
}
