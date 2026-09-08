import { Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { auth } from '../../libs/auth';

@Injectable()
export class AuthService {
	async getSession(headers: IncomingHttpHeaders) {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(headers),
		});

		if (!session) {
			return null;
		}

		return session;
	}
}
