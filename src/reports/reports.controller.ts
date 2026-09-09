import {
	Body,
	Controller,
	Get,
	Patch,
	Param,
	Post,
	Query,
	Req,
	UseGuards,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import {
	CreateReportDto,
	ReportCountQueryDto,
	ReportSessionUser,
	ReportsQueryDto,
	UpdateReportStatusDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@ApiTags('Denúncias')
export class ReportsController {
	constructor(private readonly reportsService: ReportsService) {}

	private async sessionUser(req: Request): Promise<ReportSessionUser | null> {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			return null;
		}
		return { id: session.user.id, role: session.user.role ?? 'USER' };
	}

	private async requireUser(req: Request): Promise<ReportSessionUser> {
		const user = await this.sessionUser(req);
		if (!user) {
			throw new UnauthorizedException('Não autenticado');
		}
		return user;
	}

	@Post()
	@ApiOperation({ summary: 'Criar uma denúncia' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ report: ['create'] })
	async create(@Req() req: Request, @Body() dto: CreateReportDto) {
		const user = await this.requireUser(req);
		return this.reportsService.create(user.id, dto);
	}

	@Get('count')
	@ApiOperation({
		summary: 'Contagem de denúncias ativas de um alvo (público)',
	})
	async count(@Query() query: ReportCountQueryDto) {
		return this.reportsService.count(query);
	}

	@Get('mine')
	@ApiOperation({ summary: 'Listar as próprias denúncias (autenticado)' })
	@UseGuards(PermissionsGuard)
	async listMine(@Req() req: Request, @Query() query: ReportsQueryDto) {
		const user = await this.requireUser(req);
		return this.reportsService.listMine(user.id, query);
	}

	@Get()
	@ApiOperation({ summary: 'Listar denúncias (moderador)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ report: ['list'] })
	async list(@Req() req: Request, @Query() query: ReportsQueryDto) {
		const user = await this.requireUser(req);
		return this.reportsService.list(user, query);
	}

	@Patch(':id/status')
	@ApiOperation({ summary: 'Atualizar status de uma denúncia (moderador)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ report: ['moderate'] })
	async updateStatus(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: UpdateReportStatusDto,
	) {
		const user = await this.requireUser(req);
		return this.reportsService.updateStatus(user, id, dto);
	}
}
