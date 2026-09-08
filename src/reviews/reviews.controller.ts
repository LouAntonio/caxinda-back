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
	UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import {
	CreateReviewDto,
	RespondReviewDto,
	ReviewSessionUser,
	ReviewsQueryDto,
} from './reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller('api/reviews')
@ApiTags('Avaliações')
export class ReviewsController {
	constructor(private readonly reviewsService: ReviewsService) {}

	private async sessionUser(req: Request): Promise<ReviewSessionUser | null> {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			return null;
		}
		return { id: session.user.id, role: session.user.role ?? 'USER' };
	}

	private async requireUser(req: Request): Promise<ReviewSessionUser> {
		const user = await this.sessionUser(req);
		if (!user) {
			throw new UnauthorizedException('Não autenticado');
		}
		return user;
	}

	@Get()
	@ApiOperation({ summary: 'Listar avaliações (público)' })
	async list(@Query() query: ReviewsQueryDto) {
		return this.reviewsService.list(query);
	}

	@Post()
	@ApiOperation({ summary: 'Criar avaliação para um anúncio' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ review: ['create'] })
	async create(@Req() req: Request, @Body() dto: CreateReviewDto) {
		const user = await this.requireUser(req);
		return this.reviewsService.create(user.id, dto);
	}

	@Patch(':id/response')
	@ApiOperation({ summary: 'Responder a uma avaliação (dono do anúncio)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ review: ['create'] })
	async respond(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: RespondReviewDto,
	) {
		const user = await this.requireUser(req);
		return this.reviewsService.respond(user.id, id, dto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Remover avaliação (autor ou moderador)' })
	@HttpCode(204)
	@UseGuards(PermissionsGuard)
	@RequirePermission({ review: ['delete'] })
	async remove(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		await this.reviewsService.remove(user, id);
	}
}
