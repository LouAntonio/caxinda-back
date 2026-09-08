import { BullModule } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { setSendMail } from '../libs/mail';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';

@Module({
	imports: [BullModule.registerQueue({ name: 'email' })],
	providers: [EmailService, EmailProcessor],
	exports: [EmailService],
})
export class EmailModule implements OnModuleInit {
	constructor(private readonly emailService: EmailService) {}

	onModuleInit(): void {
		setSendMail(async (message) => {
			await this.emailService.enqueue(message);
		});
	}
}
