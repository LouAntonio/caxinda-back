import { WsException } from '@nestjs/websockets';
import { auth } from '../libs/auth';
import { ChatsGateway } from './chat.gateway';
import { ChatsService } from './chat.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: { getSession: jest.fn() },
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

jest.mock('../libs/cors', () => ({
	corsOrigins: () => ['http://localhost:5173'],
}));

const mockedAuth = auth as unknown as {
	api: { getSession: jest.Mock };
};

type MockSocket = Record<string, unknown> & {
	id: string;
	data: {
		userId?: string;
		conversations: Set<string>;
	};
	handshake: {
		headers: Record<string, string>;
		auth: Record<string, unknown> | { token?: string; cookie?: string };
	};
	join: jest.Mock;
	leave: jest.Mock;
	disconnect: jest.Mock;
	emit: jest.Mock;
};

function createMockSocket(userId?: string): MockSocket {
	const toEmit = jest.fn();
	const socket: MockSocket = {
		id: `socket-${userId ?? 'anon'}-${Math.random()
			.toString(36)
			.slice(2, 6)}`,
		data: {
			userId: userId ?? undefined,
			conversations: new Set<string>(),
		},
		handshake: { headers: {}, auth: {} },
		join: jest.fn(),
		leave: jest.fn(),
		disconnect: jest.fn(),
		emit: jest.fn(),
		rooms: new Set<string>(),
		to: jest.fn().mockReturnValue({ emit: toEmit }),
	};
	return socket;
}

function createMockServer() {
	return {
		to: jest.fn(() => ({
			emit: jest.fn(),
		})),
		emit: jest.fn(),
	};
}

