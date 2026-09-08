import { Test } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { KycService } from './kyc.service';
import { EmailService } from '../email/email.service';
import { MediaService } from '../media/media.service';

jest.mock('../media/media.service', () => ({
	MediaService: jest.fn(),
}));

jest.mock('../email/email.service', () => ({
	EmailService: jest.fn(),
}));

describe('KycService', () => {
	let service: KycService;
	let prisma: {
		kYC: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
		user: { findUnique: jest.Mock; update: jest.Mock };
	};
	let emailService: EmailService;
	let mediaService: MediaService;

	const userKyc = {
		id: 'kyc-id',
		userId: 'user-id',
		status: 'PENDING',
		rejectionReason: null,
		biFrontUrl: 'https://cdn.test/bi-front.jpg',
		biFrontId: 'kyc/bi-front',
		biBackUrl: 'https://cdn.test/bi-back.jpg',
		biBackId: 'kyc/bi-back',
		selfies: [],
		verifiedAt: null,
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
	};

	beforeEach(async () => {
		prisma = {
			kYC: {
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
			},
			user: {
				findUnique: jest.fn(),
				update: jest.fn(),
			},
		};
		emailService = {
			enqueue: jest.fn().mockResolvedValue(undefined),
		} as unknown as EmailService;
		mediaService = {
			enqueueDeletion: jest.fn().mockResolvedValue(undefined),
		} as unknown as MediaService;

		const moduleRef = await Test.createTestingModule({
			providers: [
				KycService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: EmailService, useValue: emailService },
				{ provide: MediaService, useValue: mediaService },
			],
		}).compile();

		service = moduleRef.get(KycService);
	});

	describe('submit', () => {
		it('cria um novo registro KYC pendente', async () => {
			prisma.kYC.findUnique.mockResolvedValue(null);
			prisma.kYC.create.mockResolvedValue({ ...userKyc });

			const result = await service.submit('user-id', {
				biFrontUrl: 'https://cdn.test/bi-front.jpg',
				biFrontId: 'kyc/bi-front',
				biBackUrl: 'https://cdn.test/bi-back.jpg',
				biBackId: 'kyc/bi-back',
			});

			expect(prisma.kYC.create).toHaveBeenCalled();
			expect(result.status).toBe('PENDING');
			expect(result).not.toBeNull();
		});

		it('lança ConflictException quando já existe KYC aprovado', async () => {
			prisma.kYC.findUnique.mockResolvedValue({
				...userKyc,
				status: 'APPROVED',
			});

			await expect(
				service.submit('user-id', {
					biFrontUrl: 'https://cdn.test/bi-front.jpg',
					biFrontId: 'kyc/bi-front',
					biBackUrl: 'https://cdn.test/bi-back.jpg',
					biBackId: 'kyc/bi-back',
				}),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('reabre para edição quando existe KYC rejeitado', async () => {
			prisma.kYC.findUnique.mockResolvedValue({
				...userKyc,
				status: 'REJECTED',
				rejectionReason: 'Documento ilegível',
			});
			prisma.kYC.update.mockResolvedValue({
				...userKyc,
				status: 'PENDING',
			});

			const result = await service.submit('user-id', {
				biFrontUrl: 'https://cdn.test/bi-front-2.jpg',
				biFrontId: 'kyc/bi-front-2',
				biBackUrl: 'https://cdn.test/bi-back-2.jpg',
				biBackId: 'kyc/bi-back-2',
			});

			expect(prisma.kYC.update).toHaveBeenCalled();
			expect(result.status).toBe('PENDING');
		});

		it('enfileira exclusão dos documentos antigos ao reenviar', async () => {
			prisma.kYC.findUnique.mockResolvedValue({
				...userKyc,
				status: 'REJECTED',
			});
			prisma.kYC.update.mockResolvedValue({
				...userKyc,
				status: 'PENDING',
			});

			await service.submit('user-id', {
				biFrontUrl: 'https://cdn.test/bi-front-3.jpg',
				biFrontId: 'kyc/bi-front-3',
				biBackUrl: 'https://cdn.test/bi-back-3.jpg',
				biBackId: 'kyc/bi-back-3',
				selfies: [{ url: 'x', cloudinaryId: 'kyc/front-3' }],
			});

			expect(mediaService.enqueueDeletion).toHaveBeenCalledWith([
				'kyc/bi-front',
				'kyc/bi-back',
			]);
		});
	});

	describe('getStatus', () => {
		it('retorna o KYC do usuário logado', async () => {
			prisma.kYC.findUnique.mockResolvedValue(userKyc);

			const result = await service.getStatus('user-id');

			expect(result).toEqual(userKyc);
			expect(prisma.kYC.findUnique).toHaveBeenCalledWith({
				where: { userId: 'user-id' },
			});
		});

		it('retorna null quando o usuário não tem KYC', async () => {
			prisma.kYC.findUnique.mockResolvedValue(null);

			const result = await service.getStatus('user-id');

			expect(result).toBeNull();
		});
	});

	describe('review', () => {
		it('aprova o KYC, verifica o usuário e envia email', async () => {
			prisma.kYC.findUnique.mockResolvedValue(userKyc);
			prisma.kYC.update.mockResolvedValue({
				...userKyc,
				status: 'APPROVED',
			});
			prisma.user.findUnique.mockResolvedValue({
				id: 'user-id',
				email: 'user@test.com',
			});

			const result = await service.review('kyc-id', {
				status: 'APPROVED',
			});

			expect(result.status).toBe('APPROVED');
			expect(prisma.user.update).toHaveBeenCalledWith({
				where: { id: 'user-id' },
				data: { isVerified: true, role: 'PROMOTER' },
			});
			expect(emailService.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({ subject: 'Seu KYC foi aprovado' }),
			);
		});

		it('rejeita o KYC e envia email com o motivo', async () => {
			prisma.kYC.findUnique.mockResolvedValue(userKyc);
			prisma.kYC.update.mockResolvedValue({
				...userKyc,
				status: 'REJECTED',
				rejectionReason: 'Documento ilegível',
			});
			prisma.user.findUnique.mockResolvedValue({
				id: 'user-id',
				email: 'user@test.com',
			});

			const result = await service.review('kyc-id', {
				status: 'REJECTED',
				rejectionReason: 'Documento ilegível',
			});

			expect(result.status).toBe('REJECTED');
			expect(prisma.user.update).toHaveBeenCalledWith({
				where: { id: 'user-id' },
				data: { isVerified: false, role: 'USER' },
			});
			expect(emailService.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({ subject: 'Seu KYC foi recusado' }),
			);
		});

		it('lança BadRequestException se REJECTED sem motivo', async () => {
			prisma.kYC.findUnique.mockResolvedValue(userKyc);

			await expect(
				service.review('kyc-id', { status: 'REJECTED' }),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('lança NotFoundException se o KYC não existe', async () => {
			prisma.kYC.findUnique.mockResolvedValue(null);

			await expect(
				service.review('kyc-id', { status: 'APPROVED' }),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('ban', () => {
		it('marca a conta como banida, verificação como inválida e envia email', async () => {
			prisma.kYC.findUnique.mockResolvedValue(userKyc);
			prisma.user.findUnique.mockResolvedValue({
				id: 'user-id',
				email: 'user@test.com',
			});

			await service.ban('user-id');

			expect(prisma.kYC.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ status: 'REJECTED' }),
				}),
			);
			expect(prisma.user.update).toHaveBeenCalledWith({
				where: { id: 'user-id' },
				data: { banned: true, isVerified: false, role: 'USER' },
			});
			expect(emailService.enqueue).toHaveBeenCalledWith(
				expect.objectContaining({ subject: 'Sua conta foi banida' }),
			);
		});
	});
});
