import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ResendService } from '../common/resend/resend.service';
import { MailMessage } from '../libs/mail';

const EMAIL_QUEUE = 'email';

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
	private readonly logger = new Logger(EmailProcessor.name);

	constructor(private readonly resendService: ResendService) {
		super();
	}

	async process(job: Job<MailMessage>): Promise<void> {
		try {
			await this.resendService.sendEmail(job.data);
			this.logger.log(
				`Email enviado para ${Array.isArray(job.data.to) ? job.data.to.join(', ') : job.data.to} (job ${job.id})`,
			);
		} catch (error) {
			this.logger.error(
				`Falha ao enviar email para ${Array.isArray(job.data.to) ? job.data.to.join(', ') : job.data.to} (job ${job.id}): ${error instanceof Error ? error.message : String(error)}`,
				error instanceof Error ? error.stack : undefined,
			);
			throw error;
		}
	}
}
