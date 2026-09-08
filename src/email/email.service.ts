import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MailMessage } from '../libs/mail';

const EMAIL_QUEUE = 'email';

@Injectable()
export class EmailService {
	constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

	async enqueue(message: MailMessage): Promise<void> {
		await this.queue.add(
			'send',
			{
				to: message.to,
				subject: message.subject,
				...(message.text !== undefined ? { text: message.text } : {}),
				...(message.html !== undefined ? { html: message.html } : {}),
			},
			{
				attempts: 3,
				backoff: { type: 'exponential', delay: 2000 },
				removeOnComplete: 1000,
				removeOnFail: 1000,
			},
		);
	}
}
