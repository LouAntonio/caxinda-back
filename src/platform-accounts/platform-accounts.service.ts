import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.module';
import { newId } from '../libs/id';
import {
	CreatePlatformAccountDto,
	UpdatePlatformAccountDto,
} from './platform-accounts.dto';

@Injectable()
export class PlatformAccountsService {
	constructor(private readonly prisma: PrismaService) {}

	async list() {
		return this.prisma.platformBankAccount.findMany({
			orderBy: { createdAt: 'desc' },
		});
	}

	async create(dto: CreatePlatformAccountDto) {
		if (dto.isActive) {
			await this.deactivateAll();
		}
		return this.prisma.platformBankAccount.create({
			data: {
				id: newId(),
				bankName: dto.bankName,
				bankHolder: dto.bankHolder,
				bankIban: dto.bankIban,
				isActive: dto.isActive ?? false,
			},
		});
	}

	async update(id: string, dto: UpdatePlatformAccountDto) {
		await this.ensureExists(id);
		if (dto.isActive) {
			await this.deactivateAll();
		}
		return this.prisma.platformBankAccount.update({
			where: { id },
			data: {
				...(dto.bankName !== undefined && { bankName: dto.bankName }),
				...(dto.bankHolder !== undefined && {
					bankHolder: dto.bankHolder,
				}),
				...(dto.bankIban !== undefined && { bankIban: dto.bankIban }),
				...(dto.isActive !== undefined && { isActive: dto.isActive }),
			},
		});
	}

	async remove(id: string) {
		await this.ensureExists(id);
		await this.prisma.platformBankAccount.delete({ where: { id } });
	}

	private async ensureExists(id: string) {
		const exists = await this.prisma.platformBankAccount.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!exists) {
			throw new NotFoundException('Conta bancária não encontrada.');
		}
	}

	private async deactivateAll() {
		await this.prisma.platformBankAccount.updateMany({
			where: { isActive: true },
			data: { isActive: false },
		});
	}
}
