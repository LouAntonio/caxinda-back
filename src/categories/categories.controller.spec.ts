import { Test } from '@nestjs/testing';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/roles.decorator';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

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

describe('CategoriesController', () => {
	let controller: CategoriesController;
	let service: {
		list: jest.Mock;
		getBySlug: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		remove: jest.Mock;
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		service = {
			list: jest.fn().mockResolvedValue([]),
			getBySlug: jest.fn().mockResolvedValue({}),
			create: jest.fn().mockResolvedValue({}),
			update: jest.fn().mockResolvedValue({}),
			remove: jest.fn().mockResolvedValue(undefined),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [CategoriesController],
			providers: [
				{ provide: CategoriesService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(CategoriesController);
	});

	it('list delega ao service', async () => {
		await controller.list(undefined);

		expect(service.list).toHaveBeenCalledWith(undefined);
	});

	it('list repassa o tipo quando informado', async () => {
		await controller.list('BUSINESS');

		expect(service.list).toHaveBeenCalledWith('BUSINESS');
	});

	it('getBySlug delega com o slug', async () => {
		await controller.getBySlug('eletronica');

		expect(service.getBySlug).toHaveBeenCalledWith('eletronica');
	});

	it('create repassa o dto', async () => {
		const dto = { name: 'Eletrónica', slug: 'eletronica' };

		await controller.create(dto);

		expect(service.create).toHaveBeenCalledWith(dto);
	});

	it('update repassa id e dto', async () => {
		const dto = { name: 'Eletro' };

		await controller.update('cat-1', dto);

		expect(service.update).toHaveBeenCalledWith('cat-1', dto);
	});

	it('remove repassa o id e não retorna corpo', async () => {
		const result = await controller.remove('cat-1');

		expect(service.remove).toHaveBeenCalledWith('cat-1');
		expect(result).toBeUndefined();
	});

	describe('metadata de permissões por rota', () => {
		it('list e getBySlug são públicas', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					CategoriesController.prototype.list,
				),
			).toBeUndefined();
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					CategoriesController.prototype.getBySlug,
				),
			).toBeUndefined();
		});

		it('create exige category:create', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					CategoriesController.prototype.create,
				),
			).toEqual({ category: ['create'] });
		});

		it('update exige category:edit', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					CategoriesController.prototype.update,
				),
			).toEqual({ category: ['edit'] });
		});

		it('remove exige category:delete', () => {
			expect(
				Reflect.getMetadata(
					REQUIRED_PERMISSIONS_KEY,
					CategoriesController.prototype.remove,
				),
			).toEqual({ category: ['delete'] });
		});
	});
});
