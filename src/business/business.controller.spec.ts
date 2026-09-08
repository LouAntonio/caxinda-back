import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/roles.decorator';
import { auth } from '../libs/auth';
import { BusinessesController } from './business.controller';
import { BusinessesService } from './business.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: {
			getSession: jest.fn(),
			userHasPermission: jest.fn(),
		},
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

const mockedAuth = auth as unknown as {
	api: { getSession: jest.Mock };
};

describe('BusinessesController', () => {
	let controller: BusinessesController;
	let service: {
		listPublic: jest.Mock;
		getBySlug: jest.Mock;
		getById: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		setStatus: jest.Mock;
		moderate: jest.Mock;
		remove: jest.Mock;
	};

	const sessionUser = {
		id: 'u1',
		email: 'user@test.com',
		name: 'User',
		role: 'PROMOTER',
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		service = {
			listPublic: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			getBySlug: jest.fn().mockResolvedValue({}),
			getById: jest.fn().mockResolvedValue({}),
			create: jest.fn().mockResolvedValue({}),
			update: jest.fn().mockResolvedValue({}),
			setStatus: jest.fn().mockResolvedValue({}),
			moderate: jest.fn().mockResolvedValue({}),
			remove: jest.fn().mockResolvedValue(undefined),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [BusinessesController],
			providers: [
				{ provide: BusinessesService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(BusinessesController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('list usa viewer null quando não há sessão', async () => {
		const req = mockRequest(null);

		await controller.list(req, {});

		expect(service.listPublic).toHaveBeenCalledWith({}, undefined);
	});

	it('list repassa o viewer autenticado', async () => {
		const req = mockRequest();

		await controller.list(req, {});

		expect(service.listPublic).toHaveBeenCalledWith(
			{},
			{ id: 'u1', role: 'PROMOTER' },
		);
	});

	it('getBySlug repassa slug e viewer', async () => {
		const req = mockRequest();

		await controller.getBySlug(req, 'loja');

		expect(service.getBySlug).toHaveBeenCalledWith('loja', {
			id: 'u1',
			role: 'PROMOTER',
		});
	});

	it('getById repassa id e viewer', async () => {
		const req = mockRequest(null);

		await controller.getById(req, 'biz-1');

		expect(service.getById).toHaveBeenCalledWith('biz-1', undefined);
	});

	it('create resolve a sessão e delega com userId e role', async () => {
		const req = mockRequest();
		const dto = {
			name: 'Loja',
			description: 'd',
			province: 'LUANDA' as const,
			phone: '+244',
			categoryId: 'cat-1',
		};

		await controller.create(req, dto);

		expect(service.create).toHaveBeenCalledWith('u1', 'PROMOTER', dto);
	});

	it('update repassa userId, role, id e dto', async () => {
		const req = mockRequest();
		const dto = { name: 'Novo' };

		await controller.update(req, 'biz-1', dto);

		expect(service.update).toHaveBeenCalledWith(
			'u1',
			'PROMOTER',
			'biz-1',
			dto,
		);
	});

	it('setStatus repassa userId, role, id e dto', async () => {
		const req = mockRequest();
		const dto = { status: 'HIDE' as const };

		await controller.setStatus(req, 'biz-1', dto);

		expect(service.setStatus).toHaveBeenCalledWith(
			'u1',
			'PROMOTER',
			'biz-1',
			dto,
		);
	});

	it('moderate repassa id e dto', async () => {
		const dto = { isVerified: true };

		await controller.moderate('biz-1', dto);

		expect(service.moderate).toHaveBeenCalledWith('biz-1', dto);
	});

	it('remove repassa userId, role e id e não retorna corpo', async () => {
		const req = mockRequest();

		const result = await controller.remove(req, 'biz-1');

		expect(service.remove).toHaveBeenCalledWith('u1', 'PROMOTER', 'biz-1');
		expect(result).toBeUndefined();
	});

	describe('metadata de permissões por rota', () => {
		it('list, getBySlug e getById são públicas', () => {
			const methods: Array<'list' | 'getBySlug' | 'getById'> = [
				'list',
				'getBySlug',
				'getById',
			];
			for (const method of methods) {
				expect(
					Reflect.getMetadata(
						REQUIRED_PERMISSIONS_KEY,
						BusinessesController.prototype[method],
					),
				).toBeUndefined();
			}
		});

		it('create exige business:create', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					BusinessesController.prototype.create,
				),
			).toEqual({ business: ['create'] });
		});

		it('update e setStatus exigem business:edit', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					BusinessesController.prototype.update,
				),
			).toEqual({ business: ['edit'] });
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					BusinessesController.prototype.setStatus,
				),
			).toEqual({ business: ['edit'] });
		});

		it('moderate exige business:moderate', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					BusinessesController.prototype.moderate,
				),
			).toEqual({ business: ['moderate'] });
		});

		it('remove exige business:delete', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					BusinessesController.prototype.remove,
				),
			).toEqual({ business: ['delete'] });
		});
	});
});
