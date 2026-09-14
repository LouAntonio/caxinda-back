import { Injectable } from '@nestjs/common';
import { formatUptime, uptimeSeconds } from './libs/time';

export interface AppStatus {
	status: string;
	uptime: string;
	timestamp: string;
}

@Injectable()
export class AppService {
	getStatus(): AppStatus {
		return {
			status: 'API online',
			uptime: formatUptime(uptimeSeconds()),
			timestamp: new Date().toISOString(),
		};
	}
}
