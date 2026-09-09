import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Query,
	Req,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import { AnalyticsRangeDto, TrackBusinessClickDto } from './analytics.dto';
import { AnalyticsService, AnalyticsSessionUser } from './analytics.service';

@Controller('analytics')
@ApiTags('Analytics')
export class AnalyticsController {
	constructor(private readonly analyticsService: AnalyticsService) {}

	private async sessionUser(
		req: Request,
	): Promise<AnalyticsSessionUser | null> {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			return null;
		}
		return {
			id: session.user.id,
			role: session.user.role ?? 'USER',
		};
	}

	private async requireUser(req: Request): Promise<AnalyticsSessionUser> {
		const user = await this.sessionUser(req);
		if (!user) {
			throw new UnauthorizedException('Não autenticado');
		}
		return user;
	}

	@Post('business-click')
	@Public()
	@Throttle({ default: { limit: 20, ttl: 60_000 } })
	@ApiOperation({
		summary: 'Registar clique num contacto de empresa (público)',
	})
	async businessClick(@Body() dto: TrackBusinessClickDto) {
		await this.analyticsService.trackBusinessClick(
			dto.businessId,
			dto.channel,
		);
		return { ok: true };
	}

	@Get('ad/:adId')
	@ApiOperation({
		summary: 'Estatísticas de um anúncio (dono ou ADMIN/MODERATOR)',
	})
	async adStats(
		@Req() req: Request,
		@Param('adId') adId: string,
		@Query() query: AnalyticsRangeDto,
	) {
		const user = await this.requireUser(req);
		return this.analyticsService.getAdStats(
			user.id,
			user.role,
			adId,
			query.range,
		);
	}

	@Get('business/:businessId')
	@ApiOperation({
		summary: 'Estatísticas de uma empresa (dono ou ADMIN/MODERATOR)',
	})
	async businessStats(
		@Req() req: Request,
		@Param('businessId') businessId: string,
		@Query() query: AnalyticsRangeDto,
	) {
		const user = await this.requireUser(req);
		return this.analyticsService.getBusinessStats(
			user.id,
			user.role,
			businessId,
			query.range,
		);
	}

	@Get('platform')
	@RequirePermission({ business: ['moderate'] })
	@ApiOperation({
		summary: 'Estatísticas da plataforma (ADMIN/MODERATOR)',
	})
	async platformStats(@Query() query: AnalyticsRangeDto) {
		return this.analyticsService.getPlatformStats(query.range);
	}
}
