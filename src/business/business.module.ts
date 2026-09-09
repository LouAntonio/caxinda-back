import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentsModule } from '../payments/payments.module';
import { BusinessesController } from './business.controller';
import { BusinessesService } from './business.service';

@Module({
	imports: [PaymentsModule, AnalyticsModule],
	controllers: [BusinessesController],
	providers: [BusinessesService],
	exports: [BusinessesService],
})
export class BusinessModule {}
