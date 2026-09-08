import {
	ConnectedSocket,
	MessageBody,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { corsOrigins } from '../libs/cors';
import { ChatsService } from './chat.service';
import { SendMessageDto } from './chat.dto';

const TYPING_THROTTLE_MS = 2000;

function conversationRoom(id: string): string {
	return `conversation:${id}`;
}

function userRoom(id: string): string {
	return `user:${id}`;
}

interface SocketData {
	userId: string | undefined;
	conversations: Set<string>;
}

function getData(socket: Socket): SocketData {
	return socket.data as SocketData;
}

@WebSocketGateway({
	cors: { origin: corsOrigins(), credentials: true },
})
export class ChatsGateway {
	@WebSocketServer()
	server: Server;

	private readonly presence = new Map<string, Set<string>>();
	private readonly typingAt = new Map<string, number>();

	constructor(private readonly chatsService: ChatsService) {}

	async handleConnection(socket: Socket) {
		const headers: Record<string, string> = {};

		// iOS nao guarda cookies cross-site; nesse caso a autenticacao usa o
		// session token enviado via socket auth. O plugin bearer do better-auth
		// converte Authorization: Bearer <token> na sessao interna.
		const authToken = socket.handshake.auth?.token as string | undefined;
		if (authToken && !socket.handshake.headers.cookie) {
			headers.authorization = `Bearer ${authToken}`;
		} else {
			const cookie =
				socket.handshake.headers.cookie ?? this.authCookie(socket);
			if (cookie) {
				headers.cookie = cookie;
			}
		}

		try {
			const session = await auth.api.getSession({
				headers: fromNodeHeaders(headers),
			});
			if (!session) {
				socket.disconnect(true);
				return;
			}
			const data = getData(socket);
			data.userId = session.user.id;
			data.conversations = new Set<string>();
			void socket.join(userRoom(session.user.id));
			this.presenceUpdate(session.user.id, socket.id, true);
		} catch {
			socket.disconnect(true);
		}
	}

	handleDisconnect(socket: Socket): void {
		const data = getData(socket);
		const userId = data.userId;
		const conversations = data.conversations ?? new Set<string>();
		if (userId) {
			this.presenceUpdate(userId, socket.id, false);
			for (const conversationId of conversations) {
				this.server
					.to(conversationRoom(conversationId))
					.emit('presence:update', {
						userId,
						online: false,
					});
			}
		}
	}

	private requireUserId(socket: Socket): string {
		const userId = getData(socket).userId;
		if (!userId) {
			throw new WsException('Não autenticado.');
		}
		return userId;
	}

	private authCookie(socket: Socket): string | undefined {
		const authCookie = socket.handshake.auth?.cookie as string | undefined;
		return authCookie;
	}

	private presenceUpdate(
		userId: string,
		socketId: string,
		online: boolean,
	): void {
		const sockets = this.presence.get(userId) ?? new Set<string>();
		if (online) {
			sockets.add(socketId);
		} else {
			sockets.delete(socketId);
		}
		if (sockets.size === 0) {
			this.presence.delete(userId);
		} else {
			this.presence.set(userId, sockets);
		}
		this.server.to(userRoom(userId)).emit('presence:update', {
			userId,
			online,
		});
	}

	private isOnline(userId: string): boolean {
		return (this.presence.get(userId)?.size ?? 0) > 0;
	}

	@SubscribeMessage('conversation:join')
	async handleJoin(
		@ConnectedSocket() socket: Socket,
		@MessageBody() body: { conversationId: string },
	) {
		const userId = this.requireUserId(socket);
		if (!body?.conversationId) {
			throw new WsException('conversationId é obrigatório.');
		}
		await this.chatsService.assertParticipant(userId, body.conversationId);

		void socket.join(conversationRoom(body.conversationId));
		getData(socket).conversations.add(body.conversationId);

		const participants = await this.chatsService.getParticipantIds(
			userId,
			body.conversationId,
		);
		const users = participants.map((id) => ({
			userId: id,
			online: this.isOnline(id),
		}));
		this.server
			.to(conversationRoom(body.conversationId))
			.emit('conversation:presence', {
				conversationId: body.conversationId,
				users,
			});
		return { ok: true };
	}

	@SubscribeMessage('conversation:leave')
	handleLeave(
		@ConnectedSocket() socket: Socket,
		@MessageBody() body: { conversationId: string },
	) {
		this.requireUserId(socket);
		if (!body?.conversationId) {
			throw new WsException('conversationId é obrigatório.');
		}
		getData(socket).conversations.delete(body.conversationId);
		void socket.leave(conversationRoom(body.conversationId));
		return { ok: true };
	}

	@SubscribeMessage('message:send')
	async handleSend(
		@ConnectedSocket() socket: Socket,
		@MessageBody() body: SendMessageDto & { conversationId: string },
	) {
		const userId = this.requireUserId(socket);
		if (!body?.conversationId) {
			throw new WsException('conversationId é obrigatório.');
		}

		const { conversationId, ...dto } = body;
		const result = await this.chatsService.sendMessage(
			userId,
			conversationId,
			dto,
		);

		this.server
			.to(conversationRoom(conversationId))
			.emit('message:new', { conversationId, message: result.message });
		this.server
			.to(conversationRoom(conversationId))
			.emit('conversation:updated', { conversationId });
		if (result.otherUserId) {
			this.server
				.to(userRoom(result.otherUserId))
				.emit('conversation:unread', {
					conversationId,
					unreadCount: result.unreadCount,
				});
		}
		return { ok: true, message: result.message };
	}

	@SubscribeMessage('conversation:read')
	async handleRead(
		@ConnectedSocket() socket: Socket,
		@MessageBody() body: { conversationId: string },
	) {
		const userId = this.requireUserId(socket);
		if (!body?.conversationId) {
			throw new WsException('conversationId é obrigatório.');
		}
		await this.chatsService.markRead(userId, body.conversationId);
		this.server
			.to(conversationRoom(body.conversationId))
			.emit('conversation:read', {
				conversationId: body.conversationId,
				readBy: userId,
			});
		this.server
			.to(conversationRoom(body.conversationId))
			.emit('conversation:updated', {
				conversationId: body.conversationId,
			});
		return { ok: true };
	}

	@SubscribeMessage('message:typing')
	async handleTyping(
		@ConnectedSocket() socket: Socket,
		@MessageBody()
		body: { conversationId: string; isTyping: boolean },
	) {
		const userId = this.requireUserId(socket);
		if (!body?.conversationId) {
			throw new WsException('conversationId é obrigatório.');
		}
		await this.chatsService.assertParticipant(userId, body.conversationId);

		const key = `${userId}:${body.conversationId}`;
		const now = Date.now();
		if (body.isTyping) {
			const last = this.typingAt.get(key) ?? 0;
			if (now - last < TYPING_THROTTLE_MS) {
				return { ok: true, throttled: true };
			}
		}
		this.typingAt.set(key, now);
		if (!body.isTyping) {
			this.typingAt.delete(key);
		}

		socket
			.to(conversationRoom(body.conversationId))
			.emit('conversation:typing', {
				conversationId: body.conversationId,
				userId,
				isTyping: body.isTyping,
			});
		return { ok: true };
	}
}
