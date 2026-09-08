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
	UnauthorizedException,
	UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import {
	BusinessesQueryDto,
	CreateBusinessDto,
	ModerateBusinessDto,
	UpdateBusinessDto,
	UpdateBusinessStatusDto,
} from './business.dto';
import { BusinessesService, BusinessSessionUser } from './business.service';

@Controller('api/businesses')
@ApiTags('Empresas')
export class BusinessesController {
	constructor(private readonly businessesService: BusinessesService) {}

	private async sessionUser(
		req: Request,
	): Promise<BusinessSessionUser | null> {
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

	private async requireUser(req: Request): Promise<BusinessSessionUser> {
		const user = await this.sessionUser(req);
		if (!user) {
			throw new UnauthorizedException('Não autenticado');
		}
		return user;
	}

	@Get()
	@ApiOperation({ summary: 'Listar empresas (público)' })
	async list(@Req() req: Request, @Query() query: BusinessesQueryDto) {
		const viewer = await this.sessionUser(req);
		return this.businessesService.listPublic(query, viewer ?? undefined);
	}

	@Get('by-slug/:slug')
	@ApiOperation({ summary: 'Obter empresa por slug (público)' })
	async getBySlug(@Req() req: Request, @Param('slug') slug: string) {
		const viewer = await this.sessionUser(req);
		return this.businessesService.getBySlug(slug, viewer ?? undefined);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Obter empresa por id (público)' })
	async getById(@Req() req: Request, @Param('id') id: string) {
		const viewer = await this.sessionUser(req);
		return this.businessesService.getById(id, viewer ?? undefined);
	}

	@Post()
	@ApiOperation({ summary: 'Criar empresa (PROMOTER/MODERATOR/ADMIN)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ business: ['create'] })
	async create(@Req() req: Request, @Body() dto: CreateBusinessDto) {
		const user = await this.requireUser(req);
		return this.businessesService.create(user.id, user.role, dto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Editar empresa (dono ou moderador)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ business: ['edit'] })
	async update(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: UpdateBusinessDto,
	) {
		const user = await this.requireUser(req);
		return this.businessesService.update(user.id, user.role, id, dto);
	}

	@Patch(':id/status')
	@ApiOperation({ summary: 'Alternar estado de exibição (dono)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ business: ['edit'] })
	async setStatus(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: UpdateBusinessStatusDto,
	) {
		const user = await this.requireUser(req);
		return this.businessesService.setStatus(user.id, user.role, id, dto);
	}

	@Patch(':id/moderation')
	@ApiOperation({
		summary: 'Moderar empresa: isVerified + status (MODERATOR/ADMIN)',
	})
	@UseGuards(PermissionsGuard)
	@RequirePermission({ business: ['moderate'] })
	async moderate(@Param('id') id: string, @Body() dto: ModerateBusinessDto) {
		return this.businessesService.moderate(id, dto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Remover empresa (dono ou ADMIN)' })
	@HttpCode(204)
	@UseGuards(PermissionsGuard)
	@RequirePermission({ business: ['delete'] })
	async remove(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		await this.businessesService.remove(user.id, user.role, id);
	}
}
