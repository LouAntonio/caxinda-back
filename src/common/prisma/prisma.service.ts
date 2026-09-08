import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(PrismaService.name);

	constructor(configService: ConfigService) {
		const adapter = new PrismaPg({
			connectionString: configService.getOrThrow<string>('DATABASE_URL'),
		});
		super({ adapter });
	}

	async onModuleInit(): Promise<void> {
		await this.$connect();
		this.logger.log('Database connected');
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
	}
}
