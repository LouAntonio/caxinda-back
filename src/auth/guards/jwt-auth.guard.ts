import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request as ExpressRequest } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
	sub: string;
	email?: string;
	role?: string;
}

interface AuthenticatedRequest extends ExpressRequest {
	user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		private readonly jwtService: JwtService,
		private readonly reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			IS_PUBLIC_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (isPublic) {
			return true;
		}

		const request = context
			.switchToHttp()
			.getRequest<AuthenticatedRequest>();
		const token = this.extractTokenFromHeader(request.headers);

		if (!token) {
			throw new UnauthorizedException('Falta o token de acesso.');
		}

		try {
			const payload =
				await this.jwtService.verifyAsync<JwtPayload>(token);
			request.user = payload;
		} catch {
			throw new UnauthorizedException('Token de acesso inválido.');
		}

		return true;
	}

	private extractTokenFromHeader(
		headers: Record<string, string | string[] | undefined>,
	): string | undefined {
		const header: string | string[] | undefined = headers['authorization'];

		let authorization: string | undefined;
		if (Array.isArray(header)) {
			authorization = header[0];
		} else {
			authorization = header;
		}

		if (!authorization) {
			return undefined;
		}

		const [type, token] = authorization.split(' ');
		return type === 'Bearer' ? token : undefined;
	}
}
