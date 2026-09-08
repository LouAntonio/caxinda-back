import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { auth } from '../libs/auth';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

jest.mock('../libs/auth', () => ({
	auth: {
		api: { getSession: jest.fn() },
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: unknown) => headers,
}));

const mockedAuth = auth as unknown as {
	api: { getSession: jest.Mock };
};

describe('PaymentsController', () => {
	let controller: PaymentsController;
	let service: {
		create: jest.Mock;
		submitProof: jest.Mock;
		cancel: jest.Mock;
		review: jest.Mock;
		list: jest.Mock;
		getById: jest.Mock;
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
			create: jest.fn().mockResolvedValue({}),
			submitProof: jest.fn().mockResolvedValue({}),
			cancel: jest.fn().mockResolvedValue({}),
			review: jest.fn().mockResolvedValue({}),
			list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			getById: jest.fn().mockResolvedValue({}),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [PaymentsController],
			providers: [
				{ provide: PaymentsService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(PaymentsController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('create rejeita quando sem sessão', async () => {
		const req = mockRequest(null);

		await expect(
			controller.create(req, {
				businessId: 'biz-1',
				planId: 'plan-1',
			}),
		).rejects.toThrow();
	});

	it('create delega com userId e role', async () => {
		const req = mockRequest({ ...sessionUser, role: 'PROMOTER' });

		await controller.create(req, {
			businessId: 'biz-1',
			planId: 'plan-1',
		});

		expect(service.create).toHaveBeenCalledWith('u1', 'PROMOTER', {
			businessId: 'biz-1',
			planId: 'plan-1',
		});
	});

	it('submitProof delega com userId, role, id e dto', async () => {
		const req = mockRequest({ ...sessionUser, role: 'PROMOTER' });

		await controller.submitProof(req, 'pay-1', {
			proofUrl: 'https://cdn.test/p.jpg',
			proofId: 'c-1',
		});

		expect(service.submitProof).toHaveBeenCalledWith(
			'u1',
			'PROMOTER',
			'pay-1',
			{
				proofUrl: 'https://cdn.test/p.jpg',
				proofId: 'c-1',
			},
		);
	});

	it('cancel delega com userId, role e id', async () => {
		const req = mockRequest();

		await controller.cancel(req, 'pay-1');

		expect(service.cancel).toHaveBeenCalledWith('u1', 'USER', 'pay-1');
	});

	it('review delega com user e dto', async () => {
		const req = mockRequest({ ...sessionUser, role: 'ADMIN' });

		await controller.review(req, 'pay-1', {
			decision: 'APPROVED',
		});

		expect(service.review).toHaveBeenCalledWith(
			{ id: 'u1', role: 'ADMIN' },
			'pay-1',
			{ decision: 'APPROVED' },
		);
	});

	it('list repassa query', async () => {
		await controller.list({ page: 1, limit: 20 });

		expect(service.list).toHaveBeenCalledWith({ page: 1, limit: 20 });
	});

	it('getById delega com userId, role e id', async () => {
		const req = mockRequest();

		await controller.getById(req, 'pay-1');

		expect(service.getById).toHaveBeenCalledWith('u1', 'USER', 'pay-1');
	});
});
