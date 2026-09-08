import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { MediaModule } from '../media/media.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
	imports: [EmailModule, MediaModule],
	controllers: [KycController],
	providers: [KycService],
	exports: [KycService],
})
export class KycModule {}
