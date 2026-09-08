import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

const MEDIA_QUEUE = 'media';

interface DeleteMediaJob {
	publicIds: string[];
}

@Injectable()
@Processor(MEDIA_QUEUE)
export class MediaProcessor extends WorkerHost {
	constructor(private readonly cloudinaryService: CloudinaryService) {
		super();
	}

	async process(job: Job<DeleteMediaJob>): Promise<void> {
		const { publicIds } = job.data;
		if (publicIds.length === 0) {
			return;
		}
		await this.cloudinaryService.deleteResources(publicIds);
	}
}
