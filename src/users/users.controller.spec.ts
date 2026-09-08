import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/roles.decorator';
import { auth } from '../libs/auth';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: {
			getSession: jest.fn(),
			userHasPermission: jest.fn(),
		},
	},
}));

jest.mock('../email/email.service', () => ({
	EmailService: jest.fn(),
}));

jest.mock('../auth/magic-link.service', () => ({
	MagicLinkService: jest.fn(),
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

const mockedAuth = auth as unknown as {
	api: {
		getSession: jest.Mock;
		userHasPermission: jest.Mock;
	};
};

describe('UsersController', () => {
	let controller: UsersController;
	let service: {
		getMe: jest.Mock;
		updateMe: jest.Mock;
		list: jest.Mock;
		create: jest.Mock;
		ban: jest.Mock;
		unban: jest.Mock;
		setRole: jest.Mock;
	};

	const sessionUser = {
		id: 'u1',
		email: 'user@test.com',
		name: 'User',
		role: 'ADMIN',
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		service = {
			getMe: jest.fn().mockResolvedValue({ id: 'u1' }),
			updateMe: jest.fn().mockResolvedValue({ id: 'u1' }),
			list: jest.fn().mockResolvedValue({ users: [], total: 0 }),
			create: jest.fn().mockResolvedValue({ user: {} }),
			ban: jest.fn().mockResolvedValue({ user: {} }),
			unban: jest.fn().mockResolvedValue({ user: {} }),
			setRole: jest.fn().mockResolvedValue({ user: {} }),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [UsersController],
			providers: [
				{ provide: UsersService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(UsersController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue({ user });
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('getMe resolve a sessão e delega ao service', async () => {
		const req = mockRequest();
		const result = await controller.getMe(req);

		expect(service.getMe).toHaveBeenCalledWith('u1');
		expect(result).toEqual({ id: 'u1' });
	});

	it('updateMe repassa o dto de perfil', async () => {
		const req = mockRequest();
		const dto = { city: 'São Paulo', phone: '+55 11 99999-9999' };

		await controller.updateMe(req, dto);

		expect(service.updateMe).toHaveBeenCalledWith('u1', dto);
	});

	it('list repassa headers e query', async () => {
		const req = mockRequest();
		const query = { searchValue: 'joão', limit: 10 };

		await controller.list(req, query);

		expect(service.list).toHaveBeenCalledWith(req.headers, query);
	});

	it('create repassa headers e dto', async () => {
		const req = mockRequest();
		const dto = {
			email: 'novo@test.com',
			name: 'Novo',
			role: 'PROMOTER',
		};

		await controller.create(req, dto);

		expect(service.create).toHaveBeenCalledWith(req.headers, dto);
	});

	it('ban resolve a sessão e delega com user, headers, id e dto', async () => {
		const req = mockRequest();
		const dto = { reason: 'Fraude', banExpiresIn: 3600 };

		await controller.ban(req, 'target-id', dto);

		expect(service.ban).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'u1', role: 'ADMIN' }),
			req.headers,
			'target-id',
			dto,
		);
	});

	it('unban resolve a sessão e delega', async () => {
		const req = mockRequest();

		await controller.unban(req, 'target-id');

		expect(service.unban).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'u1' }),
			req.headers,
			'target-id',
		);
	});

	it('setRole repassa a nova role', async () => {
		const req = mockRequest();
		const dto = { role: 'MODERATOR' };

		await controller.setRole(req, 'target-id', dto);

		expect(service.setRole).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'u1' }),
			req.headers,
			'target-id',
			dto,
		);
	});

	describe('metadata de permissões por rota', () => {
		it('list exige user:list', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.list,
				),
			).toEqual({ user: ['list'] });
		});

		it('create exige user:create', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.create,
				),
			).toEqual({ user: ['create'] });
		});

		it('ban exige user:ban', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.ban,
				),
			).toEqual({ user: ['ban'] });
		});

		it('unban exige user:ban', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.unban,
				),
			).toEqual({ user: ['ban'] });
		});

		it('setRole exige user:set-role', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.setRole,
				),
			).toEqual({ user: ['set-role'] });
		});

		it('me não exige permissão específica (apenas autenticação)', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.getMe,
				),
			).toBeUndefined();
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					UsersController.prototype.updateMe,
				),
			).toBeUndefined();
		});
	});
});
