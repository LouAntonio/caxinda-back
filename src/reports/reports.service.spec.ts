import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import {
	ReportReason,
	ReportStatus,
	ReportTarget,
} from '../generated/prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
	let service: ReportsService;
	let prisma: {
		ad: { findUnique: jest.Mock };
		user: { findUnique: jest.Mock };
		review: { findUnique: jest.Mock };
		message: { findUnique: jest.Mock };
		report: {
			findUnique: jest.Mock;
			create: jest.Mock;
			findMany: jest.Mock;
			update: jest.Mock;
			count: jest.Mock;
		};
		$transaction: jest.Mock;
	};

	const admin = { id: 'admin-1', role: 'ADMIN' };
	const reporter = {
		id: 'user-1',
		name: 'João',
		surname: 'Silva',
		image: null,
	};

	beforeEach(async () => {
		prisma = {
			ad: { findUnique: jest.fn() },
			user: { findUnique: jest.fn() },
			review: { findUnique: jest.fn() },
			message: { findUnique: jest.fn() },
			report: {
				findUnique: jest.fn(),
				create: jest.fn(),
				findMany: jest.fn(),
				update: jest.fn(),
				count: jest.fn(),
			},
			$transaction: jest.fn((tx: Promise<unknown>[]) => Promise.all(tx)),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				ReportsService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();

		service = moduleRef.get(ReportsService);
	});

	describe('create', () => {
		it('404 para ad alvo inexistente', async () => {
			prisma.ad.findUnique.mockResolvedValue(null);

			await expect(
				service.create('user-1', {
					targetType: ReportTarget.AD,
					targetId: 'ad-1',
					reason: ReportReason.FRAUD,
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('400 ao denunciar o próprio conteúdo', async () => {
			prisma.ad.findUnique.mockResolvedValue({ userId: 'user-1' });

			await expect(
				service.create('user-1', {
					targetType: ReportTarget.AD,
					targetId: 'ad-1',
					reason: ReportReason.FRAUD,
				}),
			).rejects.toThrow(BadRequestException);
		});

		it('409 se já denunciou o mesmo alvo', async () => {
			prisma.ad.findUnique.mockResolvedValue({ userId: 'other' });
			prisma.report.findUnique.mockResolvedValue({ id: 'rep-1' });

			await expect(
				service.create('user-1', {
					targetType: ReportTarget.AD,
					targetId: 'ad-1',
					reason: ReportReason.FRAUD,
				}),
			).rejects.toThrow(ConflictException);
		});

		it('cria denúncia com media', async () => {
			prisma.ad.findUnique.mockResolvedValue({ userId: 'other' });
			prisma.report.findUnique.mockResolvedValue(null);
			prisma.report.create.mockResolvedValue({
				id: 'rep-new',
				targetType: ReportTarget.AD,
				targetId: 'ad-1',
				reason: ReportReason.FRAUD,
				description: 'Fraude',
				media: [{ url: 'https://cdn.test/x.jpg', cloudinaryId: 'c' }],
				status: ReportStatus.PENDING,
				createdAt: new Date(),
				reporter,
			});

			const result = await service.create('user-1', {
				targetType: ReportTarget.AD,
				targetId: 'ad-1',
				reason: ReportReason.FRAUD,
				description: 'Fraude',
				media: [{ url: 'https://cdn.test/x.jpg', cloudinaryId: 'c' }],
			});

			expect(result.id).toBe('rep-new');
			expect(prisma.report.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						reporterId: 'user-1',
						targetType: ReportTarget.AD,
					}),
				}),
			);
		});

		it('resolve alvo USER', async () => {
			prisma.user.findUnique.mockResolvedValue({ id: 'other-user' });
			prisma.report.findUnique.mockResolvedValue(null);
			prisma.report.create.mockResolvedValue({ id: 'rep', reporter });

			await service.create('user-1', {
				targetType: ReportTarget.USER,
				targetId: 'other-user',
				reason: ReportReason.INAPPROPRIATE,
			});

			expect(prisma.user.findUnique).toHaveBeenCalledWith({
				where: { id: 'other-user' },
				select: { id: true },
			});
		});

		it('resolve alvo MESSAGE', async () => {
			prisma.message.findUnique.mockResolvedValue({
				senderId: 'other-user',
			});
			prisma.report.findUnique.mockResolvedValue(null);
			prisma.report.create.mockResolvedValue({ id: 'rep', reporter });

			await service.create('user-1', {
				targetType: ReportTarget.MESSAGE,
				targetId: 'msg-1',
				reason: ReportReason.SPAM,
			});

			expect(prisma.message.findUnique).toHaveBeenCalledWith({
				where: { id: 'msg-1' },
				select: { senderId: true },
			});
		});
	});

	describe('list', () => {
		it('403 para não-moderador', async () => {
			await expect(
				service.list({ id: 'user-1', role: 'USER' }, {}),
			).rejects.toThrow(ForbiddenException);
		});

		it('retorna lista paginada para moderador', async () => {
			prisma.report.count.mockResolvedValue(1);
			prisma.report.findMany.mockResolvedValue([
				{
					id: 'rep-1',
					targetType: ReportTarget.AD,
					targetId: 'ad-1',
					reason: ReportReason.FRAUD,
					description: null,
					media: [],
					status: ReportStatus.PENDING,
					createdAt: new Date(),
					reporter,
				},
			]);

			const result = await service.list(admin, { page: 1, limit: 20 });

			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].reporter.id).toBe('user-1');
		});
	});

	describe('listMine', () => {
		it('filtra por reporterId e retorna lista paginada', async () => {
			prisma.report.count.mockResolvedValue(1);
			prisma.report.findMany.mockResolvedValue([
				{
					id: 'rep-1',
					targetType: ReportTarget.AD,
					targetId: 'ad-1',
					reason: ReportReason.FRAUD,
					description: null,
					media: [],
					status: ReportStatus.PENDING,
					createdAt: new Date(),
					reporter,
				},
			]);

			const result = await service.listMine('user-1', {
				page: 1,
				limit: 20,
			});

			expect(prisma.report.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ reporterId: 'user-1' }),
				}),
			);
			expect(result.total).toBe(1);
			expect(result.items).toHaveLength(1);
		});
	});

	describe('updateStatus', () => {
		it('403 para não-moderador', async () => {
			await expect(
				service.updateStatus({ id: 'user-1', role: 'USER' }, 'rep-1', {
					status: ReportStatus.RESOLVED,
				}),
			).rejects.toThrow(ForbiddenException);
		});

		it('404 para report inexistente', async () => {
			prisma.report.findUnique.mockResolvedValue(null);

			await expect(
				service.updateStatus(admin, 'rep-1', {
					status: ReportStatus.RESOLVED,
				}),
			).rejects.toThrow(NotFoundException);
		});

		it('atualiza status', async () => {
			prisma.report.findUnique.mockResolvedValue({ id: 'rep-1' });
			prisma.report.update.mockResolvedValue({ id: 'rep-1' });

			await service.updateStatus(admin, 'rep-1', {
				status: ReportStatus.RESOLVED,
			});

			expect(prisma.report.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'rep-1' },
					data: { status: ReportStatus.RESOLVED },
				}),
			);
		});
	});

	describe('count', () => {
		it('conta denúncias não-dismissed', async () => {
			prisma.report.count.mockResolvedValue(3);

			const result = await service.count({
				targetType: ReportTarget.AD,
				targetId: 'ad-1',
			});

			expect(result.count).toBe(3);
			expect(prisma.report.count).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						targetType: ReportTarget.AD,
						targetId: 'ad-1',
						status: { not: 'DISMISSED' },
					}),
				}),
			);
		});
	});
});
