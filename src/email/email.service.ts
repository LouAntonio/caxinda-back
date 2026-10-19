import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ResendService } from '../common/resend/resend.service';
import { MailMessage } from '../libs/mail';

const EMAIL_QUEUE = 'email';

@Injectable()
export class EmailService {
	private readonly logger = new Logger(EmailService.name);

	constructor(
		@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
		private readonly resendService: ResendService,
	) {}

	async enqueue(message: MailMessage): Promise<void> {
		try {
			await this.queue.add(
				'send',
				{
					to: message.to,
					subject: message.subject,
					...(message.text !== undefined
						? { text: message.text }
						: {}),
					...(message.html !== undefined
						? { html: message.html }
						: {}),
				},
				{
					attempts: 3,
					backoff: { type: 'exponential', delay: 2000 },
					removeOnComplete: 1000,
					removeOnFail: 1000,
				},
			);
		} catch (error) {
			// A fila depende do Redis. Se estiver indisponível, enviamos
			// diretamente para não bloquear fluxos de autenticação (reset de
			// senha, verificação de email, magic link).
			this.logger.warn(
				`Fila de email indisponível, a enviar diretamente: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			try {
				await this.resendService.sendEmail({
					to: message.to,
					subject: message.subject,
					html: message.html,
					text: message.text,
				});
			} catch (fallbackError) {
				this.logger.error(
					`Falha ao enviar email para ${
						Array.isArray(message.to)
							? message.to.join(', ')
							: message.to
					}: ${
						fallbackError instanceof Error
							? fallbackError.message
							: String(fallbackError)
					}`,
				);
			}
		}
	}
}
