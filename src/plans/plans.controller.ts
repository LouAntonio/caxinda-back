import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './plans.dto';

@Controller('plans')
@ApiTags('Planos')
export class PlansController {
	constructor(private readonly plansService: PlansService) {}

	@Get()
	@Public()
	@ApiOperation({ summary: 'Listar planos/subscrições ativos' })
	list() {
		return this.plansService.list();
	}

	@Get('admin')
	@ApiOperation({ summary: 'Listar todos os planos (ADMIN/MODERADOR)' })
	@RequirePermission({ plan: ['manage'] })
	listAll() {
		return this.plansService.listAll();
	}

	@Post()
	@ApiOperation({ summary: 'Criar plano (ADMIN/MODERADOR)' })
	@RequirePermission({ plan: ['manage'] })
	create(@Body() dto: CreatePlanDto) {
		return this.plansService.create(dto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Editar plano (ADMIN/MODERADOR)' })
	@RequirePermission({ plan: ['manage'] })
	update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
		return this.plansService.update(id, dto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Remover plano (ADMIN/MODERADOR)' })
	@HttpCode(204)
	@RequirePermission({ plan: ['manage'] })
	async remove(@Param('id') id: string) {
		await this.plansService.remove(id);
	}
}
