import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

@Global()
@Module({
	providers: [
		{
			provide: Redis,
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
	exports: [CacheService, Redis],
})
export class CacheModule {}
