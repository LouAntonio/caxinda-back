import { Test } from '@nestjs/testing';
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import { PrismaService } from '../common/prisma/prisma.module';
import { EmailService } from '../email/email.service';
import { MagicLinkService } from '../auth/magic-link.service';
import { auth } from '../libs/auth';
import { UsersService, SessionUser } from './users.service';

jest.mock('../email/email.service', () => ({
	EmailService: jest.fn(),
}));

jest.mock('../auth/magic-link.service', () => ({
	MagicLinkService: jest.fn(),
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

jest.mock('../libs/auth', () => ({
	auth: {
		api: {
			listUsers: jest.fn(),
			createUser: jest.fn(),
			banUser: jest.fn(),
			unbanUser: jest.fn(),
			setRole: jest.fn(),
		},
	},
}));

const mockedAuth = auth as unknown as {
	api: {
		listUsers: jest.Mock;
		createUser: jest.Mock;
		banUser: jest.Mock;
		unbanUser: jest.Mock;
		setRole: jest.Mock;
	};
};

const headers = {} as IncomingHttpHeaders;

const targetUser = {
	id: 'target-id',
	name: 'João',
	surname: 'Silva',
	email: 'joao@test.com',
	emailVerified: true,
	image: null,
	role: 'USER',
	banned: false,
	banReason: null,
	banExpires: null,
	phone: null,
	trustScore: 0,
	isVerified: false,
	subscriptionTier: 'free',
	neighborhood: null,
	city: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const adminViewer: SessionUser = {
	id: 'admin-id',
	email: 'admin@test.com',
	name: 'Admin',
	role: 'ADMIN',
	banned: false,
};

const moderatorViewer: SessionUser = {
	id: 'mod-id',
	email: 'mod@test.com',
	name: 'Mod',
	role: 'MODERATOR',
	banned: false,
};

describe('UsersService', () => {
	let service: UsersService;
	let prisma: {
		user: {
			findUnique: jest.Mock;
			findFirst: jest.Mock;
			findMany: jest.Mock;
			update: jest.Mock;
		};
		kYC: { findUnique: jest.Mock; update: jest.Mock };
	};
	let emailService: EmailService;
	let magicLinkService: MagicLinkService;

	beforeEach(async () => {
		jest.clearAllMocks();
		prisma = {
			user: {
				findUnique: jest.fn(),
				findFirst: jest.fn(),
				findMany: jest.fn(),
				update: jest.fn(),
			},
			kYC: {
				findUnique: jest.fn(),
				update: jest.fn(),
			},
		};
		emailService = {
			enqueue: jest.fn().mockResolvedValue(undefined),
		} as unknown as EmailService;
		magicLinkService = {
			request: jest.fn().mockResolvedValue(undefined),
		} as unknown as MagicLinkService;

		const moduleRef = await Test.createTestingModule({
			providers: [
				UsersService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: EmailService, useValue: emailService },
				{ provide: MagicLinkService, useValue: magicLinkService },
			],
		}).compile();

		service = moduleRef.get(UsersService);
	});

	describe('getMe', () => {
		it('retorna o perfil com status KYC', async () => {
			prisma.user.findUnique.mockResolvedValue({
				...targetUser,
				kyc: { status: 'APPROVED' },
				accounts: [],
			});

			const result = await service.getMe('target-id');

			expect(result.id).toBe('target-id');
			expect(result.kyc).toEqual({ status: 'APPROVED' });
			expect(result.accounts).toEqual([]);
			expect(result.hasPassword).toBe(false);
			expect(prisma.user.findUnique).toHaveBeenCalledWith({
				where: { id: 'target-id' },
				include: {
					kyc: { select: { status: true } },
					accounts: {
						select: {
							id: true,
							providerId: true,
							accountId: true,
							userId: true,
							password: true,
						},
					},
				},
			});
		});

		it('lança NotFoundException quando o usuário não existe', async () => {
			prisma.user.findUnique.mockResolvedValue(null);

			await expect(service.getMe('ghost')).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});
	});

	describe('updateMe', () => {
		it('atualiza o perfil e retorna os dados seguros', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);
			prisma.user.findFirst.mockResolvedValue(null);
			prisma.user.update.mockResolvedValue({
				...targetUser,
				phone: '+55 11 99999-9999',
			});

			const result = await service.updateMe('target-id', {
				phone: '+55 11 99999-9999',
				city: 'São Paulo',
			});

			expect(prisma.user.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'target-id' },
					data: expect.objectContaining({
						phone: '+55 11 99999-9999',
						city: 'São Paulo',
					}),
				}),
			);
			expect(result.phone).toBe('+55 11 99999-9999');
		});

		it('atualiza os dados bancários e devolve-os no perfil seguro', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);
			prisma.user.findFirst.mockResolvedValue(null);
			prisma.user.update.mockResolvedValue({
				...targetUser,
				bankName: 'Banco BAI',
				bankHolder: 'João Silva',
				bankIban: 'AO0600000000000000000000',
			});

			const result = await service.updateMe('target-id', {
				bankName: 'Banco BAI',
				bankHolder: 'João Silva',
				bankIban: 'AO0600000000000000000000',
			});

			expect(prisma.user.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						bankName: 'Banco BAI',
						bankHolder: 'João Silva',
						bankIban: 'AO0600000000000000000000',
					}),
				}),
			);
			expect(result.bankName).toBe('Banco BAI');
			expect(result.bankHolder).toBe('João Silva');
			expect(result.bankIban).toBe('AO0600000000000000000000');
		});

		it('lança ConflictException quando o telefone já está em uso', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);
			prisma.user.findFirst.mockResolvedValue({ id: 'outro-id' });

			await expect(
				service.updateMe('target-id', { phone: 'dup' }),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('lança NotFoundException quando o usuário não existe', async () => {
			prisma.user.findUnique.mockResolvedValue(null);

			await expect(
				service.updateMe('ghost', { name: 'X' }),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('list', () => {
		it('delega para auth.api.listUsers e mapeia a lista', async () => {
			mockedAuth.api.listUsers.mockResolvedValue({
				users: [targetUser],
				total: 1,
			});
			prisma.user.findMany.mockResolvedValue([]);

			const result = await service.list(headers, {
				searchValue: 'joão',
			});

			expect(mockedAuth.api.listUsers).toHaveBeenCalled();
			expect(result.total).toBe(1);
			expect(result.users[0]).toEqual(
				expect.objectContaining({
					id: 'target-id',
					email: 'joao@test.com',
				}),
			);
			expect(prisma.user.findMany).toHaveBeenCalled();
		});

		it('enriquece com dados de verificação da BD', async () => {
			mockedAuth.api.listUsers.mockResolvedValue({
				users: [targetUser],
				total: 1,
			});
			prisma.user.findMany.mockResolvedValue([
				{
					id: 'target-id',
					isVerified: true,
					phone: '+244900000000',
					trustScore: 4.5,
					kyc: { status: 'APPROVED' },
				},
			]);

			const result = await service.list(headers);

			expect(result.users[0].isVerified).toBe(true);
			expect(result.users[0].phone).toBe('+244900000000');
			expect(result.users[0].trustScore).toBe(4.5);
			expect(result.users[0].kyc).toEqual({ status: 'APPROVED' });
		});

		it('converte erro de permissão do plugin em ForbiddenException', async () => {
			mockedAuth.api.listUsers.mockRejectedValue({
				code: 'YOU_ARE_NOT_ALLOWED_TO_LIST_USERS',
			});

			await expect(service.list(headers)).rejects.toBeInstanceOf(
				ForbiddenException,
			);
		});
	});

	describe('create', () => {
		it('cria usuário sem senha e envia convite', async () => {
			mockedAuth.api.createUser.mockResolvedValue({
				user: {
					...targetUser,
					email: 'novo@test.com',
					role: 'PROMOTER',
				},
			});

			const result = await service.create(headers, {
				email: 'novo@test.com',
				name: 'Novo',
				role: 'PROMOTER',
			});

			expect(mockedAuth.api.createUser).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						email: 'novo@test.com',
						name: 'Novo',
						role: 'PROMOTER',
					}),
				}),
			);
			expect(result.user.email).toBe('novo@test.com');
			expect(magicLinkService.request).toHaveBeenCalledWith(
				'novo@test.com',
				expect.objectContaining({
					subject: 'Você foi convidado para a Caxinda',
				}),
			);
		});

		it('usa role USER como padrão quando não informada', async () => {
			mockedAuth.api.createUser.mockResolvedValue({ user: targetUser });

			await service.create(headers, {
				email: 'novo@test.com',
				name: 'Novo',
			});

			expect(mockedAuth.api.createUser).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({ role: 'USER' }),
				}),
			);
		});

		it('converte USER_NOT_FOUND em NotFoundException', async () => {
			mockedAuth.api.createUser.mockRejectedValue({
				code: 'USER_NOT_FOUND',
			});

			await expect(
				service.create(headers, {
					email: 'novo@test.com',
					name: 'Novo',
				}),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('ban', () => {
		it('ban e rejeita KYC e envia email', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);
			prisma.kYC.findUnique.mockResolvedValue({
				id: 'kyc-id',
				userId: 'target-id',
			});
			mockedAuth.api.banUser.mockResolvedValue({ user: targetUser });

			const result = await service.ban(
				adminViewer,
				headers,
				'target-id',
				{
					reason: 'Fraude',
				},
			);

			expect(mockedAuth.api.banUser).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						userId: 'target-id',
						banReason: 'Fraude',
					}),
				}),
			);
			expect(prisma.kYC.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ status: 'REJECTED' }),
				}),
			);
			expect(prisma.user.update).toHaveBeenCalledWith({
				where: { id: 'target-id' },
				data: { isVerified: false },
			});
			expect(emailService.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({ subject: 'Sua conta foi banida' }),
			);
			expect(result).toEqual({ user: targetUser });
		});

		it('não envia email se o alvo não tem email', async () => {
			prisma.user.findUnique.mockResolvedValue({
				...targetUser,
				email: null,
			});
			mockedAuth.api.banUser.mockResolvedValue({});

			await service.ban(adminViewer, headers, 'target-id');

			expect(emailService.enqueue).not.toHaveBeenCalled();
		});

		it('lança ForbiddenException ao tentar banir a si mesmo', async () => {
			await expect(
				service.ban(adminViewer, headers, 'admin-id'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança ForbiddenException quando MODERATOR banir um ADMIN', async () => {
			prisma.user.findUnique.mockResolvedValue({
				...targetUser,
				role: 'ADMIN',
			});

			await expect(
				service.ban(moderatorViewer, headers, 'target-id'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança NotFoundException quando o alvo não existe', async () => {
			prisma.user.findUnique.mockResolvedValue(null);

			await expect(
				service.ban(adminViewer, headers, 'ghost'),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('unban', () => {
		it('desbani e envia email de reativação', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);
			mockedAuth.api.unbanUser.mockResolvedValue({ user: targetUser });

			const result = await service.unban(
				adminViewer,
				headers,
				'target-id',
			);

			expect(mockedAuth.api.unbanUser).toHaveBeenCalledWith(
				expect.objectContaining({
					body: { userId: 'target-id' },
				}),
			);
			expect(emailService.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({ subject: 'Sua conta foi reativada' }),
			);
			expect(result).toEqual({ user: targetUser });
		});

		it('lança ForbiddenException ao tentar desbanir a si mesmo', async () => {
			await expect(
				service.unban(adminViewer, headers, 'admin-id'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança ForbiddenException quando MODERATOR desbanir um ADMIN', async () => {
			prisma.user.findUnique.mockResolvedValue({
				...targetUser,
				role: 'ADMIN',
			});

			await expect(
				service.unban(moderatorViewer, headers, 'target-id'),
			).rejects.toBeInstanceOf(ForbiddenException);
		});
	});

	describe('setRole', () => {
		it('ADMIN altera role de outro usuário e envia email', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);
			mockedAuth.api.setRole.mockResolvedValue({
				user: { ...targetUser, role: 'MODERATOR' },
			});

			const result = await service.setRole(
				adminViewer,
				headers,
				'target-id',
				{
					role: 'MODERATOR',
				},
			);

			expect(mockedAuth.api.setRole).toHaveBeenCalledWith(
				expect.objectContaining({
					body: { userId: 'target-id', role: 'MODERATOR' },
				}),
			);
			expect(emailService.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({
					subject: 'Seu tipo de acesso foi alterado',
				}),
			);
			expect(result.user.role).toBe('MODERATOR');
		});

		it('permite ADMIN alterar role de outro ADMIN', async () => {
			prisma.user.findUnique.mockResolvedValue({
				...targetUser,
				role: 'ADMIN',
			});
			mockedAuth.api.setRole.mockResolvedValue({
				user: { ...targetUser, role: 'PROMOTER' },
			});

			const result = await service.setRole(
				adminViewer,
				headers,
				'target-id',
				{
					role: 'PROMOTER',
				},
			);

			expect(mockedAuth.api.setRole).toHaveBeenCalled();
			expect(result.user.role).toBe('PROMOTER');
		});

		it('lança ForbiddenException ao tentar alterar a própria role', async () => {
			await expect(
				service.setRole(adminViewer, headers, 'admin-id', {
					role: 'MODERATOR',
				}),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança ForbiddenException quando MODERATOR alterar role de ADMIN', async () => {
			prisma.user.findUnique.mockResolvedValue({
				...targetUser,
				role: 'ADMIN',
			});

			await expect(
				service.setRole(moderatorViewer, headers, 'target-id', {
					role: 'PROMOTER',
				}),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança ForbiddenException quando MODERATOR atribuir role ADMIN', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);

			await expect(
				service.setRole(moderatorViewer, headers, 'target-id', {
					role: 'ADMIN',
				}),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança ForbiddenException quando um USER tenta alterar role', async () => {
			prisma.user.findUnique.mockResolvedValue(targetUser);

			await expect(
				service.setRole(
					{ ...adminViewer, role: 'USER' },
					headers,
					'target-id',
					{ role: 'MODERATOR' },
				),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('lança NotFoundException quando o alvo não existe', async () => {
			prisma.user.findUnique.mockResolvedValue(null);

			await expect(
				service.setRole(adminViewer, headers, 'ghost', {
					role: 'MODERATOR',
				}),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});
});
