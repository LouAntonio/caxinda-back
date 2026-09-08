import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { Prisma } from '../generated/prisma/client';
import { ChatsService } from './chat.service';

describe('ChatsService', () => {
	let service: ChatsService;
	let prisma: {
		ad: { findUnique: jest.Mock };
		business: { findUnique: jest.Mock };
		user: { findUnique: jest.Mock };
		conversation: {
			findFirst: jest.Mock;
			findUnique: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			count: jest.Mock;
			findMany: jest.Mock;
		};
		message: {
			create: jest.Mock;
			findMany: jest.Mock;
			updateMany: jest.Mock;
			groupBy: jest.Mock;
			count: jest.Mock;
		};
		$transaction: jest.Mock;
	};

	const AD = {
		id: 'ad-1',
		userId: 'owner-1',
		status: 'ACTIVE',
		visibility: 'VISIBLE',
		title: 'Test Ad',
		slug: 'test-ad',
		image: null,
		price: new Prisma.Decimal('100.5'),
	};
	const OTHER_USER = 'other-user-1';

	beforeEach(async () => {
		prisma = {
			ad: { findUnique: jest.fn() },
			business: { findUnique: jest.fn() },
			user: { findUnique: jest.fn() },
			conversation: {
				findFirst: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				count: jest.fn(),
				findMany: jest.fn(),
			},
			message: {
				create: jest.fn(),
				findMany: jest.fn(),
				updateMany: jest.fn(),
				groupBy: jest.fn(),
				count: jest.fn(),
			},
			$transaction: jest.fn((tx: Promise<unknown>[]) => Promise.all(tx)),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				ChatsService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(ChatsService);
	});

	describe('createConversation', () => {
		it('cria conversa quando ad válido e OWNER é outro user', async () => {
			prisma.ad.findUnique.mockResolvedValue(AD);
			prisma.conversation.findFirst.mockResolvedValue(null);
			const createdConversation = {
				id: 'conv-1',
				createdAt: new Date(),
				updatedAt: new Date(),
				participants: [
					{
						userId: OTHER_USER,
						id: 'p-1',
						conversationId: 'conv-1',
					},
					{
						userId: 'user-2',
						id: 'p-2',
						conversationId: 'conv-1',
					},
				],
			};
			prisma.conversation.create.mockResolvedValue(createdConversation);

			const result = await service.createConversation('user-2', {
				adId: 'ad-1',
			});

			expect(result.id).toBe('conv-1');
			expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ adId: 'ad-1' }),
				}),
			);
			expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
			expect(prisma.conversation.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ type: 'AD', adId: 'ad-1' }),
				}),
			);
		});

		it('reutiliza conversa existente para o mesmo AD e user', async () => {
			prisma.ad.findUnique.mockResolvedValue(AD);
			const existing = { id: 'conv-existing' };
			prisma.conversation.findFirst.mockResolvedValue(existing);

			const result = await service.createConversation('user-2', {
				adId: 'ad-1',
			});

			expect(result.id).toBe('conv-existing');
			expect(prisma.conversation.create).not.toHaveBeenCalled();
		});

		it('404 para AD inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(
				service.createConversation('user-2', {
					adId: 'non-existent',
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('400 para ad próprio', async () => {
			prisma.ad.findUnique.mockResolvedValue(AD);

			await expect(
				service.createConversation(AD.userId, { adId: AD.id }),
			).rejects.toThrow(BadRequestException);
		});

		it('400 quando AD não está ACTIVE/VISIBLE', async () => {
			prisma.ad.findUnique.mockResolvedValue({ ...AD, status: 'SOLD' });

			await expect(
				service.createConversation('user-2', { adId: AD.id }),
			).rejects.toThrow(BadRequestException);
		});

		it('400 quando adId e businessId são fornecidos juntos', async () => {
			await expect(
				service.createConversation('user-2', {
					adId: 'ad-1',
					businessId: 'biz-1',
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('400 quando nenhum alvo é informado', async () => {
			await expect(
				service.createConversation('user-2', {}),
			).rejects.toThrow(BadRequestException);
		});

		it('400 quando type AD vem com businessId', async () => {
			await expect(
				service.createConversation('user-2', {
					type: 'AD' as const,
					businessId: 'biz-1',
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('cria conversa de empresa com o dono', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-biz',
				status: 'SHOW',
			});
			prisma.conversation.findFirst.mockResolvedValue(null);
			prisma.conversation.create.mockResolvedValue({
				id: 'conv-biz',
			});

			const result = await service.createConversation('user-2', {
				businessId: 'biz-1',
			});

			expect(result.id).toBe('conv-biz');
			expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						type: 'BUSINESS',
						businessId: 'biz-1',
					}),
				}),
			);
			expect(prisma.conversation.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						type: 'BUSINESS',
						businessId: 'biz-1',
					}),
				}),
			);
		});

		it('400 para a sua própria empresa', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'user-2',
				status: 'SHOW',
			});

			await expect(
				service.createConversation('user-2', {
					businessId: 'biz-1',
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('400 quando empresa não está SHOW', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-biz',
				status: 'HIDE',
			});

			await expect(
				service.createConversation('user-2', {
					businessId: 'biz-1',
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.createConversation('user-2', {
					businessId: 'biz-1',
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('cria conversa de suporte (SUPPORT) com um participante', async () => {
			prisma.conversation.findFirst.mockResolvedValue(null);
			prisma.conversation.create.mockResolvedValue({
				id: 'conv-supp',
			});

			const result = await service.createConversation('user-2', {
				type: 'SUPPORT' as const,
			});

			expect(result.id).toBe('conv-supp');
			expect(prisma.conversation.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						type: 'SUPPORT',
					}),
				}),
			);
		});

		it('reutiliza conversa de suporte existente', async () => {
			prisma.conversation.findFirst.mockResolvedValue({
				id: 'conv-supp-existing',
			});

			const result = await service.createConversation('user-2', {
				type: 'SUPPORT' as const,
			});

			expect(result.id).toBe('conv-supp-existing');
			expect(prisma.conversation.create).not.toHaveBeenCalled();
		});

		it('400 quando SUPPORT tem adId', async () => {
			await expect(
				service.createConversation('user-2', {
					type: 'SUPPORT' as const,
					adId: 'ad-1',
				}),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe('listConversations', () => {
		it('retorna paginado com unreadCount', async () => {
			const now = new Date('2026-09-01T12:00:00Z');
			const conv = {
				id: 'conv-1',
				type: 'AD',
				createdAt: now,
				updatedAt: now,
				ad: {
					id: AD.id,
					title: AD.title,
					slug: AD.slug,
					image: AD.image,
					price: AD.price,
				},
				business: null,
				participants: [
					{
						userId: OTHER_USER,
						id: 'p-1',
						conversationId: 'conv-1',
						user: {
							id: OTHER_USER,
							name: 'Other',
							surname: 'User',
							image: null,
						},
					},
					{
						userId: 'user-viewer',
						id: 'p-2',
						conversationId: 'conv-1',
						user: {
							id: 'user-viewer',
							name: 'Viewer',
							surname: null,
							image: null,
						},
					},
				],
				messages: [
					{
						id: 'msg-1',
						content: 'Hi',
						createdAt: now,
						senderId: OTHER_USER,
						isRead: false,
						media: [],
					},
				],
			};
			prisma.conversation.count.mockResolvedValue(1);
			prisma.conversation.findMany.mockResolvedValue([conv]);
			prisma.message.groupBy.mockResolvedValue([
				{ conversationId: 'conv-1', _count: { _all: 2 } },
			]);

			const result = await service.listConversations('user-viewer', {
				page: 1,
				limit: 20,
			});

			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].unreadCount).toBe(2);
			expect(result.items[0].other!.id).toBe(OTHER_USER);
			expect(result.items[0].ad!.price).toBe(100.5);
			expect(result.items[0].type).toBe('AD');
			expect(result.items[0].business).toBeNull();
		});

		it('staff vê todas as conversas SUPPORT na própria lista', async () => {
			prisma.user.findUnique.mockResolvedValue({ role: 'MODERATOR' });
			prisma.conversation.count.mockResolvedValue(0);
			prisma.conversation.findMany.mockResolvedValue([]);
			prisma.message.groupBy.mockResolvedValue([]);

			await service.listConversations('moderator-1', {
				page: 1,
				limit: 20,
			});

			expect(prisma.conversation.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: [
							{
								participants: {
									some: { userId: 'moderator-1' },
								},
							},
							{ type: 'SUPPORT' },
						],
					}),
				}),
			);
		});
	});

	describe('getMessages', () => {
		it('404 quando conversa não existe', async () => {
			prisma.conversation.findUnique.mockResolvedValue(null);

			await expect(
				service.getMessages('user-viewer', 'conv-1', {}),
			).rejects.toThrow(NotFoundException);
		});

		it('403 quando não é participante', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'some-participant' }],
			});

			await expect(
				service.getMessages('unauthorized-user', 'conv-1', {}),
			).rejects.toThrow(ForbiddenException);
		});

		it('staff acede a conversas SUPPORT por role', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-supp',
				type: 'SUPPORT',
				participants: [{ userId: 'end-user' }],
			});
			prisma.user.findUnique.mockResolvedValue({
				role: 'MODERATOR',
			});
			prisma.message.findMany.mockResolvedValue([]);

			const result = await service.getMessages(
				'moderator-1',
				'conv-supp',
				{},
			);

			expect(result.items).toEqual([]);
		});

		it('utilizador normal não acede a conversa SUPPORT sem ser participante', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-supp',
				type: 'SUPPORT',
				participants: [{ userId: 'end-user' }],
			});
			prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

			await expect(
				service.getMessages('normal-user', 'conv-supp', {}),
			).rejects.toThrow(ForbiddenException);
		});

		it('retorna mensagens com cursor e hasMore', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'user-viewer' }],
			});
			const messages = Array.from({ length: 50 }, (_, i) => ({
				id: `msg-${i}`,
				content: `Message ${i}`,
				createdAt: new Date(Date.now() - i * 1000),
				senderId: 'user-viewer',
				isRead: true,
				media: [],
			}));
			prisma.message.findMany.mockResolvedValue(messages);

			const result = await service.getMessages('user-viewer', 'conv-1', {
				limit: 50,
			});

			expect(result.items).toHaveLength(50);
			expect(result.hasMore).toBe(true);
		});
	});

	describe('sendMessage', () => {
		it('404 quando conversa não existe', async () => {
			prisma.conversation.findUnique.mockResolvedValue(null);

			await expect(
				service.sendMessage('user-2', 'non-existent', {
					content: 'Hi',
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('403 quando não é participante', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'some-other-user' }],
			});

			await expect(
				service.sendMessage('unauthorized', 'conv-1', {
					content: 'Hi',
				}),
			).rejects.toThrow(ForbiddenException);
		});

		it('400 quando sem conteúdo e sem mídia', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'user-2' }],
			});

			await expect(
				service.sendMessage('user-2', 'conv-1', {}),
			).rejects.toThrow(BadRequestException);
		});

		it('400 quando content excede 5000 caracteres', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'user-2' }],
			});
			const bigContent = 'x'.repeat(5001);

			await expect(
				service.sendMessage('user-2', 'conv-1', {
					content: bigContent,
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('envia mensagem e retorna dados corretos', async () => {
			const convParticipants = [
				{ userId: 'user-2' },
				{ userId: OTHER_USER },
			];
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: convParticipants,
			});
			const msg = {
				id: 'msg-new',
				content: 'Olá',
				createdAt: new Date(),
				senderId: 'user-2',
				isRead: false,
				media: [],
			};
			prisma.message.create.mockResolvedValue(msg);
			prisma.conversation.update.mockResolvedValue({});
			prisma.message.count.mockResolvedValue(3);

			const result = await service.sendMessage('user-2', 'conv-1', {
				content: 'Olá',
			});

			expect(result.message.id).toBe('msg-new');
			expect(result.otherUserId).toBe(OTHER_USER);
			expect(result.unreadCount).toBe(3);
			expect(prisma.conversation.update).toHaveBeenCalled();
		});

		it('permite enviar mensagem só com mídia', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'user-2' }, { userId: OTHER_USER }],
			});
			const media = [
				{
					url: 'https://test.com/img.jpg',
					cloudinaryId: 'c-1',
					type: 'image',
				},
			];
			prisma.message.create.mockResolvedValue({
				id: 'msg-media',
				content: '',
				createdAt: new Date(),
				senderId: 'user-2',
				isRead: false,
				media,
			});
			prisma.conversation.update.mockResolvedValue({});
			prisma.message.count.mockResolvedValue(0);

			const result = await service.sendMessage('user-2', 'conv-1', {
				media,
			});

			expect(result.message.id).toBe('msg-media');
		});
	});

	describe('markRead', () => {
		it('404 para conversa inexistente', async () => {
			prisma.conversation.findUnique.mockResolvedValue(null);

			await expect(
				service.markRead('user-2', 'non-existent'),
			).rejects.toThrow(NotFoundException);
		});

		it('marca como lido e retorna contagem', async () => {
			prisma.conversation.findUnique.mockResolvedValue({
				id: 'conv-1',
				participants: [{ userId: 'user-2' }],
			});
			prisma.message.updateMany.mockResolvedValue({ count: 5 });

			const result = await service.markRead('user-2', 'conv-1');

			expect(result.updated).toBe(5);
			expect(prisma.message.updateMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						senderId: { not: 'user-2' },
						isRead: false,
					}),
					data: { isRead: true },
				}),
			);
		});
	});

	describe('unreadCount', () => {
		it('retorna 0 quando userId é undefined', async () => {
			const count = await service.unreadCount('conv-1', undefined);

			expect(count).toBe(0);
		});

		it('retorna 0 quando conversationId é undefined', async () => {
			const count = await service.unreadCount(undefined, 'user-1');

			expect(count).toBe(0);
		});

		it('chama prisma.message.count corretamente', async () => {
			prisma.message.count.mockResolvedValue(7);

			const count = await service.unreadCount('conv-1', 'user-1');

			expect(count).toBe(7);
			expect(prisma.message.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						conversationId: 'conv-1',
						isRead: false,
						senderId: { not: 'user-1' },
					}),
				}),
			);
		});
	});
});
