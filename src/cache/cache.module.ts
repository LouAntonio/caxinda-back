import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

export const REDIS = 'REDIS';

@Global()
@Module({
	providers: [
		{
			provide: REDIS,
			inject: [ConfigService],
			useFactory: (configService: ConfigService): Redis => {
				const url = configService.get<string>(
					'REDIS_URL',
					'redis://localhost:6379',
				);
				return new Redis(url, { lazyConnect: true });
			},
		},
		CacheService,
	],
	exports: [CacheService, REDIS],
})
export class CacheModule {}
