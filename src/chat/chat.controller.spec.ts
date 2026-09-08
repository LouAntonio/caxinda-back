import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { auth } from '../libs/auth';
import { ChatsController } from './chat.controller';
import { ChatsService } from './chat.service';

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

describe('ChatsController', () => {
	let controller: ChatsController;
	let service: {
		createConversation: jest.Mock;
		listConversations: jest.Mock;
		getConversation: jest.Mock;
		getMessages: jest.Mock;
		sendMessage: jest.Mock;
		markRead: jest.Mock;
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
			createConversation: jest.fn().mockResolvedValue({}),
			listConversations: jest.fn().mockResolvedValue({
				items: [],
				total: 0,
			}),
			getConversation: jest.fn().mockResolvedValue({}),
			getMessages: jest.fn().mockResolvedValue({ items: [] }),
			sendMessage: jest.fn().mockResolvedValue({}),
			markRead: jest.fn().mockResolvedValue({}),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [ChatsController],
			providers: [
				{ provide: ChatsService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(ChatsController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('createConversation rejeita quando sem sessão', async () => {
		const req = mockRequest(null);

		await expect(
			controller.createConversation(req, { adId: 'ad-1' }),
		).rejects.toThrow();
	});

	it('createConversation delega com userId', async () => {
		const req = mockRequest();

		await controller.createConversation(req, { adId: 'ad-1' });

		expect(service.createConversation).toHaveBeenCalledWith('u1', {
			adId: 'ad-1',
		});
	});

	it('list repassa userId e query', async () => {
		const req = mockRequest();

		await controller.list(req, { page: 1, limit: 20 });

		expect(service.listConversations).toHaveBeenCalledWith('u1', {
			page: 1,
			limit: 20,
		});
	});

	it('getConversation repassa userId e id', async () => {
		const req = mockRequest();

		await controller.getConversation(req, 'conv-1');

		expect(service.getConversation).toHaveBeenCalledWith('u1', 'conv-1');
	});

	it('getMessages repassa userId, id e query', async () => {
		const req = mockRequest();

		await controller.getMessages(req, 'conv-1', { limit: 50 });

		expect(service.getMessages).toHaveBeenCalledWith('u1', 'conv-1', {
			limit: 50,
		});
	});

	it('sendMessage repassa userId, id e dto', async () => {
		const req = mockRequest();

		await controller.sendMessage(req, 'conv-1', { content: 'Olá' });

		expect(service.sendMessage).toHaveBeenCalledWith('u1', 'conv-1', {
			content: 'Olá',
		});
	});

	it('markRead repassa userId e id', async () => {
		const req = mockRequest();

		await controller.markRead(req, 'conv-1');

		expect(service.markRead).toHaveBeenCalledWith('u1', 'conv-1');
	});
});
