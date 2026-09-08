import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { Prisma } from '../generated/prisma/client';
import { newId } from '../libs/id';
import { EmailService } from '../email/email.service';
import { MediaService } from '../media/media.service';
import { ReviewKycDto, SubmitKycDto } from './kyc.dto';

type KYCStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface KycRecord {
	id: string;
	userId: string;
	status: KYCStatus;
	rejectionReason: string | null;
	biFrontUrl: string;
	biFrontId: string;
	biBackUrl: string;
	biBackId: string;
	selfies: unknown;
	verifiedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

@Injectable()
export class KycService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly emailService: EmailService,
		private readonly mediaService: MediaService,
	) {}

	private async findKyc(userId: string): Promise<KycRecord | null> {
		return await this.prisma.kYC.findUnique({
			where: { userId },
		});
	}

	async submit(userId: string, dto: SubmitKycDto): Promise<KycRecord> {
		const existing = await this.findKyc(userId);

		if (existing?.status === 'APPROVED') {
			throw new ConflictException(
				'KYC já aprovado. Não é possível editar os dados de identidade após a aprovação.',
			);
		}

		const data = {
			id: newId(),
			userId,
			status: 'PENDING' as KYCStatus,
			rejectionReason: null,
			biFrontUrl: dto.biFrontUrl,
			biFrontId: dto.biFrontId,
			biBackUrl: dto.biBackUrl,
			biBackId: dto.biBackId,
			selfies: (dto.selfies?.length
				? dto.selfies
				: []) as unknown as Prisma.InputJsonValue,
		};

		const record = existing
			? await this.cleanThenUpdate(existing, dto)
			: await this.prisma.kYC.create({ data });

		if (existing) {
			await this.prisma.user.update({
				where: { id: userId },
				data: { isVerified: false },
			});
		}

		return record;
	}

	async getStatus(userId: string): Promise<KycRecord | null> {
		return this.findKyc(userId);
	}

	async list(query: { status?: KYCStatus; page?: number; limit?: number }) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where = query.status ? { status: query.status } : {};

		const [items, total] = await Promise.all([
			this.prisma.kYC.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: {
					user: {
						select: {
							id: true,
							name: true,
							surname: true,
							email: true,
							image: true,
							isVerified: true,
							banned: true,
							createdAt: true,
						},
					},
				},
			}),
			this.prisma.kYC.count({ where }),
		]);

		return { items, total, page, limit };
	}

	async review(kycId: string, dto: ReviewKycDto): Promise<KycRecord> {
		const kyc = await this.prisma.kYC.findUnique({
			where: { id: kycId },
		});

		if (!kyc) {
			throw new NotFoundException('Registro KYC não encontrado.');
		}

		if (dto.status === 'REJECTED' && !dto.rejectionReason) {
			throw new BadRequestException(
				'Exija um motivo de rejeição quando o status for REJECTED.',
			);
		}

		const updated = await this.prisma.kYC.update({
			where: { id: kycId },
			data: {
				status: dto.status,
				rejectionReason: dto.rejectionReason ?? null,
				verifiedAt: dto.status === 'APPROVED' ? new Date() : null,
			},
		});

		await this.prisma.user.update({
			where: { id: updated.userId },
			data: { isVerified: dto.status === 'APPROVED' },
		});

		await this.sendKycEmail(dto, updated.userId);

		return updated;
	}

	async ban(userId: string, reason = 'Conta banida'): Promise<void> {
		const kyc = await this.findKyc(userId);

		if (kyc) {
			await this.prisma.kYC.update({
				where: { id: kyc.id },
				data: {
					status: 'REJECTED',
					rejectionReason: reason,
					verifiedAt: null,
				},
			});
		}

		await this.prisma.user.update({
			where: { id: userId },
			data: {
				banned: true,
				isVerified: false,
			},
		});

		const email = await this.getUserEmail(userId);
		if (email) {
			await this.emailService.enqueue({
				to: email,
				subject: 'Sua conta foi banida',
				html: `<p>Olá,</p>
				<p>Sua conta na Caxinda foi banida${reason ? `: ${reason}` : ''}.</p>
				<p>Caso acredite que isto seja um erro, entre em contato com o suporte.</p>`,
			});
		}
	}

	private async cleanThenUpdate(existing: KycRecord, dto: SubmitKycDto) {
		const oldIds: string[] = [];
		if (existing.biFrontId) {
			oldIds.push(existing.biFrontId);
		}
		if (existing.biBackId) {
			oldIds.push(existing.biBackId);
		}
		if (Array.isArray(existing.selfies)) {
			for (const s of existing.selfies) {
				const rec = s as { cloudinaryId?: string };
				if (rec.cloudinaryId) {
					oldIds.push(rec.cloudinaryId);
				}
			}
		}
		if (oldIds.length > 0) {
			await this.mediaService.enqueueDeletion(oldIds);
		}

		return this.prisma.kYC.update({
			where: { id: existing.id },
			data: {
				status: 'PENDING',
				rejectionReason: null,
				biFrontUrl: dto.biFrontUrl,
				biFrontId: dto.biFrontId,
				biBackUrl: dto.biBackUrl,
				biBackId: dto.biBackId,
				selfies: (dto.selfies?.length
					? dto.selfies
					: []) as unknown as Prisma.InputJsonValue,
			},
		});
	}

	private async getUserEmail(userId: string): Promise<string | null> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		});
		return user?.email ?? null;
	}

	private async sendKycEmail(
		dto: ReviewKycDto,
		userId: string,
	): Promise<void> {
		const email = await this.getUserEmail(userId);
		if (!email) {
			return;
		}

		if (dto.status === 'APPROVED') {
			await this.emailService.enqueue({
				to: email,
				subject: 'Seu KYC foi aprovado',
				html: `<p>Olá,</p>
					<p>A sua verificação de identidade (KYC) foi <strong>aprovada</strong>.</p>
					<p>Agora a sua conta está verificada.</p>`,
			});
			return;
		}

		await this.emailService.enqueue({
			to: email,
			subject: 'Seu KYC foi recusado',
			html: `<p>Olá,</p>
				<p>A sua verificação de identidade (KYC) foi <strong>recusada</strong>${
					dto.rejectionReason
						? ` pelo seguinte motivo: ${dto.rejectionReason}`
						: ''
				}.</p>
				<p>Você pode reenviar os seus documentos a qualquer momento.</p>`,
		});
	}
}
