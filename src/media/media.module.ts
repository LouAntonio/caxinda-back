import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';

@Module({
	imports: [BullModule.registerQueue({ name: 'media' })],
	providers: [MediaService, MediaProcessor],
	exports: [MediaService],
})
export class MediaModule {}
