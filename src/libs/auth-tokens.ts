import { createHash, createHmac, randomBytes } from 'node:crypto';

const FRONT_URL = (process.env.FRONT_URL ?? 'http://localhost:5173').replace(
	/\/+$/,
	'',
);

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function generateToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

/**
 * Produces the signed value better-auth stores in the `better-auth.session_token`
 * cookie: `<rawToken>.<base64(HMAC-SHA256(secret, rawToken))>`.
 */
export function signSessionToken(rawToken: string): string {
	const secret = process.env.BETTER_AUTH_SECRET ?? '';
	const signature = createHmac('sha256', secret)
		.update(rawToken)
		.digest('base64');
	return `${rawToken}.${signature}`;
}

export function frontUrl(path: string): string {
	return `${FRONT_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
