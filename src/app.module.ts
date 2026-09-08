import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { AdsModule } from './ads/ads.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { CategoriesModule } from './categories/categories.module';
import { ChatsModule } from './chat/chat.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { winstonOptions } from './common/logging/winston.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { ResendModule } from './common/resend/resend.module';
import { KycModule } from './kyc/kyc.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UsersModule } from './users/users.module';
import { WishlistModule } from './wishlist/wishlist.module';

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
		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				connection: {
					url: configService.get<string>(
						'REDIS_URL',
						'redis://localhost:6379',
					),
				},
			}),
		}),
		PrismaModule,
		CloudinaryModule,
		ResendModule,
		CacheModule,
		AuthModule,
		AdsModule,
		CategoriesModule,
		ChatsModule,
		KycModule,
		ReportsModule,
		ReviewsModule,
		UsersModule,
		WishlistModule,
	],
	controllers: [AppController],
	providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
