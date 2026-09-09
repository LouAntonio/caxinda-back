import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';

@Injectable()
export class PlansService {
	constructor(private readonly prisma: PrismaService) {}

	async list() {
		const [plans, platformAccounts] = await Promise.all([
			this.prisma.plan.findMany({
				where: { isActive: true },
				orderBy: { price: 'asc' },
			}),
			this.prisma.platformBankAccount.findMany({
				where: { isActive: true },
			}),
		]);

		return {
			plans: plans.map((plan) => ({
				id: plan.id,
				name: plan.name,
				description: plan.description,
				price: plan.price.toNumber(),
				currency: plan.currency,
				durationDays: plan.durationDays,
				benefits: plan.benefits,
				businessVisibilityLimit: plan.businessVisibilityLimit,
				featuredAdsLimit: plan.featuredAdsLimit,
				isActive: plan.isActive,
				createdAt: plan.createdAt,
				updatedAt: plan.updatedAt,
			})),
			platformAccounts: platformAccounts.map((account) => ({
				bankName: account.bankName,
				bankHolder: account.bankHolder,
				bankIban: account.bankIban,
			})),
		};
	}
}
