import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { newId } from '../libs/id';
import {
	ConversationsQueryDto,
	CreateConversationDto,
	MessageQueryDto,
	SendMessageDto,
} from './chat.dto';

const MESSAGE_SELECT = {
	id: true,
	content: true,
	createdAt: true,
	senderId: true,
	isRead: true,
	media: true,
} as const;

const USER_SELECT = {
	id: true,
	name: true,
	surname: true,
	image: true,
} as const;

const AD_SELECT = {
	id: true,
	title: true,
	slug: true,
	image: true,
	price: true,
} as const;

@Injectable()
export class ChatsService {
	constructor(private readonly prisma: PrismaService) {}

	async createConversation(userId: string, dto: CreateConversationDto) {
		const ad = await this.prisma.ad.findUnique({
			where: { id: dto.adId },
			select: {
				id: true,
				userId: true,
				status: true,
				visibility: true,
			},
		});

		if (!ad) {
			throw new NotFoundException('Anúncio não encontrado.');
		}
		if (ad.userId === userId) {
			throw new BadRequestException(
				'Não é possível abrir uma conversa com o seu próprio anúncio.',
			);
		}
		if (ad.status !== 'ACTIVE' || ad.visibility !== 'VISIBLE') {
			throw new BadRequestException(
				'Este anúncio não está disponível para conversa.',
			);
		}

		const existing = await this.prisma.conversation.findFirst({
			where: {
				adId: ad.id,
				participants: { some: { userId } },
			},
			select: { id: true },
		});

		if (existing) {
			return existing;
		}

		return this.prisma.conversation.create({
			data: {
				id: newId(),
				adId: ad.id,
				participants: {
					create: [
						{ id: newId(), userId },
						{ id: newId(), userId: ad.userId },
					],
				},
			},
			select: { id: true },
		});
	}

	async listConversations(userId: string, query: ConversationsQueryDto) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Prisma.ConversationWhereInput = {
			participants: { some: { userId } },
		};

		const [total, conversations] = await Promise.all([
			this.prisma.conversation.count({ where }),
			this.prisma.conversation.findMany({
				where,
				orderBy: { updatedAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: {
					ad: { select: AD_SELECT },
					participants: {
						include: { user: { select: USER_SELECT } },
					},
					messages: {
						take: 1,
						orderBy: { createdAt: 'desc' },
						select: MESSAGE_SELECT,
					},
				},
			}),
		]);

		const ids = conversations.map((conversation) => conversation.id);
		const unread = ids.length
			? await this.prisma.message.groupBy({
					by: ['conversationId'],
					where: {
						conversationId: { in: ids },
						isRead: false,
						senderId: { not: userId },
					},
					_count: { _all: true },
				})
			: [];

		const unreadByConversation = new Map(
			unread.map((row) => [row.conversationId, row._count._all] as const),
		);

		return {
			items: conversations.map((conversation) =>
				this.toConversationView(
					conversation,
					userId,
					unreadByConversation,
				),
			),
			total,
			page,
			limit,
		};
	}

	async adminList(query: ConversationsQueryDto) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;

		const [total, conversations] = await Promise.all([
			this.prisma.conversation.count(),
			this.prisma.conversation.findMany({
				orderBy: { updatedAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: {
					ad: { select: AD_SELECT },
					participants: {
						include: { user: { select: USER_SELECT } },
					},
					messages: {
						take: 1,
						orderBy: { createdAt: 'desc' },
						select: MESSAGE_SELECT,
					},
				},
			}),
		]);

		const ids = conversations.map((conversation) => conversation.id);
		const unread = ids.length
			? await this.prisma.message.groupBy({
					by: ['conversationId'],
					where: {
						conversationId: { in: ids },
						isRead: false,
					},
					_count: { _all: true },
				})
			: [];

		const unreadByConversation = new Map(
			unread.map((row) => [row.conversationId, row._count._all] as const),
		);

		return {
			items: conversations.map((conversation) =>
				this.toConversationView(
					conversation,
					'ADMIN',
					unreadByConversation,
				),
			),
			total,
			page,
			limit,
		};
	}

	async getConversation(userId: string, id: string) {
		const conversation = await this.prisma.conversation.findUnique({
			where: { id },
			include: {
				ad: { select: AD_SELECT },
				participants: { include: { user: { select: USER_SELECT } } },
				messages: {
					take: 1,
					orderBy: { createdAt: 'desc' },
					select: MESSAGE_SELECT,
				},
			},
		});

		if (!conversation) {
			throw new NotFoundException('Conversa não encontrada.');
		}
		if (!conversation.participants.some((p) => p.userId === userId)) {
			throw new ForbiddenException(
				'Você não é participante desta conversa.',
			);
		}

		const unreadByConversation = new Map<string, number>();
		unreadByConversation.set(id, await this.unreadCount(id, userId));

		return this.toConversationView(
			conversation,
			userId,
			unreadByConversation,
		);
	}

