import { UnauthorizedException } from '@nestjs/common';
import { MagicLinkService } from './magic-link.service';

jest.mock('../libs/prisma', () => ({
	prisma: {
		verification: {
			create: jest.fn(),
			findFirst: jest.fn(),
			deleteMany: jest.fn(),
			delete: jest.fn(),
		},
		user: {
			findFirst: jest.fn(),
			create: jest.fn(),
		},
	},
}));

jest.mock('../libs/id', () => ({
	newId: jest.fn(() => 'test-id'),
}));

jest.mock('../libs/mail', () => ({
	sendMailBridge: jest.fn(),
}));

jest.mock('../libs/auth', () => {
	const auth = {
		$context: {
			internalAdapter: {
				createSession: jest.fn(),
			},
		},
	};
	return {
		auth,
		hashToken: jest.fn((token: string) => `hashed:${token}`),
		generateToken: jest.fn(() => 'generated-token'),
		frontUrl: jest.fn((path: string) => `http://localhost:5173${path}`),
	};
});

import { prisma } from '../libs/prisma';
import { sendMailBridge } from '../libs/mail';
import * as authlib from '../libs/auth';

const createSessionMock = (
	authlib as unknown as {
		auth: {
			$context: {
				internalAdapter: { createSession: jest.Mock };
			};
		};
	}
).auth.$context.internalAdapter.createSession;

describe('MagicLinkService', () => {
	let service: MagicLinkService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new MagicLinkService();
	});

	describe('request', () => {
		it('creates a verification token with a hashed identifier and sends an email', async () => {
			(authlib.generateToken as jest.Mock).mockReturnValue('raw-token');
			process.env.MAGIC_LINK_TTL_MS = '900000';
			const before = Date.now();

			await service.request('  User@Example.COM  ');

			expect(prisma.verification.create).toHaveBeenCalledWith({
				data: {
					id: 'test-id',
					identifier: `magic-link:${authlib.hashToken('raw-token')}`,
					value: 'user@example.com',
					expiresAt: expect.any(Date),
				},
			});
			const expiresAt = (prisma.verification.create as jest.Mock).mock
				.calls[0][0].data.expiresAt as Date;
			expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 900000);
			expect(expiresAt.getTime()).toBeLessThanOrEqual(
				before + 900000 + 5000,
			);
			expect(sendMailBridge).toHaveBeenCalledTimes(1);
			const call = (sendMailBridge as jest.Mock).mock.calls[0][0];
			expect(call.to).toBe('user@example.com');
			expect(call.html).toContain(
				'http://localhost:5173/auth/magic?token=raw-token',
			);
		});
	});

	describe('verify', () => {
		it('throws UnauthorizedException when the token is not found', async () => {
			(authlib.hashToken as jest.Mock).mockReturnValue('hashed:missing');
			(prisma.verification.findFirst as jest.Mock).mockResolvedValue(
				null,
			);

			await expect(service.verify('missing-token')).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('throws UnauthorizedException and deletes the token when expired', async () => {
			const verification = {
				id: 'ver-id',
				identifier: 'magic-link:h',
				value: 'user@example.com',
				expiresAt: new Date(Date.now() - 1000),
			};
			(prisma.verification.findFirst as jest.Mock).mockResolvedValue(
				verification,
			);

			await expect(service.verify('expired-token')).rejects.toThrow(
				UnauthorizedException,
			);
			expect(prisma.verification.deleteMany).toHaveBeenCalledWith({
				where: { id: 'ver-id' },
			});
		});

		it('creates a new user and session for an unknown email', async () => {
			const verification = {
				id: 'ver-id',
				identifier: 'magic-link:h',
				value: 'new@example.com',
				expiresAt: new Date(Date.now() + 60_000),
			};
			const createdUser = {
				id: 'user-id',
				name: 'new',
				email: 'new@example.com',
				emailVerified: true,
				image: null,
			};
			(prisma.verification.findFirst as jest.Mock).mockResolvedValue(
				verification,
			);
			(prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
			(prisma.user.create as jest.Mock).mockResolvedValue(createdUser);
			createSessionMock.mockResolvedValue({ token: 'session-token' });

			const result = await service.verify('valid-token');

			expect(prisma.user.create).toHaveBeenCalledWith({
				data: {
					id: 'test-id',
					name: 'new',
					surname: '',
					email: 'new@example.com',
					emailVerified: true,
				},
			});
			expect(createSessionMock).toHaveBeenCalledWith('user-id');
			expect(prisma.verification.deleteMany).toHaveBeenCalledWith({
				where: { id: 'ver-id' },
			});
			expect(result).toEqual({
				sessionToken: 'session-token',
				user: createdUser,
			});
		});

		it('reuses an existing user and sanitizes the returned user', async () => {
			const verification = {
				id: 'ver-id',
				identifier: 'magic-link:h',
				value: 'existing@example.com',
				expiresAt: new Date(Date.now() + 60_000),
			};
			const existingUser = {
				id: 'existing-id',
				name: 'existing',
				email: 'existing@example.com',
				emailVerified: true,
				image: 'http://img',
			};
			(prisma.verification.findFirst as jest.Mock).mockResolvedValue(
				verification,
			);
			(prisma.user.findFirst as jest.Mock).mockResolvedValue(
				existingUser,
			);
			createSessionMock.mockResolvedValue({ token: 'session-token' });

			const result = await service.verify('valid-token');

			expect(prisma.user.create).not.toHaveBeenCalled();
			expect(result.user).toEqual(existingUser);
		});

		it('throws UnauthorizedException when no session is created', async () => {
			const verification = {
				id: 'ver-id',
				identifier: 'magic-link:h',
				value: 'user@example.com',
				expiresAt: new Date(Date.now() + 60_000),
			};
			(prisma.verification.findFirst as jest.Mock).mockResolvedValue(
				verification,
			);
			(prisma.user.findFirst as jest.Mock).mockResolvedValue({
				id: 'user-id',
				name: 'user',
				email: 'user@example.com',
				emailVerified: true,
				image: null,
			});
			createSessionMock.mockResolvedValue(null);

			await expect(service.verify('valid-token')).rejects.toThrow(
				UnauthorizedException,
			);
		});
	});
});
