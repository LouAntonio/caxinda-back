import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { Prisma } from '../generated/prisma/client';
import { newId } from '../libs/id';
import { CreatePlanDto, UpdatePlanDto } from './plans.dto';

function isForeignKeyViolation(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2003'
	);
}

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
			plans: plans.map((plan) => this.toPublic(plan)),
			platformAccounts: platformAccounts.map((account) => ({
				bankName: account.bankName,
				bankHolder: account.bankHolder,
				bankIban: account.bankIban,
			})),
		};
	}

	async listAll() {
		const plans = await this.prisma.plan.findMany({
			orderBy: { price: 'asc' },
		});
		return plans.map((plan) => this.toPublic(plan));
	}

	async create(dto: CreatePlanDto) {
		return this.prisma.plan.create({
			data: {
				id: newId(),
				name: dto.name,
				description: dto.description,
				price: new Prisma.Decimal(dto.price),
				currency: dto.currency ?? 'AOA',
				durationDays: dto.durationDays ?? 30,
				benefits: dto.benefits ?? [],
				businessVisibilityLimit: dto.businessVisibilityLimit ?? 1,
				featuredAdsLimit: dto.featuredAdsLimit ?? 0,
				isActive: dto.isActive ?? true,
			},
		});
	}

	async update(id: string, dto: UpdatePlanDto) {
		const plan = await this.prisma.plan.findUnique({ where: { id } });
		if (!plan) {
			throw new NotFoundException('Plano não encontrado.');
		}

		return this.prisma.plan.update({
			where: { id },
			data: {
				name: dto.name,
				description: dto.description,
				price:
					dto.price !== undefined
						? new Prisma.Decimal(dto.price)
						: undefined,
				currency: dto.currency,
				durationDays: dto.durationDays,
				benefits: dto.benefits,
				businessVisibilityLimit: dto.businessVisibilityLimit,
				featuredAdsLimit: dto.featuredAdsLimit,
				isActive: dto.isActive,
			},
		});
	}

	async remove(id: string) {
		const plan = await this.prisma.plan.findUnique({ where: { id } });
		if (!plan) {
			throw new NotFoundException('Plano não encontrado.');
		}

		try {
			await this.prisma.plan.delete({ where: { id } });
		} catch (error) {
			if (isForeignKeyViolation(error)) {
				throw new ConflictException(
					'Não é possível remover um plano que possui subscrições.',
				);
			}
			throw error;
		}
	}

	private toPublic(plan: {
		id: string;
		name: string;
		description: string | null;
		price: Prisma.Decimal;
		currency: string;
		durationDays: number;
		benefits: string[];
		businessVisibilityLimit: number;
		featuredAdsLimit: number;
		isActive: boolean;
		createdAt: Date;
		updatedAt: Date;
	}) {
		return {
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
		};
	}
}