	async getMessages(
		userId: string,
		conversationId: string,
		query: MessageQueryDto,
	) {
		await this.assertParticipant(userId, conversationId);

		const limit = query.limit ?? 50;
		const where: Prisma.MessageWhereInput = {
			conversationId,
			...(query.before && { createdAt: { lt: query.before } }),
		};

		const messages = await this.prisma.message.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			take: limit,
			select: MESSAGE_SELECT,
		});

		return {
			items: messages.reverse(),
			hasMore: messages.length === limit,
		};
	}

	async sendMessage(
		userId: string,
		conversationId: string,
		dto: SendMessageDto,
	) {
		const content = dto.content?.trim() ?? '';
		if (content.length > 5000) {
			throw new BadRequestException(
				'content deve ter no máximo 5000 caracteres.',
			);
		}
		const media = dto.media ?? [];
		if (!content && media.length === 0) {
			throw new BadRequestException(
				'Informe conteúdo ou mídia na mensagem.',
			);
		}

		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
			select: { id: true, participants: { select: { userId: true } } },
		});
		if (!conversation) {
			throw new NotFoundException('Conversa não encontrada.');
		}
		if (!conversation.participants.some((p) => p.userId === userId)) {
			throw new ForbiddenException(
				'Você não é participante desta conversa.',
			);
		}

		const [message] = await this.prisma.$transaction([
			this.prisma.message.create({
				data: {
					id: newId(),
					content,
					senderId: userId,
					conversationId,
					media: media as unknown as Prisma.InputJsonValue,
				},
				select: MESSAGE_SELECT,
			}),
			this.prisma.conversation.update({
				where: { id: conversationId },
				data: { updatedAt: new Date() },
			}),
		]);

		const otherUserId = conversation.participants.find(
			(p) => p.userId !== userId,
		)?.userId;

		return {
			message,
			otherUserId,
			unreadCount: await this.unreadCount(conversationId, otherUserId),
		};
	}

	async markRead(userId: string, conversationId: string) {
		await this.assertParticipant(userId, conversationId);

		const result = await this.prisma.message.updateMany({
			where: {
				conversationId,
				senderId: { not: userId },
				isRead: false,
			},
			data: { isRead: true },
		});

		return { updated: result.count };
	}

	async assertParticipant(userId: string, conversationId: string) {
		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
			select: { participants: { select: { userId: true } } },
		});

		if (!conversation) {
			throw new NotFoundException('Conversa não encontrada.');
		}
		if (!conversation.participants.some((p) => p.userId === userId)) {
			throw new ForbiddenException(
				'Você não é participante desta conversa.',
			);
		}
		return true;
	}

	async getParticipantIds(
		userId: string,
		conversationId: string,
	): Promise<string[]> {
		if (!(await this.assertParticipant(userId, conversationId))) {
			return [];
		}
		const conversation = await this.prisma.conversation.findUnique({
			where: { id: conversationId },
			select: { participants: { select: { userId: true } } },
		});
		return conversation?.participants.map((p) => p.userId) ?? [];
	}

	async unreadCount(
		conversationId: string | undefined,
		userId?: string,
	): Promise<number> {
		if (!conversationId || !userId) {
			return 0;
		}
		return this.prisma.message.count({
			where: {
				conversationId,
				isRead: false,
				senderId: { not: userId },
			},
		});
	}

	private toConversationView(
		conversation: {
			id: string;
			updatedAt: Date;
			createdAt: Date;
			ad: {
				id: string;
				title: string;
				slug: string;
				image: string | null;
				price: Prisma.Decimal | null;
			};
			participants: {
				user: {
					id: string;
					name: string;
					surname: string | null;
					image: string | null;
				};
				userId: string;
			}[];
			messages: {
				id: string;
				content: string;
				createdAt: Date;
				senderId: string;
				isRead: boolean;
				media: unknown;
			}[];
		},
		viewerId: string,
		unreadByConversation: Map<string, number>,
	) {
		const other = conversation.participants.find(
			(p) => p.userId !== viewerId,
		)?.user;

		const lastMessage = conversation.messages[0];
		return {
			id: conversation.id,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
			ad: {
				...conversation.ad,
				price:
					conversation.ad.price === null
						? null
						: conversation.ad.price.toNumber(),
			},
			other: other ?? null,
			lastMessage: lastMessage
				? {
						id: lastMessage.id,
						content: lastMessage.content,
						createdAt: lastMessage.createdAt,
						senderId: lastMessage.senderId,
						isRead: lastMessage.isRead,
						media: lastMessage.media,
					}
				: null,
			unreadCount: unreadByConversation.get(conversation.id) ?? 0,
		};
	}
}
