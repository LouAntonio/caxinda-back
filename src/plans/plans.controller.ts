import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PlansService } from './plans.service';

@Public()
@Controller('plans')
@ApiTags('Planos')
export class PlansController {
	constructor(private readonly plansService: PlansService) {}

	@Get()
	@ApiOperation({
		summary:
			'Listar planos/subscrições ativos e contas bancárias da plataforma',
	})
	list() {
		return this.plansService.list();
	}
}
