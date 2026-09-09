import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

export interface RedisThrottlerStorageRecord {
	totalHits: number;
	timeToExpire: number;
	isBlocked: boolean;
	timeToBlockExpire: number;
}

/**
 * Storage de rate-limit baseado em Redis (contador INCR + TTL), com
 * semântica equivalente ao ThrottlerStorageService em memória.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
	constructor(private readonly redis: Redis) {}

	async increment(
		key: string,
		ttl: number,
		limit: number,
		blockDuration: number,
		throttlerName: string,
	): Promise<RedisThrottlerStorageRecord> {
		const storageKey = `throttle:${key}:${throttlerName}`;
		const blockKey = `${storageKey}:blocked`;

		const isBlocked = await this.redis.exists(blockKey);
		if (isBlocked) {
			const blockedTtl = Math.ceil(
				((await this.redis.pttl(blockKey)) || 0) / 1000,
			);
			return {
				totalHits: Number(await this.redis.get(storageKey)) || limit,
				timeToExpire: Math.ceil(
					((await this.redis.pttl(storageKey)) || 0) / 1000,
				),
				isBlocked: true,
				timeToBlockExpire: blockedTtl,
			};
		}

		const totalHits = await this.redis.incr(storageKey);
		if (totalHits === 1) {
			await this.redis.pexpire(storageKey, ttl);
		}

		if (totalHits > limit) {
			const blockMs = blockDuration > 0 ? blockDuration : ttl;
			await this.redis.set(blockKey, '1', 'PX', blockMs);
			await this.redis.pexpire(storageKey, ttl);
			return {
				totalHits,
				timeToExpire: Math.ceil(ttl / 1000),
				isBlocked: true,
				timeToBlockExpire: Math.ceil(blockMs / 1000),
			};
		}

		const timeToExpire = Math.ceil(
			((await this.redis.pttl(storageKey)) || 0) / 1000,
		);
		return {
			totalHits,
			timeToExpire,
			isBlocked: false,
			timeToBlockExpire: 0,
		};
	}
}
