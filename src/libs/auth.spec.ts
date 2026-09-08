import { createHmac } from 'node:crypto';
import {
	frontUrl,
	generateToken,
	hashToken,
	signSessionToken,
} from './auth-tokens';

describe('auth helpers', () => {
	describe('hashToken', () => {
		it('returns a sha256 hex digest', () => {
			const result = hashToken('token-value');
			expect(result).toMatch(/^[0-9a-f]{64}$/);
		});

		it('is deterministic for the same input', () => {
			expect(hashToken('abc')).toBe(hashToken('abc'));
		});

		it('differs for different inputs', () => {
			expect(hashToken('abc')).not.toBe(hashToken('abd'));
		});
	});

	describe('generateToken', () => {
		it('returns a base64url string of the requested byte size', () => {
			const result = generateToken(32);
			expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
		});

		it('produces distinct tokens', () => {
			expect(generateToken()).not.toBe(generateToken());
		});
	});

	describe('signSessionToken', () => {
		const previousSecret = process.env.BETTER_AUTH_SECRET;

		afterEach(() => {
			if (previousSecret === undefined) {
				delete process.env.BETTER_AUTH_SECRET;
			} else {
				process.env.BETTER_AUTH_SECRET = previousSecret;
			}
		});

		it('produces rawToken.base64Hmac(secret, rawToken)', () => {
			process.env.BETTER_AUTH_SECRET = 'test-secret';
			const raw = 'session-token';
			const expected = `${raw}.${createHmac('sha256', 'test-secret')
				.update(raw)
				.digest('base64')}`;
			expect(signSessionToken(raw)).toBe(expected);
		});
	});

	describe('frontUrl', () => {
		const previousFront = process.env.FRONT_URL;

		afterEach(() => {
			if (previousFront === undefined) {
				delete process.env.FRONT_URL;
			} else {
				process.env.FRONT_URL = previousFront;
			}
		});

		it('resolves a path without a leading slash', () => {
			process.env.FRONT_URL = 'http://localhost:5173';
			expect(frontUrl('auth/magic?token=x')).toBe(
				'http://localhost:5173/auth/magic?token=x',
			);
		});

		it('resolves a path with a leading slash', () => {
			process.env.FRONT_URL = 'http://localhost:5173/';
			expect(frontUrl('/auth/magic?token=x')).toBe(
				'http://localhost:5173/auth/magic?token=x',
			);
		});
	});
});
