import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthService } from './services/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthController } from './auth.controller';
import { MagicLinkService } from './magic-link.service';

@Global()
@Module({
	imports: [
		JwtModule.register({
			secret: process.env.JWT_SECRET,
			signOptions: {
				expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as StringValue,
			},
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, JwtAuthGuard, PermissionsGuard, MagicLinkService],
	exports: [
		AuthService,
		JwtAuthGuard,
		PermissionsGuard,
		JwtModule,
		MagicLinkService,
	],
})
export class AuthModule {}
