import {
	Body,
	Controller,
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
	CreatePaymentDto,
	PaymentsQueryDto,
	ReviewPaymentDto,
	SubmitPaymentProofDto,
} from './payments.dto';
import { PaymentsService, PaymentSessionUser } from './payments.service';

@Controller('payments')
@ApiTags('Pagamentos')
export class PaymentsController {
	constructor(private readonly paymentsService: PaymentsService) {}

	private async sessionUser(
		req: Request,
	): Promise<PaymentSessionUser | null> {
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

	private async requireUser(req: Request): Promise<PaymentSessionUser> {
		const user = await this.sessionUser(req);
		if (!user) {
			throw new UnauthorizedException('Não autenticado');
		}
		return user;
	}

	@Post()
	@UseGuards(PermissionsGuard)
	@RequirePermission({ payment: ['buy'] })
	@ApiOperation({ summary: 'Criar pagamento de subscrição da empresa' })
	async create(@Req() req: Request, @Body() dto: CreatePaymentDto) {
		const user = await this.requireUser(req);
		return this.paymentsService.create(user.id, user.role, dto);
	}

	@Post(':id/proof')
	@UseGuards(PermissionsGuard)
	@RequirePermission({ payment: ['submit'] })
	@ApiOperation({ summary: 'Submeter comprovativo de transferência' })
	async submitProof(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: SubmitPaymentProofDto,
	) {
		const user = await this.requireUser(req);
		return this.paymentsService.submitProof(user.id, user.role, id, dto);
	}

	@Post(':id/cancel')
	@UseGuards(PermissionsGuard)
	@RequirePermission({ payment: ['cancel'] })
	@HttpCode(200)
	@ApiOperation({ summary: 'Cancelar pagamento pendente' })
	async cancel(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		return this.paymentsService.cancel(user.id, user.role, id);
	}

	@Patch(':id/review')
	@UseGuards(PermissionsGuard)
	@RequirePermission({ payment: ['review'] })
	@ApiOperation({
		summary: 'Aprovar ou rejeitar pagamento (admin/moderador)',
	})
	async review(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: ReviewPaymentDto,
	) {
		const user = await this.requireUser(req);
		return this.paymentsService.review(user, id, dto);
	}

	@Get()
	@UseGuards(PermissionsGuard)
	@RequirePermission({ payment: ['manage'] })
	@ApiOperation({ summary: 'Listar todos os pagamentos (admin)' })
	async list(@Query() query: PaymentsQueryDto) {
		return this.paymentsService.list(query);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Detalhe de um pagamento (dono ou admin)' })
	async getById(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		return this.paymentsService.getById(user.id, user.role, id);
	}
}
