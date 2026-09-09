import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsService } from './analytics.service';

const ANALYTICS_QUEUE = 'analytics';

@Injectable()
@Processor(ANALYTICS_QUEUE)
export class AnalyticsProcessor extends WorkerHost {
	constructor(private readonly analyticsService: AnalyticsService) {
		super();
	}

	async process(job: Job): Promise<void> {
		switch (job.name) {
			case 'flush':
				await this.analyticsService.flush();
				break;
			case 'prune':
				await this.analyticsService.prune();
				break;
			default:
				break;
		}
	}
}
