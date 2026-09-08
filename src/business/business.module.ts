import { Module } from '@nestjs/common';
import { BusinessesController } from './business.controller';
import { BusinessesService } from './business.service';

@Module({
	controllers: [BusinessesController],
	providers: [BusinessesService],
	exports: [BusinessesService],
})
export class BusinessModule {}
