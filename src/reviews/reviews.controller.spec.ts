import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { auth } from '../libs/auth';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

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

describe('ReviewsController', () => {
	let controller: ReviewsController;
	let service: {
		create: jest.Mock;
		list: jest.Mock;
		respond: jest.Mock;
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
			create: jest.fn().mockResolvedValue({}),
			list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			respond: jest.fn().mockResolvedValue({}),
			remove: jest.fn().mockResolvedValue(undefined),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [ReviewsController],
			providers: [
				{ provide: ReviewsService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(ReviewsController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('list chama service com query', async () => {
		await controller.list({ adId: 'ad-1' });
		expect(service.list).toHaveBeenCalledWith({ adId: 'ad-1' });
	});

	it('create rejeita sem sessão', async () => {
		const req = mockRequest(null);
		await expect(
			controller.create(req, { adId: 'ad-1', rating: 5 }),
		).rejects.toThrow();
	});

	it('create delega com userId', async () => {
		const req = mockRequest();
		await controller.create(req, { adId: 'ad-1', rating: 5 });
		expect(service.create).toHaveBeenCalledWith('u1', {
			adId: 'ad-1',
			rating: 5,
		});
	});

	it('respond delega com userId', async () => {
		const req = mockRequest();
		await controller.respond(req, 'r-1', { response: 'Obrigado' });
		expect(service.respond).toHaveBeenCalledWith('u1', 'r-1', {
			response: 'Obrigado',
		});
	});

	it('remove delega com user e id', async () => {
		const req = mockRequest();
		await controller.remove(req, 'r-1');
		expect(service.remove).toHaveBeenCalledWith(
			{ id: 'u1', role: 'USER' },
			'r-1',
		);
	});
});
