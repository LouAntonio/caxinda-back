import { translateAuthError } from './http-exceptions';

describe('translateAuthError', () => {
	it('traduz mensagens conhecidas do better-auth', () => {
		expect(translateAuthError('Invalid email or password')).toBe(
			'Email ou senha incorretos.',
		);
		expect(translateAuthError('Token expired')).toBe(
			'Este link expirou. Peça um novo.',
		);
		expect(translateAuthError('Too many requests')).toBe(
			'Muitos pedidos. Tente novamente mais tarde.',
		);
	});

	it('deixa intactas mensagens já em português', () => {
		expect(
			translateAuthError('Não foi possível concluir a operação.'),
		).toBe('Não foi possível concluir a operação.');
	});

	it('usa fallback genérico para mensagens desconhecidas', () => {
		expect(translateAuthError('Some unknown message')).toBe(
			'Não foi possível concluir a operação.',
		);
	});
});
