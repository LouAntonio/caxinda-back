import { AuthService } from './auth.service';

jest.mock('../../libs/auth', () => ({
	auth: {
		api: {
			getSession: jest.fn(),
		},
	},
}));

jest.mock('better-auth/node', () => ({
	fromNodeHeaders: (headers: Record<string, unknown>) => headers,
}));

import { auth } from '../../libs/auth';

const mockedAuth = auth as unknown as { api: { getSession: jest.Mock } };

describe('AuthService', () => {
	let service: AuthService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new AuthService();
	});

	it('returns the session when authenticated', async () => {
		const session = { user: { id: 'u1' }, session: { id: 's1' } };
		mockedAuth.api.getSession.mockResolvedValue(session);

		const result = await service.getSession({ cookie: 'c' });

		expect(result).toEqual(session);
		expect(mockedAuth.api.getSession).toHaveBeenCalledWith({
			headers: expect.anything(),
		});
	});

	it('returns null when not authenticated', async () => {
		mockedAuth.api.getSession.mockResolvedValue(null);

		await expect(service.getSession({})).resolves.toBeNull();
	});
});
