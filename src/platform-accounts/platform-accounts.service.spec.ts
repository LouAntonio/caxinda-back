import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { PlatformAccountsService } from './platform-accounts.service';

describe('PlatformAccountsService', () => {
	let service: PlatformAccountsService;
	let prisma: {
		platformBankAccount: {
			findMany: jest.Mock;
			findUnique: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			updateMany: jest.Mock;
			delete: jest.Mock;
		};
	};

	beforeEach(async () => {
		prisma = {
			platformBankAccount: {
				findMany: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn(),
				delete: jest.fn(),
			},
		};
		const moduleRef = await Test.createTestingModule({
			providers: [
				PlatformAccountsService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(PlatformAccountsService);
	});

	function accountRow(overrides: Record<string, unknown> = {}) {
		return {
			id: 'acc-1',
			bankName: 'BFA',
			bankHolder: 'Caxinda Lda.',
			bankIban: 'AO060000000000000000000001',
			isActive: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	describe('list', () => {
		it('lista as contas por ordem decrescente de criação', async () => {
			prisma.platformBankAccount.findMany.mockResolvedValue([
				accountRow(),
			]);

			const result = await service.list();

			expect(prisma.platformBankAccount.findMany).toHaveBeenCalledWith({
				orderBy: { createdAt: 'desc' },
			});
			expect(result).toHaveLength(1);
		});
	});

	describe('create', () => {
		it('cria uma conta inativa sem desativar as outras', async () => {
			prisma.platformBankAccount.create.mockResolvedValue(accountRow());

			await service.create({
				bankName: 'BAI',
				bankHolder: 'Caxinda',
				bankIban: 'AO060000000000000000000002',
			});

			expect(
				prisma.platformBankAccount.updateMany,
			).not.toHaveBeenCalled();
			expect(prisma.platformBankAccount.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ isActive: false }),
				}),
			);
		});

		it('desativa as contas ativas quando a nova é ativa', async () => {
			prisma.platformBankAccount.create.mockResolvedValue(
				accountRow({ isActive: true }),
			);

			await service.create({
				bankName: 'BFA',
				bankHolder: 'Caxinda',
				bankIban: 'AO060000000000000000000001',
				isActive: true,
			});

			expect(prisma.platformBankAccount.updateMany).toHaveBeenCalledWith({
				where: { isActive: true },
				data: { isActive: false },
			});
			expect(prisma.platformBankAccount.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ isActive: true }),
				}),
			);
		});
	});

	describe('update', () => {
		it('lança NotFoundException quando a conta não existe', async () => {
			prisma.platformBankAccount.findUnique.mockResolvedValue(null);

			await expect(
				service.update('acc-x', { bankName: 'BAI' }),
			).rejects.toThrow(NotFoundException);
			expect(prisma.platformBankAccount.update).not.toHaveBeenCalled();
		});

		it('desativa as outras quando ativa uma conta', async () => {
			prisma.platformBankAccount.findUnique.mockResolvedValue({
				id: 'acc-1',
			});
			prisma.platformBankAccount.update.mockResolvedValue(
				accountRow({ isActive: true }),
			);

			await service.update('acc-1', { isActive: true });

			expect(prisma.platformBankAccount.updateMany).toHaveBeenCalledWith({
				where: { isActive: true },
				data: { isActive: false },
			});
			expect(prisma.platformBankAccount.update).toHaveBeenCalledWith({
				where: { id: 'acc-1' },
				data: { isActive: true },
			});
		});
	});

	describe('remove', () => {
		it('apaga a conta existente', async () => {
			prisma.platformBankAccount.findUnique.mockResolvedValue({
				id: 'acc-1',
			});
			prisma.platformBankAccount.delete.mockResolvedValue(accountRow());

			await service.remove('acc-1');

			expect(prisma.platformBankAccount.delete).toHaveBeenCalledWith({
				where: { id: 'acc-1' },
			});
		});

		it('lança NotFoundException para conta inexistente', async () => {
			prisma.platformBankAccount.findUnique.mockResolvedValue(null);

			await expect(service.remove('acc-x')).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
