import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin as adminPlugin, bearer, openAPI } from 'better-auth/plugins';
import { newId } from './id';
import { sendMailBridge } from './mail';
import { prisma } from './prisma';
import { frontUrl } from './auth-tokens';
import {
	adminRole,
	moderatorRole,
	promoterRole,
	userRole,
	ac,
} from '../auth/permissions';

export {
	frontUrl,
	generateToken,
	hashToken,
	signSessionToken,
} from './auth-tokens';

const trustedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

// Front, admin e backend vivem em origens diferentes na producao, logo os
// requests de sessao sao cross-site. Nessas condicoes o cookie de sessao tem
// de ser SameSite=None + Secure, caso contrario o browser nao o reenvia e a
// sessao parece expirar imediatamente apos o login. Em dev (localhost) mantem
// Lax sem Secure, que e seguro e funciona.
const authCookieSameSite =
	process.env.AUTH_COOKIE_SAMESITE ?? (isProd ? 'none' : 'lax');
const authCookieSecure = process.env.USE_SECURE_COOKIES
	? process.env.USE_SECURE_COOKIES === 'true'
	: isProd;

/**
 * Atributos do cookie de sessao para o fluxo magic-link (setado manualmente no
 * AuthController). Deve espelhar o comportamento cross-site do better-auth.
 */
export const sessionCookieOptions = {
	sameSite: authCookieSameSite as 'none' | 'lax',
	secure: authCookieSecure,
};

export const auth = betterAuth({
	appName: 'Caxinda',
	baseURL: process.env.BETTER_AUTH_URL,
	basePath: process.env.BETTER_AUTH_BASE_PATH ?? '/api/auth',
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins,
	database: prismaAdapter(prisma, {
		provider: 'postgresql',
	}),
	user: {
		changeEmail: {
			enabled: true,
		},
		additionalFields: {
			surname: {
				type: 'string',
				required: false,
				input: true,
			},
		},
	},
	advanced: {
		database: {
			generateId: () => newId(),
		},
		useSecureCookies: authCookieSecure,
		defaultCookieAttributes: {
			sameSite: authCookieSameSite as 'none' | 'lax',
		},
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID ?? '',
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ['google'],
		},
	},
	emailAndPassword: {
		enabled: true,
		sendResetPassword: async ({ user, url }) => {
			const token =
				url.split('/reset-password/')[1]?.split('?')[0] ?? url;
			const resetUrl = frontUrl(
				`/redefinir-senha?token=${encodeURIComponent(token)}`,
			);
			await sendMailBridge({
				to: user.email,
				subject: 'Redefinir sua senha',
				html: `<p>Olá ${user.name},</p>
					<p>Clique no link abaixo para redefinir sua senha:</p>
					<p><a href="${resetUrl}">Redefinir senha</a></p>
					<p>Se você não solicitou, ignore este e-mail.</p>`,
			});
		},
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await sendMailBridge({
				to: user.email,
				subject: 'Verifique seu email',
				html: `<p>Olá ${user.name},</p>
					<p>Clique no link abaixo para verificar seu email:</p>
					<p><a href="${url}">Verificar email</a></p>`,
			});
		},
	},
	plugins: [
		// iOS Safari/WebKit bloqueia cookies cross-site (ITP): o cookie de
		// sessao de kz.caxiauto.com definido a partir de *.vercel.app nunca
		// e reenviado, deslogando o utilizador apos o login. O plugin bearer
		// permite autenticar via Authorization: Bearer <sessionToken>,
		// guardado em localStorage pelos SPAs.
		bearer(),
		openAPI({
			disableDefaultReference: true,
		}),
		adminPlugin({
			ac,
			roles: {
				USER: userRole,
				PROMOTER: promoterRole,
				MODERATOR: moderatorRole,
				ADMIN: adminRole,
			},
			defaultRole: 'USER',
			adminRoles: ['ADMIN'],
		}),
	],
});
