import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/roles.decorator';
import { auth } from '../libs/auth';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

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
	api: {
		getSession: jest.Mock;
		userHasPermission: jest.Mock;
	};
};

describe('AnalyticsController', () => {
	let controller: AnalyticsController;
	let service: {
		trackBusinessClick: jest.Mock;
		getAdStats: jest.Mock;
		getBusinessStats: jest.Mock;
		getPlatformStats: jest.Mock;
		getPlatformOverview: jest.Mock;
		getPlatformCsv: jest.Mock;
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
			trackBusinessClick: jest.fn().mockResolvedValue(undefined),
			getAdStats: jest.fn().mockResolvedValue({}),
			getBusinessStats: jest.fn().mockResolvedValue({}),
			getPlatformStats: jest.fn().mockResolvedValue({}),
			getPlatformOverview: jest.fn().mockResolvedValue({}),
			getPlatformCsv: jest.fn().mockResolvedValue('date,views'),
		};

		const moduleRef = await Test.createTestingModule({
			controllers: [AnalyticsController],
			providers: [{ provide: AnalyticsService, useValue: service }],
		}).compile();

		controller = moduleRef.get(AnalyticsController);
	});

	function mockRequest(user: unknown = sessionUser): Request {
		mockedAuth.api.getSession.mockResolvedValue(
			user === null ? null : { user },
		);
		return { headers: { cookie: 'abc' } } as Request;
	}

	it('businessClick é público e repassa id e canal', async () => {
		await controller.businessClick({
			businessId: 'biz-1',
			channel: 'whatsapp',
		} as never);

		expect(service.trackBusinessClick).toHaveBeenCalledWith(
			'biz-1',
			'whatsapp',
		);
	});

	it('adStats repassa utilizador, id e range', async () => {
		const req = mockRequest();

		await controller.adStats(req, 'ad-1', { range: '30d' });

		expect(service.getAdStats).toHaveBeenCalledWith('u1', 'ADMIN', 'ad-1', {
			range: '30d',
		});
	});

	it('adStats exige sessão', async () => {
		const req = mockRequest(null);

		await expect(
			controller
				.adStats(req, 'ad-1', { range: '30d' })
				.catch((e) => Promise.resolve(e)),
		).resolves.toBeInstanceOf(UnauthorizedException);
		expect(service.getAdStats).not.toHaveBeenCalled();
	});

	it('businessStats repassa utilizador, id e range', async () => {
		const req = mockRequest();

		await controller.businessStats(req, 'biz-1', { range: '7d' });

		expect(service.getBusinessStats).toHaveBeenCalledWith(
			'u1',
			'ADMIN',
			'biz-1',
			{ range: '7d' },
		);
	});

	it('platformStats repassa o query', async () => {
		await controller.platformStats({ range: '90d' });

		expect(service.getPlatformStats).toHaveBeenCalledWith({ range: '90d' });
	});

	it('platformOverview repassa o query', async () => {
		await controller.platformOverview({ range: '30d' });

		expect(service.getPlatformOverview).toHaveBeenCalledWith({
			range: '30d',
		});
	});

	it('platformExport devolve o CSV gerado', async () => {
		const res = {
			setHeader: jest.fn(),
			send: jest.fn(),
		};
		await controller.platformExport({ range: '30d' }, res as never);

		expect(service.getPlatformCsv).toHaveBeenCalledWith({ range: '30d' });
		expect(res.setHeader).toHaveBeenCalledTimes(2);
		expect(res.send).toHaveBeenCalledWith('date,views');
	});

	it('platformStats exige business:moderate', () => {
		expect(
			Reflect.getMetadata(
				REQUIRED_PERMISSIONS_KEY,
				AnalyticsController.prototype.platformStats,
			),
		).toEqual({ business: ['moderate'] });
	});
});
