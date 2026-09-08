import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { auth } from '../libs/auth';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: { getSession: jest.fn() },
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

const mockedAuth = auth as unknown as {
	api: { getSession: jest.Mock };
};

describe('WishlistController', () => {
	let controller: WishlistController;
	let service: {
		add: jest.Mock;
		list: jest.Mock;
		check: jest.Mock;
		remove: jest.Mock;
	};

	const sessionUser = {
		id: 'u1',
		email: 'user@test.com',
		name: 'User',
		role: 'USER',
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		service = {
			add: jest.fn().mockResolvedValue({}),
			list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			check: jest.fn().mockResolvedValue({ saved: false }),
			remove: jest.fn().mockResolvedValue(undefined),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [WishlistController],
			providers: [
				{ provide: WishlistService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(WishlistController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('list delega com userId', async () => {
		const req = mockRequest();
		await controller.list(req, { page: 1, limit: 20 });
		expect(service.list).toHaveBeenCalledWith('u1', { page: 1, limit: 20 });
	});

	it('list rejeita sem sessão', async () => {
		const req = mockRequest(null);
		await expect(controller.list(req, {})).rejects.toThrow();
	});

	it('check delega com userId e adId', async () => {
		const req = mockRequest();
		await controller.check(req, 'ad-1');
		expect(service.check).toHaveBeenCalledWith('u1', 'ad-1');
	});

	it('add delega com userId e dto', async () => {
		const req = mockRequest();
		await controller.add(req, { adId: 'ad-1' });
		expect(service.add).toHaveBeenCalledWith('u1', { adId: 'ad-1' });
	});

	it('remove delega com userId e adId', async () => {
		const req = mockRequest();
		await controller.remove(req, 'ad-1');
		expect(service.remove).toHaveBeenCalledWith('u1', 'ad-1');
	});
});
