import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import Redis from 'ioredis';
import { AdsModule } from './ads/ads.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { BusinessModule } from './business/business.module';
import { CacheModule } from './cache/cache.module';
import { CategoriesModule } from './categories/categories.module';
import { ChatsModule } from './chat/chat.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { winstonOptions } from './common/logging/winston.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisThrottlerStorage } from './common/rate-limit/redis-throttler.storage';
import { ResendModule } from './common/resend/resend.module';
import { KycModule } from './kyc/kyc.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { UsersModule } from './users/users.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const redisUrl = configService.get<string>('REDIS_URL');
				return {
					throttlers: [
						{
							name: 'default',
							ttl: Number(
								configService.get<string>(
									'THROTTLE_TTL',
									'60000',
								),
							),
							limit: Number(
								configService.get<string>(
									'THROTTLE_LIMIT',
									'100',
								),
							),
						},
					],
					...(redisUrl
						? {
								storage: new RedisThrottlerStorage(
									new Redis(redisUrl),
								),
							}
						: {}),
				};
			},
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
		AnalyticsModule,
		BusinessModule,
		CategoriesModule,
		ChatsModule,
		KycModule,
		PaymentsModule,
		ReportsModule,
		ReviewsModule,
		SearchModule,
		UsersModule,
		WishlistModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		{ provide: APP_GUARD, useClass: ThrottlerGuard },
		{ provide: APP_GUARD, useClass: PermissionsGuard },
	],
})
export class AppModule {}
