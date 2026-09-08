import { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

jest.mock('../../libs/auth', () => ({
	auth: {
		api: {
			getSession: jest.fn(),
			userHasPermission: jest.fn(),
		},
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

import { auth } from '../../libs/auth';

const mockedAuth = auth as unknown as {
	api: {
		getSession: jest.Mock;
		userHasPermission: jest.Mock;
	};
};

function mockContext(metadata: Record<string, unknown>): ExecutionContext {
	const handler = {};
	const cls = {};
	Object.entries(metadata).forEach(([key, value]) => {
		Reflect.defineMetadata(key, value, handler);
		Reflect.defineMetadata(key, value, cls);
	});
	return {
		getHandler: () => handler,
		getClass: () => cls,
		switchToHttp: () => ({
			getRequest: () => ({ headers: {} }),
		}),
	} as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
	let guard: PermissionsGuard;
	let reflector: Reflector;

	beforeEach(() => {
		jest.clearAllMocks();
		reflector = new Reflector();
		guard = new PermissionsGuard(reflector);
	});

	it('requires authentication when no roles/permissions metadata is present', async () => {
		mockedAuth.api.getSession.mockResolvedValue({
			user: { id: 'u1', role: 'USER' },
		});
		const ctx = mockContext({});
		await expect(guard.canActivate(ctx)).resolves.toBe(true);
		expect(mockedAuth.api.getSession).toHaveBeenCalled();
	});

	it('throws UnauthorizedException when no session on unprotected route', async () => {
		mockedAuth.api.getSession.mockResolvedValue(null);
		const ctx = mockContext({});

		await expect(guard.canActivate(ctx)).rejects.toThrow(
			UnauthorizedException,
		);
	});

	it('throws UnauthorizedException when not authenticated', async () => {
		mockedAuth.api.getSession.mockResolvedValue(null);
		const ctx = mockContext({
			requiredPermissions: { kyc: ['submit'] },
		});

		await expect(guard.canActivate(ctx)).rejects.toThrow(
			UnauthorizedException,
		);
	});

	it('throws ForbiddenException when role is not allowed', async () => {
		mockedAuth.api.getSession.mockResolvedValue({
			user: { id: 'u1', role: 'ADMIN' },
		});
		const ctx = mockContext({
			requiredRoles: ['MODERATOR'],
		});

		await expect(guard.canActivate(ctx)).rejects.toThrow(
			ForbiddenException,
		);
	});

	it('allows when role matches @Roles', async () => {
		mockedAuth.api.getSession.mockResolvedValue({
			user: { id: 'u1', role: 'MODERATOR' },
		});
		const ctx = mockContext({
			requiredRoles: ['MODERATOR'],
		});

		await expect(guard.canActivate(ctx)).resolves.toBe(true);
	});

	it('checks permissions via userHasPermission and allows when success', async () => {
		mockedAuth.api.getSession.mockResolvedValue({
			user: { id: 'u1', role: 'USER' },
		});
		mockedAuth.api.userHasPermission.mockResolvedValue({ success: true });
		const ctx = mockContext({
			requiredPermissions: { kyc: ['submit'] },
		});

		await expect(guard.canActivate(ctx)).resolves.toBe(true);
		expect(mockedAuth.api.userHasPermission).toHaveBeenCalledWith({
			body: {
				userId: 'u1',
				permissions: { kyc: ['submit'] },
			},
		});
	});

	it('throws ForbiddenException when permission check fails', async () => {
		mockedAuth.api.getSession.mockResolvedValue({
			user: { id: 'u1', role: 'USER' },
		});
		mockedAuth.api.userHasPermission.mockResolvedValue({ success: false });
		const ctx = mockContext({
			requiredPermissions: { upload: ['delete'] },
		});

		await expect(guard.canActivate(ctx)).rejects.toThrow(
			ForbiddenException,
		);
	});
});
