import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { winstonOptions } from './common/logging/winston.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { ResendModule } from './common/resend/resend.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => [
				{
					ttl: Number(
						configService.get<string>('THROTTLE_TTL', '60000'),
					),
					limit: Number(
						configService.get<string>('THROTTLE_LIMIT', '100'),
					),
				},
			],
		}),
		WinstonModule.forRoot(winstonOptions),
		PrismaModule,
		CloudinaryModule,
		ResendModule,
	],
	controllers: [AppController],
	providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
