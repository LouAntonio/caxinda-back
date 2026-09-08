import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';

@Module({
	imports: [MediaModule],
	controllers: [AdsController],
	providers: [AdsService],
	exports: [AdsService],
})
export class AdsModule {}
