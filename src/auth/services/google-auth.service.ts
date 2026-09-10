import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { auth } from '../../libs/auth';
import { newId } from '../../libs/id';
import { prisma } from '../../libs/prisma';

const GOOGLE_ISSUER = 'accounts.google.com';
const GOOGLE_PROVIDER = 'google';

export interface GoogleAuthProfile {
	id: string;
	email: string;
	name: string | null;
	picture: string | null;
	emailVerified: boolean;
}

export interface GoogleAuthResult {
	sessionToken: string;
	user: {
		id: string;
		email: string;
		name: string;
		emailVerified: boolean;
		image: string | null;
		role: string;
	};
}

/**
 * Autenticação "sem redirect": o SPA captura o ID token do Google (popup /
 * one-tap do Google Identity Services) e envia-o aqui. Este serviço valida a
 * assinatura, liga/associa a conta Google (o better-auth já confia em `google`
 * para account linking) e devolve um token de sessão — equivalente ao fluxo do
 * magic link (AuthController / magic-link.service).
 */
@Injectable()
export class GoogleAuthService {
	private readonly client: OAuth2Client;

	constructor() {
		this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID ?? '');
	}

	async authenticate(credential: string): Promise<GoogleAuthResult> {
		const profile = await this.verifyCredential(credential);
		const user = await this.linkAccount(profile);

		const ctx = await auth.$context;
		const session = await ctx.internalAdapter.createSession(user.id);
		if (!session) {
			throw new UnauthorizedException('Não foi possível criar a sessão');
		}

		return {
			sessionToken: session.token,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				emailVerified: user.emailVerified,
				image: user.image,
				role: user.role,
			},
		};
	}

	/**
	 * Valida o ID token do Google (sem criar sessão) e devolve o perfil.
	 * Usado pelo fluxo de "vincular Google" de um utilizador já autenticado.
	 */
	async verifyCredential(credential: string): Promise<GoogleAuthProfile> {
		return this.verify(credential);
	}

	/**
	 * Associa a conta Google ao utilizador autenticado. Falha se a conta
	 * Google já estiver associada a outro utilizador.
	 */
	async linkToUser(
		userId: string,
		profile: GoogleAuthProfile,
	): Promise<{ linked: true; alreadyLinked?: boolean }> {
		const existing = await prisma.account.findUnique({
			where: {
				providerId_accountId: {
					providerId: GOOGLE_PROVIDER,
					accountId: profile.id,
				},
			},
		});

		if (existing) {
			if (existing.userId === userId) {
				return { linked: true, alreadyLinked: true };
			}
			throw new UnauthorizedException(
				'Esta conta Google já está associada a outro utilizador.',
			);
		}

		await prisma.account.create({
			data: {
				id: newId(),
				issuer: GOOGLE_ISSUER,
				accountId: profile.id,
				providerId: GOOGLE_PROVIDER,
				userId,
			},
			select: { id: true },
		});

		return { linked: true };
	}

	private async verify(credential: string): Promise<GoogleAuthProfile> {
		const clientId = process.env.GOOGLE_CLIENT_ID;
		if (!clientId) {
			throw new UnauthorizedException('Google não configurado.');
		}

		try {
			const ticket = await this.client.verifyIdToken({
				idToken: credential,
				audience: clientId,
			});
			const payload = ticket.getPayload();
			if (!payload?.sub || !payload?.email) {
				throw new UnauthorizedException(
					'Credencial do Google inválida.',
				);
			}
			return {
				id: payload.sub,
				email: payload.email,
				name: payload.name ?? null,
				picture: payload.picture ?? null,
				emailVerified: payload.email_verified === true,
			};
		} catch (error) {
			if (error instanceof UnauthorizedException) {
				throw error;
			}
			throw new UnauthorizedException(
				'Falha ao validar a credencial do Google.',
			);
		}
	}

	private async linkAccount(profile: GoogleAuthProfile) {
		const existing = await prisma.account.findUnique({
			where: {
				providerId_accountId: {
					providerId: GOOGLE_PROVIDER,
					accountId: profile.id,
				},
			},
		});

		if (existing) {
			return prisma.user.update({
				where: { id: existing.userId },
				data: { lastLoginAt: new Date() },
			});
		}

		let user = await prisma.user.findUnique({
			where: { email: profile.email },
		});

		if (!user) {
			user = await prisma.user.create({
				data: {
					id: newId(),
					name:
						profile.name?.trim() ||
						(profile.email.split('@')[0] ?? profile.email),
					surname: '',
					email: profile.email,
					emailVerified: profile.emailVerified,
					image: profile.picture,
				},
			});
		} else {
			const data: {
				emailVerified?: boolean;
				image?: string | null;
				name?: string;
				lastLoginAt: Date;
			} = { lastLoginAt: new Date() };
			if (!user.emailVerified) {
				data.emailVerified = true;
			}
			if (!user.image && profile.picture) {
				data.image = profile.picture;
			}
			if (!user.name && profile.name) {
				data.name = profile.name;
			}
			user = await prisma.user.update({
				where: { id: user.id },
				data,
			});
		}

		await prisma.account.create({
			data: {
				id: newId(),
				issuer: GOOGLE_ISSUER,
				accountId: profile.id,
				providerId: GOOGLE_PROVIDER,
				userId: user.id,
			},
			select: { id: true },
		});

		return user;
	}
}
