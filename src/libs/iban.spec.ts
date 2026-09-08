import { isValidIban, normalizeIban } from './iban';

describe('normalizeIban', () => {
	it('remove espaços e pontos e converte para maiúsculas', () => {
		expect(normalizeIban('BE68 5390 0754 7034')).toBe('BE68539007547034');
		expect(normalizeIban('GB29.NWBK.6016.1331.9268.19')).toBe(
			'GB29NWBK60161331926819',
		);
		expect(normalizeIban('be68 5390 0754 7034')).toBe('BE68539007547034');
	});
});

describe('isValidIban', () => {
	it('aceita IBANs válidos (com e sem espaços)', () => {
		expect(isValidIban('GB29NWBK60161331926819')).toBe(true);
		expect(isValidIban('BE68 5390 0754 7034')).toBe(true);
		expect(isValidIban('AO6260060000913424561018')).toBe(true);
		expect(isValidIban('AO62.6006.0000.9134.2456.1018')).toBe(true);
	});

	it('rejeita IBAN com checksum inválido', () => {
		expect(isValidIban('BE68539007547035')).toBe(false);
	});

	it('rejeita cadeias demasiado curtas ou mal formadas', () => {
		expect(isValidIban('AO06')).toBe(false);
		expect(isValidIban('')).toBe(false);
		expect(isValidIban('1234')).toBe(false);
	});
});
