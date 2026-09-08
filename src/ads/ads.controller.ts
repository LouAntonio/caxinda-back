import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Query,
	Req,
	UseGuards,
	BadRequestException,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import {
	AdminListAdsQueryDto,
	AdProximityQueryDto,
	AdQueryDto,
	CreateAdDto,
	ModerateAdDto,
	UpdateAdDto,
	UpdateVisibilityDto,
} from './ads.dto';
import { AdSessionUser, AdsService } from './ads.service';

@Controller('api/ads')
@ApiTags('Anúncios')
export class AdsController {
	constructor(private readonly adsService: AdsService) {}

	private async sessionUser(req: Request): Promise<AdSessionUser | null> {
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

	private async requireUser(req: Request): Promise<AdSessionUser> {
		const user = await this.sessionUser(req);
		if (!user) {
			throw new UnauthorizedException('Não autenticado');
		}
		return user;
	}

	@Get()
	@ApiOperation({ summary: 'Listar anúncios (público)' })
	async list(@Req() req: Request, @Query() query: AdQueryDto) {
		const viewer = await this.sessionUser(req);
		return this.adsService.list(query, viewer);
	}

	@Get('admin')
	@ApiOperation({
		summary: 'Listar anúncios para moderação (MODERATOR/ADMIN)',
	})
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['moderate'] })
	async adminList(@Query() query: AdminListAdsQueryDto) {
		return this.adsService.adminList(query);
	}

	@Get('by-slug/:slug')
	@ApiOperation({ summary: 'Obter anúncio por slug (público)' })
	async getBySlug(
		@Req() req: Request,
		@Param('slug') slug: string,
		@Query() query: AdProximityQueryDto,
	) {
		const viewer = await this.sessionUser(req);
		const proximity = this.proximityFromQuery(query);
		return this.adsService.getBySlug(slug, viewer, proximity);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Obter anúncio por id (público)' })
	async getById(
		@Req() req: Request,
		@Param('id') id: string,
		@Query() query: AdProximityQueryDto,
	) {
		const viewer = await this.sessionUser(req);
		const proximity = this.proximityFromQuery(query);
		return this.adsService.getById(id, viewer, proximity);
	}

	private proximityFromQuery(
		query: AdProximityQueryDto,
	): { lat: number; lng: number } | undefined {
		const hasLat = query.lat !== undefined;
		const hasLng = query.lng !== undefined;
		if (hasLat === hasLng) {
			return hasLat ? { lat: query.lat!, lng: query.lng! } : undefined;
		}
		throw new BadRequestException(
			'Para usar proximidade informe lat e lng juntos.',
		);
	}

	@Post()
	@ApiOperation({
		summary: 'Criar anúncio (MODERATOR/ADMIN)',
	})
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['create'] })
	async create(@Req() req: Request, @Body() dto: CreateAdDto) {
		const user = await this.requireUser(req);
		return this.adsService.create(user.id, user.role, dto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Editar anúncio (dono ou moderador)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['edit'] })
	async update(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: UpdateAdDto,
	) {
		const user = await this.requireUser(req);
		return this.adsService.update(user.id, user.role, id, dto);
	}

	@Patch(':id/visibility')
	@ApiOperation({ summary: 'Alternar visibilidade do anúncio (dono)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['edit'] })
	async setVisibility(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: UpdateVisibilityDto,
	) {
		const user = await this.requireUser(req);
		return this.adsService.setVisibility(user.id, user.role, id, dto);
	}

	@Post(':id/feature')
	@ApiOperation({ summary: 'Destacar anúncio (dono, usando quota do plano)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['edit'] })
	async feature(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		return this.adsService.feature(user.id, id);
	}

	@Delete(':id/feature')
	@ApiOperation({ summary: 'Remover destaque (dono ou admin/moderador)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['edit'] })
	async unfeature(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		return this.adsService.unfeature(user.id, user.role, id);
	}

	@Patch(':id/moderation')
	@ApiOperation({
		summary: 'Moderar anúncio: verified + status (MODERATOR/ADMIN)',
	})
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['moderate'] })
	async moderate(@Param('id') id: string, @Body() dto: ModerateAdDto) {
		return this.adsService.moderate(id, dto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Remover anúncio (dono ou ADMIN)' })
	@HttpCode(204)
	@UseGuards(PermissionsGuard)
	@RequirePermission({ ad: ['delete'] })
	async remove(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		await this.adsService.remove(user.id, user.role, id);
	}
}
