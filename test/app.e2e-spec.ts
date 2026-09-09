import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
	let app: INestApplication<App>;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	it('/ (GET) retorna o estado da API', async () => {
		const response = await request(app.getHttpServer())
			.get('/')
			.expect(200);

		expect(response.body.status).toBe('API online');
		expect(typeof response.body.uptime).toBe('number');
		expect(typeof response.body.timestamp).toBe('string');
	});

	afterEach(async () => {
		await app.close();
	});
});
