import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const MEDIA_QUEUE = 'media';

@Injectable()
export class MediaService {
	constructor(@InjectQueue(MEDIA_QUEUE) private readonly queue: Queue) {}

	/**
	 * Agenda a remoção de recursos do Cloudinary (imagens principais, galerias
	 * e selfies KYC que deixaram de ser referenciadas).
	 */
	async enqueueDeletion(publicIds: string[]): Promise<void> {
		if (!publicIds || publicIds.length === 0) {
			return;
		}
		await this.queue.add(
			'delete',
			{ publicIds },
			{
				attempts: 3,
				backoff: { type: 'exponential', delay: 2000 },
				removeOnComplete: 1000,
				removeOnFail: 1000,
			},
		);
	}
}
