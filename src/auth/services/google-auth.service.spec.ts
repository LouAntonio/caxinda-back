import { UnauthorizedException } from '@nestjs/common';
import {
	GoogleAuthService,
	type GoogleAuthProfile,
} from './google-auth.service';

jest.mock('../../libs/prisma', () => ({
	prisma: {
		user: {
			findUnique: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		},
		account: {
			findUnique: jest.fn(),
			create: jest.fn(),
		},
	},
}));

jest.mock('../../libs/id', () => ({
	newId: jest.fn(() => 'test-id'),
}));

jest.mock('../../libs/auth', () => {
	const auth = {
		$context: {
			internalAdapter: {
				createSession: jest.fn(),
			},
		},
	};
	return { auth };
});

import { prisma } from '../../libs/prisma';
import * as authlib from '../../libs/auth';

const createSessionMock = (
	authlib as unknown as {
		auth: {
			$context: {
				internalAdapter: { createSession: jest.Mock };
			};
		};
	}
).auth.$context.internalAdapter.createSession;

const profile: GoogleAuthProfile = {
	id: 'google-sub',
	email: 'User@Example.COM',
	name: 'User',
	picture: null,
	emailVerified: true,
};

describe('GoogleAuthService', () => {
	let service: GoogleAuthService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new GoogleAuthService();
		jest.spyOn(service, 'verifyCredential').mockResolvedValue(profile);
	});

	it('reuses an already linked account without creating a user', async () => {
		(prisma.account.findUnique as jest.Mock).mockResolvedValue({
			userId: 'u1',
		});
		(prisma.user.update as jest.Mock).mockResolvedValue({
			id: 'u1',
			email: 'user@example.com',
			name: 'User',
			emailVerified: true,
			image: null,
			role: 'USER',
			banned: false,
		});
		createSessionMock.mockResolvedValue({ token: 'session-token' });

		const result = await service.authenticate('credential');

		expect(prisma.user.create).not.toHaveBeenCalled();
		expect(result.isNewUser).toBe(false);
		expect(result.sessionToken).toBe('session-token');
	});

	it('creates a new user with a normalized email', async () => {
		(prisma.account.findUnique as jest.Mock).mockResolvedValue(null);
		(prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
		(prisma.user.create as jest.Mock).mockImplementation(
			({ data }: { data: Record<string, unknown> }) => ({
				id: 'test-id',
				role: 'USER',
				banned: false,
				...data,
			}),
		);
		(prisma.account.create as jest.Mock).mockResolvedValue({ id: 'acc' });
		createSessionMock.mockResolvedValue({ token: 'session-token' });

		const result = await service.authenticate('credential');

		expect(prisma.user.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ email: 'user@example.com' }),
		});
		expect(result.isNewUser).toBe(true);
	});

	it('refuses to auto-link when Google does not confirm the email', async () => {
		jest.spyOn(service, 'verifyCredential').mockResolvedValue({
			...profile,
			emailVerified: false,
		});
		(prisma.account.findUnique as jest.Mock).mockResolvedValue(null);
		(prisma.user.findUnique as jest.Mock).mockResolvedValue({
			id: 'u1',
			emailVerified: false,
		});

		await expect(service.authenticate('credential')).rejects.toThrow(
			UnauthorizedException,
		);
		expect(prisma.user.update).not.toHaveBeenCalled();
	});

	it('refuses to create a session for a banned user', async () => {
		(prisma.account.findUnique as jest.Mock).mockResolvedValue({
			userId: 'u1',
		});
		(prisma.user.update as jest.Mock).mockResolvedValue({
			id: 'u1',
			email: 'user@example.com',
			name: 'User',
			emailVerified: true,
			image: null,
			role: 'USER',
			banned: true,
		});

		await expect(service.authenticate('credential')).rejects.toThrow(
			UnauthorizedException,
		);
		expect(createSessionMock).not.toHaveBeenCalled();
	});

	it('recovers from a race when linking the account', async () => {
		(prisma.account.findUnique as jest.Mock)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ userId: 'u2' });
		(prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
		(prisma.user.create as jest.Mock).mockImplementation(
			({ data }: { data: Record<string, unknown> }) => ({
				id: 'test-id',
				role: 'USER',
				banned: false,
				...data,
			}),
		);
		(prisma.account.create as jest.Mock).mockRejectedValue({
			code: 'P2002',
		});
		(prisma.user.update as jest.Mock).mockResolvedValue({
			id: 'u2',
			email: 'user@example.com',
			name: 'User',
			emailVerified: true,
			image: null,
			role: 'USER',
			banned: false,
		});
		createSessionMock.mockResolvedValue({ token: 'session-token' });

		const result = await service.authenticate('credential');

		expect(result.user.id).toBe('u2');
		expect(result.isNewUser).toBe(false);
	});
});
