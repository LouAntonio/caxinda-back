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
	UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import { CategoryType } from '../generated/prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Controller('api/categories')
@ApiTags('Categorias')
export class CategoriesController {
	constructor(private readonly categoriesService: CategoriesService) {}

	@Get()
	@ApiOperation({ summary: 'Listar categorias (público)' })
	async list(@Query('type') type?: CategoryType) {
		return this.categoriesService.list(type);
	}

	@Get(':slug')
	@ApiOperation({ summary: 'Obter categoria por slug (público)' })
	async getBySlug(@Param('slug') slug: string) {
		return this.categoriesService.getBySlug(slug);
	}

	@Post()
	@ApiOperation({ summary: 'Criar categoria (ADMIN)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ category: ['create'] })
	async create(@Body() dto: CreateCategoryDto) {
		return this.categoriesService.create(dto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Editar categoria (ADMIN)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ category: ['edit'] })
	async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
		return this.categoriesService.update(id, dto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Remover categoria (ADMIN)' })
	@HttpCode(204)
	@UseGuards(PermissionsGuard)
	@RequirePermission({ category: ['delete'] })
	async remove(@Param('id') id: string) {
		await this.categoriesService.remove(id);
	}
}
