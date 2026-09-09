import './common/env';
import { LoggerService, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { auth } from './libs/auth';

type BetterAuthPath = Record<string, Record<string, unknown> | undefined>;

async function bootstrap() {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });

	const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
	app.useLogger(logger);

	app.setGlobalPrefix('api', {
		exclude: [{ path: '/', method: RequestMethod.GET }],
	});
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

	// Os endpoints do better-auth são servidos pelo handler catch-all do
	// AuthController, logo o Swagger não os descobre. O plugin openAPI gera o
	// schema completo; aqui normaliza-se (prefixo + tag) e funde-se no doc.
	const authSchema = await auth.api.generateOpenAPISchema({
		headers: {},
	});
	const authBasePath = process.env.BETTER_AUTH_BASE_PATH ?? '/api/auth';
	const authPaths: Record<string, BetterAuthPath> = {};
	for (const [path, operations] of Object.entries(
		authSchema.paths as Record<string, BetterAuthPath>,
	)) {
		const resolvedPath = path.startsWith(authBasePath)
			? path
			: `${authBasePath}${path}`;
		const normalizedOperations: BetterAuthPath = {};
		for (const [method, operation] of Object.entries(operations ?? {})) {
			if (!operation || typeof operation !== 'object') {
				continue;
			}
			normalizedOperations[method] = { ...operation, tags: ['Auth'] };
		}
		authPaths[resolvedPath] = normalizedOperations;
	}

	const mergedDocument = {
		...document,
		paths: { ...document.paths, ...authPaths },
		components: {
			...(document.components ?? {}),
			securitySchemes: {
				...(document.components?.securitySchemes ?? {}),
				...(authSchema.components?.securitySchemes ?? {}),
			},
			schemas: {
				...(document.components?.schemas ?? {}),
				...(authSchema.components?.schemas ?? {}),
			},
		},
	};

	SwaggerModule.setup('api/docs', app, mergedDocument as OpenAPIObject);

	const port = Number(process.env.PORT) || 3000;
	await app.listen(port);
	logger.log(
		`Application running on: http://localhost:${port}/api`,
		'Bootstrap',
	);
}

void bootstrap();
