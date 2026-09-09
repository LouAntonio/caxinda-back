import {
	All,
	Body,
	Controller,
	HttpCode,
	HttpException,
	Post,
	Req,
	Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth, sessionCookieOptions, signSessionToken } from '../libs/auth';
import { prisma } from '../libs/prisma';
import {
	MagicLinkRequestDto,
	MagicLinkVerifyDto,
	SetPasswordDto,
} from './auth.dto';
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
	constructor(private readonly magicLinkService: MagicLinkService) {}

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

	@Post('set-password')
	@HttpCode(200)
	@ApiOperation({ summary: 'Definir senha (contas criadas via Google)' })
	async setPassword(@Body() body: SetPasswordDto, @Req() req: Request) {
		await this.getSessionOrThrow(req);
		try {
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
		const session = await this.getSessionOrThrow(req);

		try {
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
		return new HttpException(translateAuthError(raw), 400);
	}

	@All('{*splat}')
	async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
		const send = res.json as (body?: unknown) => void;
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
		await handler(req, res);
	}
}
