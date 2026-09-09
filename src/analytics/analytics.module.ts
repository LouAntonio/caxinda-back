import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsProcessor } from './analytics.processor';
import { AnalyticsService } from './analytics.service';

const ANALYTICS_QUEUE = 'analytics';
const FLUSH_EVERY_MS = 10 * 60 * 1000;

@Module({
	imports: [BullModule.registerQueue({ name: ANALYTICS_QUEUE })],
	controllers: [AnalyticsController],
	providers: [AnalyticsService, AnalyticsProcessor],
	exports: [AnalyticsService],
})
export class AnalyticsModule implements OnApplicationBootstrap {
	constructor(@InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue) {}

	async onApplicationBootstrap(): Promise<void> {
		await this.queue.upsertJobScheduler(
			'analytics-flush',
			{ every: FLUSH_EVERY_MS },
			{ name: 'flush' },
		);
		await this.queue.upsertJobScheduler(
			'analytics-prune',
			{ pattern: '0 3 * * *' },
			{ name: 'prune' },
		);
	}
}
