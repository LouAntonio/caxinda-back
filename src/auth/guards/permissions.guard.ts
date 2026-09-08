import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../libs/auth';
import {
	REQUIRED_PERMISSIONS_KEY,
	REQUIRED_ROLES_KEY,
	RequiredPermissions,
} from '../decorators/roles.decorator';
import { Role } from '../roles';

@Injectable()
export class PermissionsGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
			REQUIRED_ROLES_KEY,
			[context.getHandler(), context.getClass()],
		);
		const requiredPermissions =
			this.reflector.getAllAndOverride<RequiredPermissions>(
				REQUIRED_PERMISSIONS_KEY,
				[context.getHandler(), context.getClass()],
			);

		if (!requiredRoles?.length && !requiredPermissions) {
			return this.requireAuthenticated(context);
		}

		return this.authorize(context, requiredRoles, requiredPermissions);
	}

	private async requireAuthenticated(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest<Request>();
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(request.headers),
		});
		if (!session) {
			throw new UnauthorizedException('Não autenticado');
		}
		return true;
	}

	private async authorize(
		context: ExecutionContext,
		requiredRoles: Role[],
		requiredPermissions: RequiredPermissions,
	) {
		const request = context.switchToHttp().getRequest<Request>();
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(request.headers),
		});

		if (!session) {
			throw new UnauthorizedException('Não autenticado');
		}

		const userRole = session.user.role as string | undefined;

		if (requiredRoles?.length) {
			if (
				!userRole ||
				!requiredRoles.some((role) => role === (userRole as Role))
			) {
				throw new ForbiddenException('Permissão insuficiente');
			}
		}

		if (requiredPermissions) {
			const result = await auth.api.userHasPermission({
				body: {
					userId: session.user.id,
					permissions: requiredPermissions,
				},
			});

			if (!result?.success) {
				throw new ForbiddenException('Permissão insuficiente');
			}
		}

		return true;
	}
}
