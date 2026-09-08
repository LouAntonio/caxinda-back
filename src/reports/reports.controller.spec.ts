import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { auth } from '../libs/auth';
import {
	ReportReason,
	ReportStatus,
	ReportTarget,
} from '../generated/prisma/client';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

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

describe('ReportsController', () => {
	let controller: ReportsController;
	let service: {
		create: jest.Mock;
		list: jest.Mock;
		listMine: jest.Mock;
		updateStatus: jest.Mock;
		count: jest.Mock;
	};

	const sessionUser = {
		id: 'u1',
		email: 'user@test.com',
		name: 'User',
		role: 'USER',
	};
	const adminUser = { ...sessionUser, role: 'ADMIN' };

	beforeEach(async () => {
		jest.clearAllMocks();
		service = {
			create: jest.fn().mockResolvedValue({}),
			list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			listMine: jest.fn().mockResolvedValue({ items: [], total: 0 }),
			updateStatus: jest.fn().mockResolvedValue({}),
			count: jest.fn().mockResolvedValue({ count: 0 }),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [ReportsController],
			providers: [
				{ provide: ReportsService, useValue: service },
				PermissionsGuard,
			],
		}).compile();

		controller = moduleRef.get(ReportsController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('create delega com userId e dto', async () => {
		const req = mockRequest();
		const dto = {
			targetType: ReportTarget.AD,
			targetId: 'ad-1',
			reason: ReportReason.FRAUD,
		};
		await controller.create(req, dto);
		expect(service.create).toHaveBeenCalledWith('u1', dto);
	});

	it('create rejeita sem sessão', async () => {
		const req = mockRequest(null);
		await expect(controller.create(req, {} as never)).rejects.toThrow();
	});

	it('count chama service', async () => {
		await controller.count({
			targetType: ReportTarget.AD,
			targetId: 'ad-1',
		});
		expect(service.count).toHaveBeenCalledWith({
			targetType: ReportTarget.AD,
			targetId: 'ad-1',
		});
	});

	it('list delega com user e query', async () => {
		const req = mockRequest(adminUser);
		await controller.list(req, { page: 1, limit: 20 });
		expect(service.list).toHaveBeenCalledWith(
			{ id: 'u1', role: 'ADMIN' },
			{ page: 1, limit: 20 },
		);
	});

	it('listMine delega com userId e query', async () => {
		const req = mockRequest(sessionUser);
		await controller.listMine(req, { page: 1, limit: 20 });
		expect(service.listMine).toHaveBeenCalledWith('u1', {
			page: 1,
			limit: 20,
		});
	});

	it('listMine rejeita sem sessão', async () => {
		const req = mockRequest(null);
		await expect(controller.listMine(req, {})).rejects.toThrow();
	});

	it('updateStatus delega com user, id e dto', async () => {
		const req = mockRequest(adminUser);
		await controller.updateStatus(req, 'rep-1', {
			status: ReportStatus.RESOLVED,
		});
		expect(service.updateStatus).toHaveBeenCalledWith(
			{ id: 'u1', role: 'ADMIN' },
			'rep-1',
			{ status: ReportStatus.RESOLVED },
		);
	});
});
