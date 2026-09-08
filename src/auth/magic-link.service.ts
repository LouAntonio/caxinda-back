import { Injectable, UnauthorizedException } from '@nestjs/common';
import { frontUrl, generateToken, hashToken } from '../libs/auth';
import { newId } from '../libs/id';
import { sendMailBridge } from '../libs/mail';
import { prisma } from '../libs/prisma';
import { auth } from '../libs/auth';

@Injectable()
export class MagicLinkService {
	async request(
		email: string,
		options?: {
			subject?: string;
			html?: string;
		},
	): Promise<void> {
		const normalized = email.trim().toLowerCase();
		const token = generateToken();
		const ttlMs = Number(process.env.MAGIC_LINK_TTL_MS ?? 15 * 60 * 1000);

		await prisma.verification.create({
			data: {
				id: newId(),
				identifier: `magic-link:${hashToken(token)}`,
				value: normalized,
				expiresAt: new Date(Date.now() + ttlMs),
			},
		});

		const loginUrl = frontUrl(
			`/auth/magic?token=${encodeURIComponent(token)}`,
		);

		await sendMailBridge({
			to: normalized,
			subject: options?.subject ?? 'Seu link de acesso',
			html:
				options?.html?.replace('%LINK%', loginUrl) ??
				`<p>Olá,</p>
				<p>Clique no link abaixo para entrar na sua conta (válido por 15 minutos):</p>
				<p><a href="${loginUrl}">Entrar</a></p>
				<p>Se você não solicitou, ignore este e-mail.</p>`,
		});
	}

	async verify(
		token: string,
	): Promise<{ sessionToken: string; user: unknown }> {
		const identifier = `magic-link:${hashToken(token)}`;

		const verification = await prisma.verification.findFirst({
			where: { identifier },
		});

		if (!verification) {
			throw new UnauthorizedException('Token de acesso inválido');
		}

		if (
			!verification.expiresAt ||
			verification.expiresAt.getTime() < Date.now()
		) {
			await prisma.verification.deleteMany({
				where: { id: verification.id },
			});
			throw new UnauthorizedException('Token de acesso expirado');
		}

		const email = verification.value;

		let user = await prisma.user.findFirst({ where: { email } });

		if (!user) {
			user = await prisma.user.create({
				data: {
					id: newId(),
					name: email.split('@')[0] ?? email,
					surname: '',
					email,
					emailVerified: true,
				},
			});
		}

		await prisma.verification.deleteMany({
			where: { id: verification.id },
		});

		const ctx = await auth.$context;
		const session = await ctx.internalAdapter.createSession(user.id);
		if (!session) {
			throw new UnauthorizedException('Não foi possível criar a sessão');
		}

		return {
			sessionToken: session.token,
			user: this.toSafeUser(user),
		};
	}

	private toSafeUser(user: {
		id: string;
		email: string;
		name: string;
		emailVerified: boolean;
		image: string | null;
	}): unknown {
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			image: user.image,
		};
	}
}
