import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BusinessesController } from './business.controller';
import { BusinessesService } from './business.service';

@Module({
	imports: [PaymentsModule],
	controllers: [BusinessesController],
	providers: [BusinessesService],
	exports: [BusinessesService],
})
export class BusinessModule {}
