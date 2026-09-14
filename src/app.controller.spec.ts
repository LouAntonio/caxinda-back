import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
	let appController: AppController;

	beforeEach(async () => {
		const app: TestingModule = await Test.createTestingModule({
			controllers: [AppController],
			providers: [AppService],
		}).compile();

		appController = app.get<AppController>(AppController);
	});

	describe('root', () => {
		it('should return API status with uptime and timestamp', () => {
			const result = appController.getStatus();

			expect(result.status).toBe('API online');
			expect(typeof result.uptime).toBe('string');
			expect(result.uptime).toMatch(
				/^\d+ (dia|dias|hora|horas|minuto|minutos|segundo|segundos)/,
			);
			expect(new Date(result.timestamp).getTime()).not.toBeNaN();
		});
	});
});
