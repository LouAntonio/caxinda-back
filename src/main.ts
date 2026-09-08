import './common/env';
import { LoggerService, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';

async function bootstrap() {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });

	const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
	app.useLogger(logger);

	app.setGlobalPrefix('api');
	app.enableCors();

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	const swaggerConfig = new DocumentBuilder()
		.setTitle('Caxinda Backend API')
		.setDescription('API Backend da Caxinda')
		.setVersion('0.0.1')
		.addBearerAuth()
		.build();

	const document = SwaggerModule.createDocument(app, swaggerConfig);
	SwaggerModule.setup('api/docs', app, document);

	const port = Number(process.env.PORT) || 3000;
	await app.listen(port);
	logger.log(
		`Application running on: http://localhost:${port}/api`,
		'Bootstrap',
	);
}

void bootstrap();
