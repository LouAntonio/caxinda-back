import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { newId } from '../libs/id';
import {
	CreateReportDto,
	ReportCountQueryDto,
	ReportSessionUser,
	ReportsQueryDto,
	ReportTarget,
	UpdateReportStatusDto,
} from './reports.dto';

const REPORT_INCLUDE = {
	reporter: {
		select: { id: true, name: true, surname: true, image: true },
	},
} as const;

@Injectable()
export class ReportsService {
	constructor(private readonly prisma: PrismaService) {}

	private isModerator(user: ReportSessionUser): boolean {
		return user.role === 'ADMIN' || user.role === 'MODERATOR';
	}

	async create(reporterId: string, dto: CreateReportDto) {
		const ownerId = await this.resolveTargetOwner(
			dto.targetType,
			dto.targetId,
		);
		if (ownerId === reporterId) {
			throw new BadRequestException(
				'Não é possível denunciar o seu próprio conteúdo.',
			);
		}

		const existing = await this.prisma.report.findUnique({
			where: {
				reporterId_targetType_targetId: {
					reporterId,
					targetType: dto.targetType,
					targetId: dto.targetId,
				},
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException('Você já denunciou este conteúdo.');
		}

		const report = await this.prisma.report.create({
			data: {
				id: newId(),
				targetType: dto.targetType,
				targetId: dto.targetId,
				reason: dto.reason,
				description: dto.description?.trim() || null,
				media: (dto.media ?? []) as unknown as Prisma.InputJsonValue,
				reporterId,
			},
			include: REPORT_INCLUDE,
		});

		return this.toPublicReport(report);
	}

	async list(user: ReportSessionUser, query: ReportsQueryDto) {
		if (!this.isModerator(user)) {
			throw new ForbiddenException(
				'Apenas moderadores podem listar denúncias.',
			);
		}

		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Prisma.ReportWhereInput = {
			...(query.status && { status: query.status }),
			...(query.targetType && { targetType: query.targetType }),
			...(query.targetId && { targetId: query.targetId }),
		};

		const [total, reports] = await Promise.all([
			this.prisma.report.count({ where }),
			this.prisma.report.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: REPORT_INCLUDE,
			}),
		]);

		return {
			items: await Promise.all(
				reports.map((report) => this.toPublicReport(report)),
			),
			total,
			page,
			limit,
		};
	}

	async listMine(reporterId: string, query: ReportsQueryDto) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Prisma.ReportWhereInput = {
			reporterId,
			...(query.status && { status: query.status }),
		};

		const [total, reports] = await Promise.all([
			this.prisma.report.count({ where }),
			this.prisma.report.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: REPORT_INCLUDE,
			}),
		]);

		return {
			items: await Promise.all(
				reports.map((report) => this.toPublicReport(report)),
			),
			total,
			page,
			limit,
		};
	}

	async updateStatus(
		user: ReportSessionUser,
		reportId: string,
		dto: UpdateReportStatusDto,
	) {
		if (!this.isModerator(user)) {
			throw new ForbiddenException(
				'Apenas moderadores podem atualizar denúncias.',
			);
		}

		const report = await this.prisma.report.findUnique({
			where: { id: reportId },
			select: { id: true },
		});
		if (!report) {
			throw new NotFoundException('Denúncia não encontrada.');
		}

		return this.prisma.report.update({
			where: { id: reportId },
			data: { status: dto.status },
			include: REPORT_INCLUDE,
		});
	}

	async count(query: ReportCountQueryDto) {
		const count = await this.prisma.report.count({
			where: {
				targetType: query.targetType,
				targetId: query.targetId,
				status: { not: 'DISMISSED' },
			},
		});
		return { count };
	}

	private async resolveTargetOwner(
		targetType: ReportTarget,
		targetId: string,
	): Promise<string | null> {
		switch (targetType) {
			case ReportTarget.AD: {
				const ad = await this.prisma.ad.findUnique({
					where: { id: targetId },
					select: { userId: true },
				});
				if (!ad) {
					throw new NotFoundException('Anúncio não encontrado.');
				}
				return ad.userId;
			}
			case ReportTarget.USER: {
				const user = await this.prisma.user.findUnique({
					where: { id: targetId },
					select: { id: true },
				});
				if (!user) {
					throw new NotFoundException('Usuário não encontrado.');
				}
				return user.id;
			}
			case ReportTarget.REVIEW: {
				const review = await this.prisma.review.findUnique({
					where: { id: targetId },
					select: { revieweeId: true },
				});
				if (!review) {
					throw new NotFoundException('Avaliação não encontrada.');
				}
				return review.revieweeId;
			}
			case ReportTarget.MESSAGE: {
				const message = await this.prisma.message.findUnique({
					where: { id: targetId },
					select: { senderId: true },
				});
				if (!message) {
					throw new NotFoundException('Mensagem não encontrada.');
				}
				return message.senderId;
			}
			default:
				return null;
		}
	}

	private async resolveTargetLabel(
		targetType: ReportTarget,
		targetId: string,
	): Promise<string | null> {
		switch (targetType) {
			case ReportTarget.AD: {
				const ad = await this.prisma.ad.findUnique({
					where: { id: targetId },
					select: { title: true },
				});
				return ad?.title ?? null;
			}
			case ReportTarget.USER: {
				const user = await this.prisma.user.findUnique({
					where: { id: targetId },
					select: { name: true, surname: true },
				});
				if (!user) return null;
				return [user.name, user.surname].filter(Boolean).join(' ');
			}
			case ReportTarget.REVIEW: {
				const review = await this.prisma.review.findUnique({
					where: { id: targetId },
					select: { id: true },
				});
				return review ? 'Avaliação' : null;
			}
			case ReportTarget.MESSAGE: {
				const message = await this.prisma.message.findUnique({
					where: { id: targetId },
					select: { content: true },
				});
				return message?.content?.slice(0, 80) ?? null;
			}
			default:
				return null;
		}
	}

	private async toPublicReport(report: {
		id: string;
		targetType: ReportTarget;
		targetId: string;
		reason: string;
		description: string | null;
		media: unknown;
		status: string;
		createdAt: Date;
		reporter: {
			id: string;
			name: string;
			surname: string | null;
			image: string | null;
		};
	}) {
		const targetLabel = await this.resolveTargetLabel(
			report.targetType,
			report.targetId,
		);
		return {
			id: report.id,
			targetType: report.targetType,
			targetId: report.targetId,
			targetLabel,
			reason: report.reason,
			description: report.description,
			media: report.media,
			status: report.status,
			createdAt: report.createdAt,
			reporter: report.reporter,
		};
	}
}
