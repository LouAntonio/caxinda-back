import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { Prisma } from '../generated/prisma/client';
import { PaymentsService } from './payments.service';

function paymentRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'pay-1',
		subscriptionId: 'sub-1',
		amount: new Prisma.Decimal('5000.00'),
		status: 'PENDING',
		platformAccount: null,
		proofUrl: null,
		proofId: null,
		proofAt: null,
		reviewedAt: null,
		reviewedBy: null,
		adminNote: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		subscription: {
			id: 'sub-1',
			status: 'PENDING',
			startDate: new Date(),
			endDate: new Date(),
			autoRenew: false,
			business: {
				id: 'biz-1',
				name: 'Loja',
				slug: 'loja',
				ownerId: 'owner-1',
			},
			plan: {
				id: 'plan-1',
				name: 'Plano',
				price: new Prisma.Decimal('5000.00'),
				currency: 'AOA',
				durationDays: 30,
				businessVisibilityLimit: 3,
				featuredAdsLimit: 5,
			},
		},
		...overrides,
	};
}

describe('PaymentsService', () => {
	let service: PaymentsService;
	let prisma: {
		business: {
			findUnique: jest.Mock;
			findMany: jest.Mock;
			update: jest.Mock;
			updateMany: jest.Mock;
		};
		plan: { findUnique: jest.Mock };
		subscription: {
			findFirst: jest.Mock;
			count: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
			updateMany: jest.Mock;
		};
		payment: {
			create: jest.Mock;
			findUnique: jest.Mock;
			update: jest.Mock;
			count: jest.Mock;
			findMany: jest.Mock;
		};
		platformBankAccount: { findFirst: jest.Mock };
		$transaction: jest.Mock;
	};

	const owner = { id: 'owner-1', role: 'PROMOTER' };
	const admin = { id: 'admin-1', role: 'ADMIN' };

	beforeEach(async () => {
		prisma = {
			business: {
				findUnique: jest.fn(),
				findMany: jest.fn().mockResolvedValue([]),
				update: jest.fn(),
				updateMany: jest.fn(),
			},
			plan: { findUnique: jest.fn() },
			subscription: {
				findFirst: jest.fn(),
				count: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn(),
			},
			payment: {
				create: jest.fn(),
				findUnique: jest.fn(),
				update: jest.fn(),
				count: jest.fn(),
				findMany: jest.fn(),
			},
			platformBankAccount: { findFirst: jest.fn() },
			$transaction: jest.fn((tx: Promise<unknown>[]) => Promise.all(tx)),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				PaymentsService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(PaymentsService);
	});

	describe('create', () => {
		it('cria pagamento com conta da plataforma e subscrição pendente', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.plan.findUnique.mockResolvedValue({
				id: 'plan-1',
				name: 'Plano',
				price: new Prisma.Decimal('5000.00'),
				durationDays: 30,
				businessVisibilityLimit: 3,
				isActive: true,
			});
			prisma.subscription.findFirst.mockResolvedValue(null);
			prisma.subscription.count.mockResolvedValue(0);
			prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });
			prisma.platformBankAccount.findFirst.mockResolvedValue({
				bankName: 'BFA',
				bankHolder: 'Caxinda',
				bankIban: 'AO0600000000000000000000',
			});
			prisma.payment.create.mockResolvedValue(paymentRow());

			const result = await service.create(owner.id, owner.role, {
				businessId: 'biz-1',
				planId: 'plan-1',
			});

			expect(result).toHaveProperty('id', 'pay-1');
			expect(prisma.payment.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						subscriptionId: 'sub-1',
						amount: expect.any(Prisma.Decimal),
						platformAccount: expect.arrayContaining([
							expect.objectContaining({ bankName: 'BFA' }),
						]),
					}),
				}),
			);
		});

		it('reutiliza subscrição PENDING existente', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.plan.findUnique.mockResolvedValue({
				id: 'plan-1',
				price: new Prisma.Decimal('5000.00'),
				durationDays: 30,
				businessVisibilityLimit: 3,
				isActive: true,
			});
			prisma.subscription.findFirst.mockResolvedValueOnce(null);
			prisma.subscription.findFirst.mockResolvedValueOnce({
				id: 'sub-existing',
			});
			prisma.subscription.count.mockResolvedValue(0);
			prisma.platformBankAccount.findFirst.mockResolvedValue({
				bankName: 'BFA',
				bankHolder: 'Caxinda',
				bankIban: 'AO0',
			});
			prisma.payment.create.mockResolvedValue(paymentRow());

			await service.create(owner.id, owner.role, {
				businessId: 'biz-1',
				planId: 'plan-1',
			});

			expect(prisma.subscription.create).not.toHaveBeenCalled();
			expect(prisma.payment.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						subscriptionId: 'sub-existing',
					}),
				}),
			);
		});

		it('404 para empresa inexistente', async () => {
			prisma.business.findUnique.mockResolvedValue(null);

			await expect(
				service.create(owner.id, owner.role, {
					businessId: 'biz-x',
					planId: 'plan-1',
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('403 para quem não é dono nem privilegiado', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'outro',
			});

			await expect(
				service.create(owner.id, owner.role, {
					businessId: 'biz-1',
					planId: 'plan-1',
				}),
			).rejects.toThrow(ForbiddenException);
		});

		it('400 para plano inativo', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.plan.findUnique.mockResolvedValue({
				id: 'plan-1',
				isActive: false,
			});

			await expect(
				service.create(owner.id, owner.role, {
					businessId: 'biz-1',
					planId: 'plan-1',
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('409 quando a empresa já tem subscrição ativa', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.plan.findUnique.mockResolvedValue({
				id: 'plan-1',
				isActive: true,
			});
			prisma.subscription.findFirst.mockResolvedValueOnce({
				id: 'sub-active',
			});

			await expect(
				service.create(owner.id, owner.role, {
					businessId: 'biz-1',
					planId: 'plan-1',
				}),
			).rejects.toThrow(ConflictException);
		});

		it('409 quando o limite de listagens é atingido', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.plan.findUnique.mockResolvedValue({
				id: 'plan-1',
				durationDays: 30,
				businessVisibilityLimit: 1,
				isActive: true,
			});
			prisma.subscription.findFirst.mockResolvedValueOnce(null);
			prisma.subscription.count.mockResolvedValue(1);

			await expect(
				service.create(owner.id, owner.role, {
					businessId: 'biz-1',
					planId: 'plan-1',
				}),
			).rejects.toThrow(ConflictException);
		});

		it('400 sem conta bancária da plataforma ativa', async () => {
			prisma.business.findUnique.mockResolvedValue({
				id: 'biz-1',
				ownerId: 'owner-1',
			});
			prisma.plan.findUnique.mockResolvedValue({
				id: 'plan-1',
				durationDays: 30,
				businessVisibilityLimit: 3,
				isActive: true,
			});
			prisma.subscription.findFirst.mockResolvedValue(null);
			prisma.subscription.count.mockResolvedValue(0);
			prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });
			prisma.platformBankAccount.findFirst.mockResolvedValue(null);

			await expect(
				service.create(owner.id, owner.role, {
					businessId: 'biz-1',
					planId: 'plan-1',
				}),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe('submitProof', () => {
		it('404 para pagamento inexistente', async () => {
			prisma.payment.findUnique.mockResolvedValue(null);

			await expect(
				service.submitProof(owner.id, owner.role, 'pay-x', {
					proofUrl: 'https://cdn.test/p.jpg',
					proofId: 'c-1',
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('403 para quem não é dono', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());

			await expect(
				service.submitProof('stranger', 'USER', 'pay-1', {
					proofUrl: 'https://cdn.test/p.jpg',
					proofId: 'c-1',
				}),
			).rejects.toThrow(ForbiddenException);
		});

		it('400 quando o pagamento já não está PENDING', async () => {
			prisma.payment.findUnique.mockResolvedValue(
				paymentRow({ status: 'APPROVED' }),
			);

			await expect(
				service.submitProof(owner.id, owner.role, 'pay-1', {
					proofUrl: 'https://cdn.test/p.jpg',
					proofId: 'c-1',
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('muda para UNDER_REVIEW com comprovativo', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());
			const updated = paymentRow({
				status: 'UNDER_REVIEW',
				proofUrl: 'https://cdn.test/p.jpg',
				proofId: 'c-1',
				proofAt: new Date(),
			});
			prisma.payment.update.mockResolvedValue(updated);

			const result = await service.submitProof(
				owner.id,
				owner.role,
				'pay-1',
				{
					proofUrl: 'https://cdn.test/p.jpg',
					proofId: 'c-1',
				},
			);

			expect(result).toHaveProperty('status', 'UNDER_REVIEW');
			expect(prisma.payment.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						status: 'UNDER_REVIEW',
						proofUrl: 'https://cdn.test/p.jpg',
						proofAt: expect.any(Date),
					}),
				}),
			);
		});
	});

	describe('cancel', () => {
		it('cancela pagamento PENDING', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());
			prisma.payment.update.mockResolvedValue(
				paymentRow({ status: 'CANCELLED' }),
			);

			const result = await service.cancel(owner.id, owner.role, 'pay-1');

			expect(result).toHaveProperty('status', 'CANCELLED');
			expect(prisma.payment.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { status: 'CANCELLED' },
				}),
			);
		});

		it('400 quando já foi aprovado', async () => {
			prisma.payment.findUnique.mockResolvedValue(
				paymentRow({ status: 'APPROVED' }),
			);

			await expect(
				service.cancel(owner.id, owner.role, 'pay-1'),
			).rejects.toThrow(BadRequestException);
		});

		it('403 para quem não é dono nem privilegiado', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());

			await expect(
				service.cancel('stranger', 'USER', 'pay-1'),
			).rejects.toThrow(ForbiddenException);
		});
	});

	describe('review', () => {
		it('aprova e ativa a subscrição pondo a empresa SHOW', async () => {
			prisma.payment.findUnique
				.mockResolvedValueOnce(paymentRow({ status: 'UNDER_REVIEW' }))
				.mockResolvedValue(paymentRow({ status: 'APPROVED' }));
			prisma.subscription.findFirst.mockResolvedValue({
				id: 'sub-1',
			});
			prisma.business.update.mockResolvedValue({});

			const result = await service.review(admin, 'pay-1', {
				decision: 'APPROVED',
				note: 'OK',
			});

			expect(result).toHaveProperty('status', 'APPROVED');
			expect(prisma.payment.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						status: 'APPROVED',
						reviewedBy: 'admin-1',
						adminNote: 'OK',
					}),
				}),
			);
			expect(prisma.subscription.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						status: 'ACTIVE',
						endDate: expect.any(Date),
					}),
				}),
			);
			expect(prisma.business.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { status: 'SHOW' },
				}),
			);
		});

		it('400 na aprovação sem comprovativo (PENDING)', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());

			await expect(
				service.review(admin, 'pay-1', { decision: 'APPROVED' }),
			).rejects.toThrow(BadRequestException);
		});

		it('rejeita e mantém a empresa HIDE', async () => {
			prisma.payment.findUnique.mockResolvedValue(
				paymentRow({ status: 'UNDER_REVIEW' }),
			);
			prisma.payment.update.mockResolvedValue(
				paymentRow({ status: 'REJECTED' }),
			);
			prisma.subscription.findFirst.mockResolvedValue(null);
			prisma.business.update.mockResolvedValue({});

			const result = await service.review(admin, 'pay-1', {
				decision: 'REJECTED',
				note: 'Comprovativo ilegível',
			});

			expect(result).toHaveProperty('status', 'REJECTED');
			expect(prisma.business.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { status: 'HIDE' },
				}),
			);
		});

		it('403/400 quando o pagamento está cancelado ou aprovado', async () => {
			prisma.payment.findUnique.mockResolvedValue(
				paymentRow({ status: 'CANCELLED' }),
			);

			await expect(
				service.review(admin, 'pay-1', { decision: 'APPROVED' }),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe('list', () => {
		it('devolve pagamentos paginados e expira subscrições', async () => {
			prisma.payment.count.mockResolvedValue(1);
			prisma.payment.findMany.mockResolvedValue([paymentRow()]);

			const result = (await service.list({ page: 1, limit: 20 })) as {
				total: number;
				items: { amount: number }[];
			};

			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].amount).toBe(5000);
			expect(prisma.subscription.updateMany).toHaveBeenCalled();
		});
	});

	describe('getById', () => {
		it('404 para pagamento inexistente', async () => {
			prisma.payment.findUnique.mockResolvedValue(null);

			await expect(
				service.getById(owner.id, owner.role, 'pay-x'),
			).rejects.toThrow(NotFoundException);
		});

		it('403 para quem não é dono nem privilegiado', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());

			await expect(
				service.getById('stranger', 'USER', 'pay-1'),
			).rejects.toThrow(ForbiddenException);
		});

		it('dono vê o próprio pagamento', async () => {
			prisma.payment.findUnique.mockResolvedValue(paymentRow());

			const result = await service.getById(owner.id, owner.role, 'pay-1');

			expect(result).toHaveProperty('id', 'pay-1');
		});
	});

	describe('expireStaleSubscriptions', () => {
		it('expira subscrições vencidas e esconde empresas sem subscrição ativa', async () => {
			prisma.business.findMany.mockResolvedValue([
				{ id: 'biz-1' },
				{ id: 'biz-2' },
			]);

			await service.expireStaleSubscriptions();

			expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ status: 'ACTIVE' }),
					data: { status: 'EXPIRED' },
				}),
			);
			expect(prisma.business.updateMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: { in: ['biz-1', 'biz-2'] } },
					data: { status: 'HIDE' },
				}),
			);
		});

		it('não toca nas empresas quando nenhuma ficou sem subscrição', async () => {
			prisma.business.findMany.mockResolvedValue([]);

			await service.expireStaleSubscriptions();

			expect(prisma.business.updateMany).not.toHaveBeenCalled();
		});
	});
});
