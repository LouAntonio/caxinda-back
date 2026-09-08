import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/roles.decorator';
import { auth } from '../libs/auth';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: { getSession: jest.fn() },
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

jest.mock('@nestjs/bullmq', () => ({
	InjectQueue: () => () => undefined,
	Processor: () => () => undefined,
	WorkerHost: class WorkerHost {},
}));

const mockedAuth = auth as unknown as {
	api: { getSession: jest.Mock };
};

describe('AdsController', () => {
	let controller: AdsController;
	let service: {
		list: jest.Mock;
		getById: jest.Mock;
		getBySlug: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		setVisibility: jest.Mock;
		moderate: jest.Mock;
		remove: jest.Mock;
		feature: jest.Mock;
		unfeature: jest.Mock;
	};

	const sessionUser = {
		id: 'u1',
		email: 'user@test.com',
		name: 'User',
		role: 'USER',
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		service = {
			list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			getById: jest.fn().mockResolvedValue({}),
			getBySlug: jest.fn().mockResolvedValue({}),
			create: jest.fn().mockResolvedValue({}),
			update: jest.fn().mockResolvedValue({}),
			setVisibility: jest.fn().mockResolvedValue({}),
			moderate: jest.fn().mockResolvedValue({}),
			remove: jest.fn().mockResolvedValue(undefined),
			feature: jest.fn().mockResolvedValue({}),
			unfeature: jest.fn().mockResolvedValue({}),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [AdsController],
			providers: [
				{ provide: AdsService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(AdsController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('list usa viewer null quando não há sessão', async () => {
		const req = mockRequest(null);
		const query = { page: 1 };

		await controller.list(req, query);

		expect(service.list).toHaveBeenCalledWith(query, null);
	});

	it('list repassa o viewer autenticado', async () => {
		const req = mockRequest({ ...sessionUser, role: 'ADMIN' });

		await controller.list(req, {});

		expect(service.list).toHaveBeenCalledWith(
			{},
			{ id: 'u1', role: 'ADMIN' },
		);
	});

	it('getById repassa id, viewer e query vazia', async () => {
		const req = mockRequest();

		await controller.getById(req, 'ad-1', {});

		expect(service.getById).toHaveBeenCalledWith(
			'ad-1',
			{ id: 'u1', role: 'USER' },
			undefined,
		);
	});

	it('getById repassa proximidade quando lat/lng são informados', async () => {
		const req = mockRequest();
		const query = { lat: -8.8, lng: 13.2 };

		await controller.getById(req, 'ad-1', query);

		expect(service.getById).toHaveBeenCalledWith(
			'ad-1',
			{ id: 'u1', role: 'USER' },
			{ lat: -8.8, lng: 13.2 },
		);
	});

	it('lança BadRequest quando getAd recebe apenas lat ou lng', async () => {
		const req = mockRequest();

		await expect(
			controller.getById(req, 'ad-1', { lat: -8.8 }),
		).rejects.toBeInstanceOf(BadRequestException);

		await expect(
			controller.getById(req, 'ad-1', { lng: 13.2 }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('getBySlug repassa slug, viewer e proximidade', async () => {
		const req = mockRequest();

		await controller.getBySlug(req, 'iphone', { lat: -8.8, lng: 13.2 });

		expect(service.getBySlug).toHaveBeenCalledWith(
			'iphone',
			{ id: 'u1', role: 'USER' },
			{ lat: -8.8, lng: 13.2 },
		);
	});

	it('create resolve a sessão e delega com userId e role', async () => {
		const req = mockRequest();
		const dto = {
			title: 'iPhone',
			description: 'desc',
			categoryIds: ['cat-1'],
		};

		await controller.create(req, dto);

		expect(service.create).toHaveBeenCalledWith('u1', 'USER', dto);
	});

	it('update repassa userId, role e dto', async () => {
		const req = mockRequest({ ...sessionUser, role: 'PROMOTER' });
		const dto = { title: 'Novo' };

		await controller.update(req, 'ad-1', dto);

		expect(service.update).toHaveBeenCalledWith(
			'u1',
			'PROMOTER',
			'ad-1',
			dto,
		);
	});

	it('setVisibility repassa userId, role e dto', async () => {
		const req = mockRequest();
		const dto = { visibility: 'HIDDEN' as const };

		await controller.setVisibility(req, 'ad-1', dto);

		expect(service.setVisibility).toHaveBeenCalledWith(
			'u1',
			'USER',
			'ad-1',
			dto,
		);
	});

	it('moderate delega sem resolver sessão (guard já autenticou)', async () => {
		const dto = { verified: true };

		await controller.moderate('ad-1', dto);

		expect(service.moderate).toHaveBeenCalledWith('ad-1', dto);
		expect(mockedAuth.api.getSession).not.toHaveBeenCalled();
	});

	it('remove resolve a sessão e delega', async () => {
		const req = mockRequest();
		const result = await controller.remove(req, 'ad-1');

		expect(service.remove).toHaveBeenCalledWith('u1', 'USER', 'ad-1');
		expect(result).toBeUndefined();
	});

	it('feature resolve a sessão e delega com userId', async () => {
		const req = mockRequest();

		await controller.feature(req, 'ad-1');

		expect(service.feature).toHaveBeenCalledWith('u1', 'ad-1');
	});

	it('unfeature delega com userId e role', async () => {
		const req = mockRequest({ ...sessionUser, role: 'ADMIN' });

		await controller.unfeature(req, 'ad-1');

		expect(service.unfeature).toHaveBeenCalledWith('u1', 'ADMIN', 'ad-1');
	});

	describe('metadata de permissões por rota', () => {
		it('list e getById são públicas', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.list,
				),
			).toBeUndefined();
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.getById,
				),
			).toBeUndefined();
		});

		it('create exige ad:create', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.create,
				),
			).toEqual({ ad: ['create'] });
		});

		it('update exige ad:edit', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.update,
				),
			).toEqual({ ad: ['edit'] });
		});

		it('setVisibility exige ad:edit', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.setVisibility,
				),
			).toEqual({ ad: ['edit'] });
		});

		it('feature exige ad:edit', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.feature,
				),
			).toEqual({ ad: ['edit'] });
		});

		it('unfeature exige ad:edit', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.unfeature,
				),
			).toEqual({ ad: ['edit'] });
		});

		it('moderate exige ad:moderate', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.moderate,
				),
			).toEqual({ ad: ['moderate'] });
		});

		it('remove exige ad:delete', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					AdsController.prototype.remove,
				),
			).toEqual({ ad: ['delete'] });
		});
	});
});
