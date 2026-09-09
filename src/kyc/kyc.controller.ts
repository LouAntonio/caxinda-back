import {
	Body,
	Controller,
	Get,
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
import { ListKycQueryDto, ReviewKycDto, SubmitKycDto } from './kyc.dto';
import { KycService } from './kyc.service';

@Controller('kyc')
@ApiTags('KYC')
export class KycController {
	constructor(private readonly kycService: KycService) {}

	private async requireUser(req: Request): Promise<{ id: string }> {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			throw new UnauthorizedException('Não autenticado');
		}
		return { id: session.user.id };
	}

	@Post()
	@ApiOperation({ summary: 'Enviar/editar documentos KYC' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ kyc: ['submit'] })
	async submit(@Req() req: Request, @Body() dto: SubmitKycDto) {
		const user = await this.requireUser(req);
		return this.kycService.submit(user.id, dto);
	}

	@Get()
	@ApiOperation({
		summary: 'Listar submissões KYC para revisão (ADMIN/MODERATOR)',
	})
	@UseGuards(PermissionsGuard)
	@RequirePermission({ kyc: ['review'] })
	async list(@Query() query: ListKycQueryDto) {
		return this.kycService.list(query);
	}

	@Get('me')
	@ApiOperation({ summary: 'Obter status do KYC do usuário logado' })
	@UseGuards(PermissionsGuard)
	async getStatus(@Req() req: Request) {
		const user = await this.requireUser(req);
		return this.kycService.getStatus(user.id);
	}

	@Patch(':id/review')
	@ApiOperation({ summary: 'Aprovar ou rejeitar um KYC (ADMIN/MODERATOR)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ kyc: ['review'] })
	async review(@Param('id') id: string, @Body() dto: ReviewKycDto) {
		return this.kycService.review(id, dto);
	}
}
