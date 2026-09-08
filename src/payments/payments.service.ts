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
	CreatePaymentDto,
	PaymentsQueryDto,
	ReviewPaymentDto,
	SubmitPaymentProofDto,
} from './payments.dto';

const PAYMENT_INCLUDE = {
	subscription: {
		include: {
			plan: {
				select: {
					id: true,
					name: true,
					price: true,
					currency: true,
					durationDays: true,
					businessVisibilityLimit: true,
					featuredAdsLimit: true,
				},
			},
			business: {
				select: {
					id: true,
					name: true,
					slug: true,
					ownerId: true,
				},
			},
		},
	},
} as const;

type PaymentWithInclude = Prisma.PaymentGetPayload<{
	include: typeof PAYMENT_INCLUDE;
}>;

export interface PaymentSessionUser {
	id: string;
	role: string;
}

@Injectable()
export class PaymentsService {
	constructor(private readonly prisma: PrismaService) {}

	async create(
		userId: string,
		role: string,
		dto: CreatePaymentDto,
	): Promise<unknown> {
		const business = await this.prisma.business.findUnique({
			where: { id: dto.businessId },
			select: { id: true, ownerId: true },
		});
		if (!business) {
			throw new NotFoundException('Empresa não encontrada.');
		}
		if (!this.isOwnerOrPrivileged(business, { id: userId, role })) {
			throw new ForbiddenException(
				'Sem permissão para subscrever esta empresa.',
			);
		}

		const plan = await this.prisma.plan.findUnique({
			where: { id: dto.planId },
			select: {
				id: true,
				name: true,
				price: true,
				durationDays: true,
				businessVisibilityLimit: true,
				isActive: true,
			},
		});
		if (!plan || !plan.isActive) {
			throw new BadRequestException('Plano inválido ou inativo.');
		}

		await this.expireStaleSubscriptions();

		const now = new Date();
		const active = await this.prisma.subscription.findFirst({
			where: {
				businessId: dto.businessId,
				status: 'ACTIVE',
				endDate: { gt: now },
			},
			select: { id: true },
		});
		if (active) {
			throw new ConflictException(
				'Esta empresa já tem uma subscrição ativa.',
			);
		}

		const listingsInUse = await this.prisma.subscription.count({
			where: {
				user: { businesses: { some: { ownerId: userId } } },
				status: 'ACTIVE',
				endDate: { gt: now },
			},
		});
		if (listingsInUse >= plan.businessVisibilityLimit) {
			throw new ConflictException(
				'O seu plano atingiu o limite de listagens visíveis.',
			);
		}

		const subscription = await this.prisma.subscription.findFirst({
			where: { businessId: dto.businessId, status: 'PENDING' },
			orderBy: { createdAt: 'desc' },
			select: { id: true },
		});
		const subscriptionId = subscription
			? subscription.id
			: await this.prisma.subscription
					.create({
						data: {
							id: newId(),
							userId,
							businessId: dto.businessId,
							planId: plan.id,
							status: 'PENDING',
							endDate: this.endDate(plan.durationDays, now),
						},
						select: { id: true },
					})
					.then((row) => row.id);

		const account = await this.prisma.platformBankAccount.findFirst({
			where: { isActive: true },
			select: {
				bankName: true,
				bankHolder: true,
				bankIban: true,
			},
		});
		if (!account) {
			throw new BadRequestException(
				'Nenhuma conta bancária da plataforma está configurada.',
			);
		}

		const payment = await this.prisma.payment.create({
			data: {
				id: newId(),
				subscriptionId,
				amount: plan.price,
				platformAccount: [account],
			},
			include: PAYMENT_INCLUDE,
		});

		return this.toPublicPayment(payment);
	}

	async submitProof(
		userId: string,
		role: string,
		paymentId: string,
		dto: SubmitPaymentProofDto,
	): Promise<unknown> {
		const payment = await this.prisma.payment.findUnique({
			where: { id: paymentId },
			include: PAYMENT_INCLUDE,
		});
		if (!payment) {
			throw new NotFoundException('Pagamento não encontrado.');
		}
		const ownerId = payment.subscription.business.ownerId;
		if (ownerId !== userId && !this.isPrivileged({ id: userId, role })) {
			throw new ForbiddenException(
				'Sem permissão para submeter este pagamento.',
			);
		}
		if (payment.status !== 'PENDING') {
			throw new BadRequestException(
				'Apenas pagamentos pendentes podem receber comprovativo.',
			);
		}

		const updated = await this.prisma.payment.update({
			where: { id: paymentId },
			data: {
				status: 'UNDER_REVIEW',
				proofUrl: dto.proofUrl,
				proofId: dto.proofId,
				proofAt: new Date(),
			},
			include: PAYMENT_INCLUDE,
		});
		return this.toPublicPayment(updated);
	}

	async cancel(
		userId: string,
		role: string,
		paymentId: string,
	): Promise<unknown> {
		const payment = await this.prisma.payment.findUnique({
			where: { id: paymentId },
			include: PAYMENT_INCLUDE,
		});
		if (!payment) {
			throw new NotFoundException('Pagamento não encontrado.');
		}
		const ownerId = payment.subscription.business.ownerId;
		if (ownerId !== userId && !this.isPrivileged({ id: userId, role })) {
			throw new ForbiddenException(
				'Sem permissão para cancelar este pagamento.',
			);
		}
		if (payment.status !== 'PENDING' && payment.status !== 'UNDER_REVIEW') {
			throw new BadRequestException(
				'Este pagamento já não pode ser cancelado.',
			);
		}

		const updated = await this.prisma.payment.update({
			where: { id: paymentId },
			data: { status: 'CANCELLED' },
			include: PAYMENT_INCLUDE,
		});
		return this.toPublicPayment(updated);
	}

