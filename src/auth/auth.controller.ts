import {
	All,
	Body,
	Controller,
	ForbiddenException,
	HttpCode,
	HttpException,
	Post,
	Req,
	Res,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth, sessionCookieOptions, signSessionToken } from '../libs/auth';
import { prisma } from '../libs/prisma';
import {
	GoogleSignInDto,
	MagicLinkRequestDto,
	MagicLinkVerifyDto,
	SetPasswordDto,
} from './auth.dto';
import { GoogleAuthService } from './services/google-auth.service';
import { MagicLinkService } from './magic-link.service';
import { translateAuthError } from '../libs/http-exceptions';
import { Public } from './decorators/public.decorator';

const handler = toNodeHandler(auth);

const authThrottle = {
	default: {
		limit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 10),
		ttl: Number(process.env.THROTTLE_AUTH_TTL_MS ?? 60000),
	},
};

@Public()
@Controller('auth')
@ApiTags('Auth')
@Throttle(authThrottle)
export class AuthController {
	constructor(
		private readonly magicLinkService: MagicLinkService,
		private readonly googleAuthService: GoogleAuthService,
	) {}

	@Post('google')
	@HttpCode(200)
	@ApiOperation({
		summary:
			'Autenticar com ID token do Google (fluxo sem redirect - popup/one-tap)',
	})
	async google(
		@Body() body: GoogleSignInDto,
		@Res({ passthrough: true }) res: Response,
	) {
		try {
			const result = await this.googleAuthService.authenticate(
				body.credential,
			);

			const maxAge = Number(
				process.env.BETTER_AUTH_SESSION_DURATION_MS ??
					7 * 24 * 60 * 60 * 1000,
			);
			res.cookie(
				'better-auth.session_token',
				signSessionToken(result.sessionToken),
				{
					httpOnly: true,
					path: '/',
					maxAge,
					...sessionCookieOptions,
				},
			);

			return { status: true, ...result };
		} catch (error) {
			throw this.toHttpError(error);
		}
	}

	@Post('magic-link/request')
	@HttpCode(200)
	@ApiOperation({ summary: 'Iniciar login por magic link' })
	async magicLinkRequest(@Body() body: MagicLinkRequestDto) {
		try {
			await this.magicLinkService.request(body.email);
			return { status: true };
		} catch (error) {
			throw this.toHttpError(error);
		}
	}

	@Post('magic-link/verify')
	@HttpCode(200)
	@ApiOperation({ summary: 'Verificar token do magic link e autenticar' })
	async magicLinkVerify(
		@Body() body: MagicLinkVerifyDto,
		@Res({ passthrough: true }) res: Response,
	) {
		try {
			const result = await this.magicLinkService.verify(body.token);

			const maxAge = Number(
				process.env.BETTER_AUTH_SESSION_DURATION_MS ??
					7 * 24 * 60 * 60 * 1000,
			);
			res.cookie(
				'better-auth.session_token',
				signSessionToken(result.sessionToken),
				{
					httpOnly: true,
					path: '/',
					maxAge,
					...sessionCookieOptions,
				},
			);

			return { status: true, ...result };
		} catch (error) {
			throw this.toHttpError(error);
		}
	}

	@Post('link-google')
	@HttpCode(200)
	@ApiOperation({
		summary: 'Vincular a conta Google ao utilizador autenticado',
	})
	async linkGoogle(@Body() body: GoogleSignInDto, @Req() req: Request) {
		try {
			const session = await this.getSessionOrThrow(req);
			const profile = await this.googleAuthService.verifyCredential(
				body.credential,
			);
			return await this.googleAuthService.linkToUser(
				session.user.id,
				profile,
			);
		} catch (error) {
			throw this.toHttpError(error);
		}
	}

	@Post('set-password')
	@HttpCode(200)
	@ApiOperation({ summary: 'Definir senha (contas criadas via Google)' })
	async setPassword(@Body() body: SetPasswordDto, @Req() req: Request) {
		try {
			await this.getSessionOrThrow(req);
			const result = await auth.api.setPassword({
				body: { newPassword: body.newPassword },
				headers: fromNodeHeaders(req.headers),
			});
			return result;
		} catch (error) {
			throw this.toHttpError(error);
		}
	}

	@Post('unlink-google')
	@HttpCode(200)
	@ApiOperation({
		summary: 'Desvincular conta Google (exige que exista senha definida)',
	})
	async unlinkGoogle(@Req() req: Request) {
		try {
			const session = await this.getSessionOrThrow(req);

			const accounts = await prisma.account.findMany({
				where: { userId: session.user.id },
			});

			const hasCredential = accounts.some(
				(account) =>
					account.providerId === 'credential' && account.password,
			);

			if (!hasCredential) {
				throw new HttpException(
					'Você precisa definir uma senha antes de desvincular sua conta Google.',
					400,
				);
			}

			const googleAccount = accounts.find(
				(account) => account.providerId === 'google',
			);
			if (!googleAccount) {
				throw new HttpException('Nenhuma conta Google vinculada.', 400);
			}

			const result = await auth.api.unlinkAccount({
				body: { accountId: googleAccount.id },
				headers: fromNodeHeaders(req.headers),
			});
			return result;
		} catch (error) {
			throw this.toHttpError(error);
		}
	}

	private async getSessionOrThrow(req: Request) {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			throw new HttpException('Não autenticado', 401);
		}
		if (session.user.banned) {
			throw new UnauthorizedException(
				'A sua conta está suspensa. Contacte o suporte.',
			);
		}
		return session;
	}

	private toHttpError(error: unknown): HttpException {
		if (error instanceof HttpException) {
			return error;
		}
		const raw =
			typeof (error as { message?: string } | null)?.message === 'string'
				? (error as { message: string }).message
				: 'Erro de autenticação';
		const rawStatus = (error as { statusCode?: unknown } | null)
			?.statusCode;
		const status =
			typeof rawStatus === 'number' &&
			rawStatus >= 400 &&
			rawStatus <= 599
				? rawStatus
				: 400;
		return new HttpException(translateAuthError(raw), status);
	}

	@All('{*splat}')
	async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
		// Os endpoints do plugin `admin` do better-auth expõem operações
		// sensíveis (set-role, ban-user, remove-user) e o plugin só exige uma
		// sessão válida - não valida o cargo do chamador. Como a aplicação usa
		// as rotas equivalentes do NestJS (com validação de permissões), o
		// namespace é bloqueado aqui para não permitir escalonamento de
		// privilégios por essa via.
		const requestPath = (req.originalUrl ?? req.url ?? '').split('?')[0];
		if (/\/auth\/admin(?:\/|$)/.test(requestPath)) {
			throw new ForbiddenException('Recurso não disponível.');
		}

		const send = res.json.bind(res) as (body?: unknown) => void;
		res.json = ((body: unknown) => {
			if (body && typeof body === 'object') {
				const record = body as Record<string, unknown>;
				if (typeof record.message === 'string') {
					record.message = translateAuthError(record.message);
				}
				if (
					typeof record.statusText === 'string' &&
					!/[ãàáâäáéèêëíìîïóòôöõúùûüçñ]/i.test(record.statusText)
				) {
					record.statusText = translateAuthError(record.statusText);
				}
			}
			send(body);
		}) as typeof res.json;
		try {
			await handler(req, res);
		} catch (error) {
			console.error('[auth-proxy] Unhandled error:', error);
			if (!res.headersSent) {
				res.status(500).send('Internal Server Error');
			}
		}
	}
}
