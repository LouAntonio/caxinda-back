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
import { RequirePermission } from '../auth/decorators/roles.decorator';
import {
	CreatePlatformAccountDto,
	UpdatePlatformAccountDto,
} from './platform-accounts.dto';
import { PlatformAccountsService } from './platform-accounts.service';

@Controller('platform-accounts')
@ApiTags('Contas bancárias')
export class PlatformAccountsController {
	constructor(
		private readonly platformAccountsService: PlatformAccountsService,
	) {}

	@Get()
	@RequirePermission({ payment: ['manage'] })
	@ApiOperation({
		summary: 'Listar contas bancárias da plataforma (admin)',
	})
	list() {
		return this.platformAccountsService.list();
	}

	@Post()
	@RequirePermission({ payment: ['manage'] })
	@ApiOperation({ summary: 'Criar conta bancária (admin)' })
	create(@Body() dto: CreatePlatformAccountDto) {
		return this.platformAccountsService.create(dto);
	}

	@Patch(':id')
	@RequirePermission({ payment: ['manage'] })
	@ApiOperation({ summary: 'Editar conta bancária (admin)' })
	update(@Param('id') id: string, @Body() dto: UpdatePlatformAccountDto) {
		return this.platformAccountsService.update(id, dto);
	}

	@Delete(':id')
	@RequirePermission({ payment: ['manage'] })
	@HttpCode(204)
	@ApiOperation({ summary: 'Remover conta bancária (admin)' })
	async remove(@Param('id') id: string) {
		await this.platformAccountsService.remove(id);
	}
}
