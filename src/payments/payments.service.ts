import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.module';
import { buildPagination, paginate } from '../common/dto/paginated-result.dto';
import { newId } from '../libs/id';
import { sendMailBridge } from '../libs/mail';
import { frontUrl } from '../libs/auth-tokens';
import { renderEmail, getAdminEmails } from '../email/templates';
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
		const adminEmails = getAdminEmails();
		if (adminEmails.length) {
			await sendMailBridge({
				to: adminEmails.join(','),
				...renderEmail({
					subject: 'Comprovativo de pagamento em análise',
					title: 'Novo comprovativo de pagamento',
					paragraph: [
						`Foi submetido um comprovativo para o pagamento de ${payment.subscription.plan.name} no valor de ${payment.amount.toString()} AOA.`,
						'A equipa da Caxinda Divulga irá analisar o comprovativo em breve.',
					],
					details: [
						{
							label: 'Empresa',
							value: payment.subscription.business.name,
						},
					],
					button: {
						label: 'Ver pagamentos',
						url: frontUrl('/admin/pagamentos'),
					},
				}),
			});
		}

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

		if (dto.decision === 'RETURNED') {
			const updated = await this.prisma.payment.update({
				where: { id: paymentId },
				data: {
					status: 'PENDING',
					proofUrl: null,
					proofId: null,
					proofAt: null,
					...base,
				},
				include: PAYMENT_INCLUDE,
			});
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

		const ownerId = payment.subscription.business.ownerId;
		const owner = await this.prisma.user.findUnique({
			where: { id: ownerId },
			select: { email: true },
		});
		if (owner?.email) {
			const amount = `${payment.amount.toString()} AOA`;
			const planName = payment.subscription.plan.name;
			if (dto.decision === 'APPROVED') {
				await sendMailBridge({
					to: owner.email,
					...renderEmail({
						subject: 'Pagamento confirmado',
						greeting: 'Olá,',
						title: 'O seu pagamento foi aprovado',
						paragraph: [
							`O pagamento de ${planName} no valor de ${amount} foi aprovado e a sua subscrição está agora ativa.`,
						],
						button: {
							label: 'Gerir subscrição',
							url: frontUrl('/admin/pagamentos'),
						},
						note: 'Obrigado por utilizar a Caxinda Divulga.',
					}),
				});
			} else if (dto.decision === 'REJECTED') {
				await sendMailBridge({
					to: owner.email,
					...renderEmail({
						subject: 'Pagamento recusado',
						greeting: 'Olá,',
						title: 'O seu pagamento foi recusado',
						paragraph: [
							`O pagamento de ${planName} no valor de ${amount} foi recusado.`,
							...(dto.note ? [`Motivo: ${dto.note}`] : []),
						],
						button: {
							label: 'Ver pagamentos',
							url: frontUrl('/admin/pagamentos'),
						},
						note: 'Se pretende reenviar o comprovativo, submeta-o novamente.',
					}),
				});
			} else {
				await sendMailBridge({
					to: owner.email,
					...renderEmail({
						subject: 'Comprovativo devolvido',
						greeting: 'Olá,',
						title: 'O seu comprovativo foi devolvido',
						paragraph: [
							`O comprovativo do pagamento de ${planName} foi devolvido para nova análise.`,
							'Envie um novo comprovativo para prosseguir com a revisão.',
						],
						button: {
							label: 'Submeter comprovativo',
							url: frontUrl('/admin/pagamentos'),
						},
					}),
				});
			}
		}

		const fresh = await this.prisma.payment.findUnique({
			where: { id: paymentId },
			include: PAYMENT_INCLUDE,
		});
		return fresh ? this.toPublicPayment(fresh) : null;
	}

	async methods(): Promise<unknown> {
		const accounts = await this.prisma.platformBankAccount.findMany({
			where: { isActive: true },
			select: {
				bankName: true,
				bankHolder: true,
				bankIban: true,
			},
		});
		return accounts;
	}

	async list(query: PaymentsQueryDto) {
		await this.expireStaleSubscriptions();
		const { page, limit, skip, take } = buildPagination(
			query.page,
			query.limit,
		);
		const where: Prisma.PaymentWhereInput = {
			...(query.status && { status: query.status }),
		};

		const [total, payments] = await Promise.all([
			this.prisma.payment.count({ where }),
			this.prisma.payment.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip,
				take,
				include: PAYMENT_INCLUDE,
			}),
		]);

		return paginate(
			payments.map((payment) => this.toPublicPayment(payment)),
			total,
			{ page, limit },
		);
	}

	async mine(userId: string): Promise<unknown> {
		await this.expireStaleSubscriptions();
		const payments = await this.prisma.payment.findMany({
			where: {
				subscription: { business: { ownerId: userId } },
			},
			orderBy: { createdAt: 'desc' },
			take: 50,
			include: PAYMENT_INCLUDE,
		});
		return payments.map((payment) => this.toPublicPayment(payment));
	}

	async mySubscriptions(userId: string): Promise<unknown> {
		await this.expireStaleSubscriptions();
		const subscriptions = await this.prisma.subscription.findMany({
			where: { business: { ownerId: userId } },
			orderBy: { createdAt: 'desc' },
			take: 50,
			include: {
				plan: true,
				business: { select: { id: true, name: true, slug: true } },
				payments: { orderBy: { createdAt: 'desc' } },
			},
		});
		return subscriptions.map((sub) => ({
			id: sub.id,
			status: sub.status,
			startDate: sub.startDate,
			endDate: sub.endDate,
			autoRenew: sub.autoRenew,
			cancelledAt: sub.cancelledAt,
			renewedAt: sub.renewedAt,
			createdAt: sub.createdAt,
			updatedAt: sub.updatedAt,
			plan: {
				id: sub.plan.id,
				name: sub.plan.name,
				price: sub.plan.price.toNumber(),
				currency: sub.plan.currency,
				durationDays: sub.plan.durationDays,
				description: sub.plan.description,
				benefits: sub.plan.benefits,
				businessVisibilityLimit: sub.plan.businessVisibilityLimit,
				featuredAdsLimit: sub.plan.featuredAdsLimit,
			},
			business: sub.business,
			payments: sub.payments.map((p) => ({
				id: p.id,
				amount: p.amount.toNumber(),
				status: p.status,
				proofUrl: p.proofUrl,
				proofAt: p.proofAt,
				reviewedAt: p.reviewedAt,
				adminNote: p.adminNote,
				createdAt: p.createdAt,
			})),
		}));
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
