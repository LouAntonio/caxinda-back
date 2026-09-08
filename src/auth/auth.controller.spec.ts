import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { MagicLinkService } from './magic-link.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: {
			setPassword: jest.fn(),
			unlinkAccount: jest.fn(),
			getSession: jest.fn(),
		},
	},
	signSessionToken: jest.fn((raw: string) => `signed:${raw}`),
	sessionCookieOptions: { sameSite: 'lax', secure: false },
}));

jest.mock('../libs/prisma', () => ({
	prisma: {
		account: {
			findMany: jest.fn(),
		},
	},
}));

jest.mock('better-auth/node', () => ({
	toNodeHandler: () => jest.fn(),
	fromNodeHeaders: (headers: Record<string, unknown>) => headers,
}));

import { auth, signSessionToken } from '../libs/auth';
import { prisma } from '../libs/prisma';

const mockedAuth = auth as unknown as {
	api: {
		setPassword: jest.Mock;
		unlinkAccount: jest.Mock;
		getSession: jest.Mock;
	};
};
const mockedPrisma = prisma as unknown as { account: { findMany: jest.Mock } };

describe('AuthController', () => {
	let controller: AuthController;
	let magicLinkService: { request: jest.Mock; verify: jest.Mock };

	beforeEach(async () => {
		jest.clearAllMocks();
		magicLinkService = {
			request: jest.fn(),
			verify: jest.fn(),
		};

		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{
					provide: MagicLinkService,
					useValue: magicLinkService,
				},
			],
		}).compile();

		controller = moduleRef.get<AuthController>(AuthController);
	});

	describe('magicLinkRequest', () => {
		it('delegates to the service and returns status true', async () => {
			magicLinkService.request.mockResolvedValue(undefined);

			await expect(
				controller.magicLinkRequest({ email: 'user@example.com' }),
			).resolves.toEqual({ status: true });
			expect(magicLinkService.request).toHaveBeenCalledWith(
				'user@example.com',
			);
		});

		it('converts a service error into an HttpException', async () => {
			magicLinkService.request.mockRejectedValue(
				new Error('Internal failure'),
			);

			await expect(
				controller.magicLinkRequest({ email: 'user@example.com' }),
			).rejects.toBeInstanceOf(HttpException);
		});
	});

	describe('magicLinkVerify', () => {
		it('sets a signed session cookie and returns the result', async () => {
			magicLinkService.verify.mockResolvedValue({
				sessionToken: 'raw-token',
				user: { id: 'u1' },
			});
			const res = { cookie: jest.fn() } as unknown as Response;
			process.env.BETTER_AUTH_SESSION_DURATION_MS = '1000';

			const result = await controller.magicLinkVerify(
				{ token: 't' },
				res,
			);

			expect(signSessionToken).toHaveBeenCalledWith('raw-token');
			expect(res.cookie).toHaveBeenCalledWith(
				'better-auth.session_token',
				'signed:raw-token',
				expect.objectContaining({
					httpOnly: true,
					sameSite: 'lax',
					path: '/',
					maxAge: 1000,
				}),
			);
			expect(result).toEqual({
				status: true,
				sessionToken: 'raw-token',
				user: { id: 'u1' },
			});
		});

		it('converts an error into an HttpException', async () => {
			magicLinkService.verify.mockRejectedValue(
				new HttpException('Token inválido', 400),
			);
			const res = { cookie: jest.fn() } as unknown as Response;

			await expect(
				controller.magicLinkVerify({ token: 't' }, res),
			).rejects.toBeInstanceOf(HttpException);
		});
	});

	describe('setPassword', () => {
		it('throws 401 when there is no session', async () => {
			mockedAuth.api.getSession.mockResolvedValue(null);
			const req = { headers: {} } as never;

			await expect(
				controller.setPassword({ newPassword: 'password123' }, req),
			).rejects.toMatchObject({
				status: 401,
			});
		});

		it('delegates to auth.api.setPassword when authenticated', async () => {
			mockedAuth.api.getSession.mockResolvedValue({
				user: { id: 'u1' },
			});
			mockedAuth.api.setPassword.mockResolvedValue({ status: true });
			const req = { headers: { host: 'x' } } as never;

			const result = await controller.setPassword(
				{ newPassword: 'password123' },
				req,
			);

			expect(result).toEqual({ status: true });
			expect(mockedAuth.api.setPassword).toHaveBeenCalledWith({
				body: { newPassword: 'password123' },
				headers: { host: 'x' },
			});
		});
	});

	describe('unlinkGoogle', () => {
		const session = { user: { id: 'u1' } };

		it('throws 401 when there is no session', async () => {
			mockedAuth.api.getSession.mockResolvedValue(null);
			const req = { headers: {} } as never;

			await expect(controller.unlinkGoogle(req)).rejects.toMatchObject({
				status: 401,
			});
		});

		it('throws 400 when the user has no password set', async () => {
			mockedAuth.api.getSession.mockResolvedValue(session);
			mockedPrisma.account.findMany.mockResolvedValue([
				{ providerId: 'google', password: null },
			]);
			const req = { headers: {} } as never;

			await expect(controller.unlinkGoogle(req)).rejects.toMatchObject({
				status: 400,
			});
		});

		it('throws 400 when there is no linked google account', async () => {
			mockedAuth.api.getSession.mockResolvedValue(session);
			mockedPrisma.account.findMany.mockResolvedValue([
				{ providerId: 'credential', password: 'hash' },
			]);
			const req = { headers: {} } as never;

			await expect(controller.unlinkGoogle(req)).rejects.toMatchObject({
				status: 400,
			});
		});

		it('delegates to auth.api.unlinkAccount when valid', async () => {
			mockedAuth.api.getSession.mockResolvedValue(session);
			mockedPrisma.account.findMany.mockResolvedValue([
				{ id: 'cred-id', providerId: 'credential', password: 'hash' },
				{ id: 'g-id', providerId: 'google', password: null },
			]);
			mockedAuth.api.unlinkAccount.mockResolvedValue({ status: true });
			const req = { headers: { host: 'x' } } as never;

			const result = await controller.unlinkGoogle(req);

			expect(result).toEqual({ status: true });
			expect(mockedAuth.api.unlinkAccount).toHaveBeenCalledWith({
				body: { accountId: 'g-id' },
				headers: { host: 'x' },
			});
		});
	});
});
