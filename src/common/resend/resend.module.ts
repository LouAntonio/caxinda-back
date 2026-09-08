import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { RESEND } from './resend.constants';
import { ResendService } from './resend.service';

export { RESEND };

@Global()
@Module({
	providers: [
		{
			provide: RESEND,
			inject: [ConfigService],
			useFactory: (configService: ConfigService): Resend =>
				new Resend(configService.getOrThrow<string>('RESEND_API_KEY')),
		},
		ResendService,
	],
	exports: [ResendService, RESEND],
})
export class ResendModule {}
