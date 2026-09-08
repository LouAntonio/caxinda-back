import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { RESEND } from './resend.constants';

export interface SendEmailOptions {
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	from?: string;
}

@Injectable()
export class ResendService {
	private readonly defaultFrom: string;

	constructor(
		@Inject(RESEND) private readonly resend: Resend,
		configService: ConfigService,
	) {
		this.defaultFrom =
			configService.getOrThrow<string>('RESEND_FROM_EMAIL');
	}

	async sendEmail(options: SendEmailOptions): Promise<void> {
		const payload = {
			from: options.from ?? this.defaultFrom,
			to: options.to,
			subject: options.subject,
			...(options.html
				? { html: options.html }
				: { text: options.text ?? '' }),
		};
		const { error } = await this.resend.emails.send(payload);
		if (error) {
			throw new Error(`Failed to send email: ${error.message}`);
		}
	}
}