	async review(
		adminUser: { id: string },
		paymentId: string,
		dto: ReviewPaymentDto,
	): Promise<unknown> {
		const payment = await this.prisma.payment.findUnique({
			where: { id: paymentId },
			include: PAYMENT_INCLUDE,
		});
		if (!payment) {
			throw new NotFoundException('Pagamento não encontrado.');
		}
		if (payment.status === 'CANCELLED' || payment.status === 'APPROVED') {
			throw new BadRequestException(
				'Este pagamento já foi concluído ou cancelado.',
			);
		}

		const subscribedPlan = payment.subscription.plan;
		const base = {
			reviewedAt: new Date(),
			reviewedBy: adminUser.id,
			adminNote: dto.note,
		};

		if (dto.decision === 'REJECTED') {
			const updated = await this.prisma.payment.update({
				where: { id: paymentId },
				data: { status: 'REJECTED', ...base },
				include: PAYMENT_INCLUDE,
			});
			await this.syncBusinessVisibility(payment.subscription.business.id);
			return this.toPublicPayment(updated);
		}

		if (payment.status !== 'UNDER_REVIEW') {
			throw new BadRequestException(
				'Aprovação requer um comprovativo submetido.',
			);
		}

		const now = new Date();
		await this.prisma.$transaction([
			this.prisma.payment.update({
				where: { id: paymentId },
				data: { status: 'APPROVED', ...base },
			}),
			this.prisma.subscription.update({
				where: { id: payment.subscriptionId },
				data: {
					status: 'ACTIVE',
					startDate: now,
					endDate: this.endDate(subscribedPlan.durationDays, now),
					renewedAt: now,
					cancelledAt: null,
				},
			}),
		]);
		await this.syncBusinessVisibility(payment.subscription.business.id);

		const fresh = await this.prisma.payment.findUnique({
			where: { id: paymentId },
			include: PAYMENT_INCLUDE,
		});
		return fresh ? this.toPublicPayment(fresh) : null;
	}

	async list(query: PaymentsQueryDto): Promise<unknown> {
		await this.expireStaleSubscriptions();
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Prisma.PaymentWhereInput = {
			...(query.status && { status: query.status }),
		};

		const [total, payments] = await Promise.all([
			this.prisma.payment.count({ where }),
			this.prisma.payment.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: PAYMENT_INCLUDE,
			}),
		]);

		return {
			items: payments.map((payment) => this.toPublicPayment(payment)),
			total,
			page,
			limit,
		};
	}

	async getById(
		userId: string,
		role: string,
		paymentId: string,
	): Promise<unknown> {
		const payment = await this.prisma.payment.findUnique({
			where: { id: paymentId },
			include: PAYMENT_INCLUDE,
		});
		if (!payment) {
			throw new NotFoundException('Pagamento não encontrado.');
		}
		if (
			payment.subscription.business.ownerId !== userId &&
			!this.isPrivileged({ id: userId, role })
		) {
			throw new ForbiddenException(
				'Sem permissão para ver este pagamento.',
			);
		}
		return this.toPublicPayment(payment);
	}

	async expireStaleSubscriptions(): Promise<void> {
		const now = new Date();
		await this.prisma.subscription.updateMany({
			where: { status: 'ACTIVE', endDate: { lt: now } },
			data: { status: 'EXPIRED' },
		});

		const hidden = await this.prisma.business.findMany({
			where: {
				status: 'SHOW',
				subscriptions: {
					none: { status: 'ACTIVE', endDate: { gt: now } },
				},
			},
			select: { id: true },
		});
		if (hidden.length > 0) {
			await this.prisma.business.updateMany({
				where: { id: { in: hidden.map((item) => item.id) } },
				data: { status: 'HIDE' },
			});
		}
	}

	private async syncBusinessVisibility(businessId: string): Promise<void> {
		const now = new Date();
		const active = await this.prisma.subscription.findFirst({
			where: {
				businessId,
				status: 'ACTIVE',
				endDate: { gt: now },
			},
			select: { id: true },
		});
		await this.prisma.business.update({
			where: { id: businessId },
			data: { status: active ? 'SHOW' : 'HIDE' },
		});
	}

	private endDate(durationDays: number, from: Date): Date {
		return new Date(from.getTime() + durationDays * 24 * 60 * 60 * 1000);
	}

	private isPrivileged(user?: PaymentSessionUser): boolean {
		return user?.role === 'ADMIN' || user?.role === 'MODERATOR';
	}

	private isOwnerOrPrivileged(
		business: { ownerId: string },
		user: PaymentSessionUser,
	): boolean {
		return business.ownerId === user.id || this.isPrivileged(user);
	}

	private toPublicPayment(payment: PaymentWithInclude): unknown {
		return {
			id: payment.id,
			amount: payment.amount.toNumber(),
			status: payment.status,
			platformAccount: payment.platformAccount ?? null,
			proofUrl: payment.proofUrl,
			proofId: payment.proofId,
			proofAt: payment.proofAt,
			reviewedAt: payment.reviewedAt,
			reviewedBy: payment.reviewedBy,
			adminNote: payment.adminNote,
			createdAt: payment.createdAt,
			updatedAt: payment.updatedAt,
			subscription: {
				id: payment.subscription.id,
				status: payment.subscription.status,
				startDate: payment.subscription.startDate,
				endDate: payment.subscription.endDate,
				autoRenew: payment.subscription.autoRenew,
				business: payment.subscription.business,
				plan: payment.subscription.plan,
			},
		};
	}
}
