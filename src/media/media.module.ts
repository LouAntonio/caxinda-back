import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';

@Module({
	imports: [BullModule.registerQueue({ name: 'media' })],
	controllers: [MediaController],
	providers: [MediaService, MediaProcessor],
	exports: [MediaService],
})
export class MediaModule {}
