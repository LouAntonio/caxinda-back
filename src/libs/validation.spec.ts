import type { ValidationError } from 'class-validator';
import { validationErrorMessage } from './validation';

function errorOf(property: string, constraints: Record<string, string>) {
	return [
		{
			property,
			constraints,
		},
	] as unknown as ValidationError[];
}

describe('validationErrorMessage', () => {
	it('mantém mensagens personalizadas em português', () => {
		expect(
			validationErrorMessage(
				errorOf('proofUrl', {
					matches: 'O comprovativo deve ser um PDF.',
				}),
			),
		).toBe('O comprovativo deve ser um PDF.');
	});

	it('traduz validators sem mensagem personalizada', () => {
		expect(
			validationErrorMessage(
				errorOf('email', { isEmail: 'email must be an email' }),
			),
		).toBe('Dados inválidos: email deve ser um email válido.');
	});

	it('converte IsNotEmpty em mensagem PT', () => {
		expect(
			validationErrorMessage(
				errorOf('title', { isNotEmpty: 'title should not be empty' }),
			),
		).toBe('Dados inválidos: title não pode estar vazio.');
	});

	it('cobre casos sem constraints reconhecidas', () => {
		expect(validationErrorMessage(errorOf('x', {}))).toBe(
			'Dados inválidos no campo x.',
		);
	});

	it('cobre lista vazia de erros', () => {
		expect(validationErrorMessage([])).toBe('Dados inválidos.');
	});
});
