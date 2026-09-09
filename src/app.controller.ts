import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { AppStatus } from './app.service';

@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Get()
	getStatus(): AppStatus {
		return this.appService.getStatus();
	}
}