describe('ChatsGateway', () => {
	let gateway: ChatsGateway;
	let service: Record<string, jest.Mock>;
	let server: ReturnType<typeof createMockServer>;

	beforeEach(() => {
		jest.clearAllMocks();
		service = {
			createConversation: jest.fn(),
			listConversations: jest.fn(),
			getConversation: jest.fn(),
			getMessages: jest.fn(),
			sendMessage: jest.fn(),
			markRead: jest.fn(),
			assertParticipant: jest.fn(),
			getParticipantIds: jest.fn(),
			unreadCount: jest.fn().mockResolvedValue(0),
		};

		gateway = new ChatsGateway(service as unknown as ChatsService);
		server = createMockServer();
		(gateway as unknown as { server: typeof server }).server = server;
	});

	describe('handleConnection', () => {
		it('desconecta quando não há sessão válida', async () => {
			mockedAuth.api.getSession.mockResolvedValue(null);
			const socket = createMockSocket();

			await gateway.handleConnection(socket as never);

			expect(socket.disconnect).toHaveBeenCalledWith(true);
		});

		it('desconecta quando auth.api.getSession lança erro', async () => {
			mockedAuth.api.getSession.mockRejectedValue(
				new Error('session not found'),
			);
			const socket = createMockSocket();

			await gateway.handleConnection(socket as never);

			expect(socket.disconnect).toHaveBeenCalledWith(true);
		});

		it('conecta com sessão válida e entra na room do user', async () => {
			mockedAuth.api.getSession.mockResolvedValue({
				user: { id: 'user-auth', name: 'Auth', surname: 'User' },
			});
			const socket = createMockSocket();
			socket.handshake.auth = { token: 'abc123' };

			await gateway.handleConnection(socket as never);

			expect(socket.data.userId).toBe('user-auth');
			expect(socket.join).toHaveBeenCalledWith('user:user-auth');
			expect(server.to).toHaveBeenCalledWith('user:user-auth');
		});
	});

	describe('conversation:join', () => {
		it('rejeita sem autenticação', async () => {
			const socket = createMockSocket();

			await expect(
				gateway.handleJoin(socket as never, {
					conversationId: 'conv-1',
				}),
			).rejects.toThrow(WsException);
		});

		it('join sala e envia presença', async () => {
			const socket = createMockSocket('user-1');
			service.assertParticipant.mockResolvedValue(true);
			service.getParticipantIds.mockResolvedValue(['user-1', 'user-2']);

			const result = await gateway.handleJoin(socket as never, {
				conversationId: 'conv-1',
			});

			expect(result.ok).toBe(true);
			expect(socket.join).toHaveBeenCalledWith('conversation:conv-1');
			expect(socket.data.conversations.has('conv-1')).toBe(true);
			expect(service.assertParticipant).toHaveBeenCalledWith(
				'user-1',
				'conv-1',
			);
			expect(service.getParticipantIds).toHaveBeenCalledWith(
				'user-1',
				'conv-1',
			);
		});
	});

	describe('message:send', () => {
		it('rejeita sem autenticação', async () => {
			const socket = createMockSocket();

			await expect(
				gateway.handleSend(socket as never, {
					conversationId: 'conv-1',
					content: 'Hi',
				}),
			).rejects.toThrow(WsException);
		});

		it('envia mensagem via service e notifica', async () => {
			const socket = createMockSocket('user-1');
			const msg = {
				id: 'msg-1',
				content: 'Hi',
				createdAt: new Date(),
				senderId: 'user-1',
				isRead: false,
				media: [],
			};
			service.sendMessage.mockResolvedValue({
				message: msg,
				otherUserId: 'user-2',
				unreadCount: 2,
			});

			const result = await gateway.handleSend(socket as never, {
				conversationId: 'conv-1',
				content: 'Hi',
			});

			expect(result.ok).toBe(true);
			expect(result.message.id).toBe('msg-1');
			expect(service.sendMessage).toHaveBeenCalledWith(
				'user-1',
				'conv-1',
				{
					content: 'Hi',
				},
			);
			expect(server.to).toHaveBeenCalledWith('conversation:conv-1');
			expect(server.to).toHaveBeenCalledWith('user:user-2');
		});
	});

	describe('message:typing', () => {
		it('rejeita sem autenticação', async () => {
			const socket = createMockSocket();

			await expect(
				gateway.handleTyping(socket as never, {
					conversationId: 'conv-1',
					isTyping: true,
				}),
			).rejects.toThrow(WsException);
		});

		it('emite typing event', async () => {
			const socket = createMockSocket('user-1');
			service.assertParticipant.mockResolvedValue(true);

			const result = await gateway.handleTyping(socket as never, {
				conversationId: 'conv-1',
				isTyping: true,
			});

			expect(result.ok).toBe(true);
			expect(socket.to).toHaveBeenCalledWith('conversation:conv-1');
		});

		it('throttles eventos de typing dentro de 2s', async () => {
			const socket = createMockSocket('user-1');
			service.assertParticipant.mockResolvedValue(true);

			await gateway.handleTyping(socket as never, {
				conversationId: 'conv-1',
				isTyping: true,
			});
			const secondResult = await gateway.handleTyping(socket as never, {
				conversationId: 'conv-1',
				isTyping: true,
			});

			expect(secondResult.ok).toBe(true);
			expect(secondResult.throttled).toBe(true);
		});
	});

	describe('conversation:read', () => {
		it('marca como lido e notifica sala', async () => {
			const socket = createMockSocket('user-1');
			service.markRead.mockResolvedValue({ updated: 3 });

			const result = await gateway.handleRead(socket as never, {
				conversationId: 'conv-1',
			});

			expect(result.ok).toBe(true);
			expect(service.markRead).toHaveBeenCalledWith('user-1', 'conv-1');
			expect(server.to).toHaveBeenCalledWith('conversation:conv-1');
		});
	});

	describe('handleDisconnect', () => {
		it('remove presença', () => {
			const socket = createMockSocket('user-1');
			socket.data.conversations.add('conv-1');
			(
				gateway as unknown as { presence: Map<string, Set<string>> }
			).presence = new Map([['user-1', new Set([socket.id])]]);

			gateway.handleDisconnect(socket as never);

			expect(server.to).toHaveBeenCalledWith('user:user-1');
			expect(server.to).toHaveBeenCalledWith('conversation:conv-1');
			expect(
				(
					gateway as unknown as { presence: Map<string, Set<string>> }
				).presence.has('user-1'),
			).toBe(false);
		});
	});

	describe('conversation:leave', () => {
		it('leave sala', () => {
			const socket = createMockSocket('user-1');
			socket.data.conversations.add('conv-1');

			const result = gateway.handleLeave(socket as never, {
				conversationId: 'conv-1',
			});

			expect(result.ok).toBe(true);
			expect(socket.data.conversations.has('conv-1')).toBe(false);
			expect(socket.leave).toHaveBeenCalledWith('conversation:conv-1');
		});
	});
});
