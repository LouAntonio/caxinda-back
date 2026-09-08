import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const DEFAULT_TTL_MS = 60_000;

/**
 * Cache simples por chave/valor em Redis. Usada pelos serviços de marketplace
 * para reduzir carga no PostgreSQL (anúncios públicos, lista de categorias).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
	constructor(private readonly redis: Redis) {}

	async get<T>(key: string): Promise<T | null> {
		const raw = await this.redis.get(this.prefixed(key));
		if (raw === null) {
			return null;
		}
		return JSON.parse(raw) as T;
	}

	async set<T>(
		key: string,
		value: T,
		ttlMs: number = DEFAULT_TTL_MS,
	): Promise<void> {
		await this.redis.set(
			this.prefixed(key),
			JSON.stringify(value),
			'PX',
			ttlMs,
		);
	}

	async del(key: string): Promise<void> {
		await this.redis.del(this.prefixed(key));
	}

	async delMany(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}
		await this.redis.del(...keys.map((key) => this.prefixed(key)));
	}

	async wrap<T>(
		key: string,
		fn: () => Promise<T>,
		ttlMs: number = DEFAULT_TTL_MS,
	): Promise<T> {
		const cached = await this.get<T>(key);
		if (cached !== null) {
			return cached;
		}
		const value = await fn();
		await this.set(key, value, ttlMs);
		return value;
	}

	private prefixed(key: string): string {
		return `caxinda:${key}`;
	}

	async onModuleDestroy(): Promise<void> {
		await this.redis.quit();
	}
}
