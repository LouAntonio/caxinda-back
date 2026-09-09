import { Injectable } from '@nestjs/common';

export interface AppStatus {
	status: string;
	uptime: number;
	timestamp: string;
}

@Injectable()
export class AppService {
	getStatus(): AppStatus {
		return {
			status: 'API online',
			uptime: process.uptime(),
			timestamp: new Date().toISOString(),
		};
	}
}
