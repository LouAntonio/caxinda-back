import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ResendService } from '../common/resend/resend.service';
import { MailMessage } from '../libs/mail';

const EMAIL_QUEUE = 'email';

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
	constructor(private readonly resendService: ResendService) {
		super();
	}

	async process(job: Job<MailMessage>): Promise<void> {
		await this.resendService.sendEmail(job.data);
	}
}
