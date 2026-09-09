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
	BanUserDto,
	CreateUserDto,
	ListUsersQueryDto,
	SetRoleDto,
	UpdateProfileDto,
} from './users.dto';
import { SessionUser, UsersService } from './users.service';

@Controller('users')
@ApiTags('Usuários')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	private async requireUser(req: Request): Promise<SessionUser> {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			throw new UnauthorizedException('Não autenticado');
		}
		return {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
			role: session.user.role ?? 'none',
			banned: session.user.banned ?? false,
		};
	}

	@Get('me')
	@ApiOperation({ summary: 'Obter o perfil do usuário logado' })
	@UseGuards(PermissionsGuard)
	async getMe(@Req() req: Request) {
		const user = await this.requireUser(req);
		return this.usersService.getMe(user.id);
	}

	@Patch('me')
	@ApiOperation({ summary: 'Atualizar o perfil do usuário logado' })
	@UseGuards(PermissionsGuard)
	async updateMe(@Req() req: Request, @Body() dto: UpdateProfileDto) {
		const user = await this.requireUser(req);
		return this.usersService.updateMe(user.id, dto);
	}

	@Get()
	@ApiOperation({ summary: 'Listar usuários (ADMIN/MODERATOR)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ user: ['list'] })
	async list(@Req() req: Request, @Query() query: ListUsersQueryDto) {
		return this.usersService.list(req.headers, query);
	}

	@Get('public/:id')
	@ApiOperation({ summary: 'Obter perfil público de um utilizador' })
	async getPublicProfile(@Param('id') id: string) {
		return this.usersService.getPublicProfile(id);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Obter detalhes de um usuário (ADMIN/MODERATOR)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ user: ['list'] })
	async getById(@Param('id') id: string) {
		return this.usersService.getById(id);
	}

	@Post()
	@ApiOperation({
		summary: 'Criar usuário sem senha e enviar convite (ADMIN)',
	})
	@UseGuards(PermissionsGuard)
	@RequirePermission({ user: ['create'] })
	async create(@Req() req: Request, @Body() dto: CreateUserDto) {
		return this.usersService.create(req.headers, dto);
	}

	@Post(':id/ban')
	@ApiOperation({ summary: 'Banir usuário (ADMIN/MODERATOR)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ user: ['ban'] })
	async ban(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: BanUserDto,
	) {
		const user = await this.requireUser(req);
		return this.usersService.ban(user, req.headers, id, dto);
	}

	@Post(':id/unban')
	@ApiOperation({ summary: 'Desbanir usuário (ADMIN/MODERATOR)' })
	@HttpCode(200)
	@UseGuards(PermissionsGuard)
	@RequirePermission({ user: ['ban'] })
	async unban(@Req() req: Request, @Param('id') id: string) {
		const user = await this.requireUser(req);
		return this.usersService.unban(user, req.headers, id);
	}

	@Patch(':id/role')
	@ApiOperation({ summary: 'Alterar o tipo de acesso (ADMIN/MODERATOR)' })
	@UseGuards(PermissionsGuard)
	@RequirePermission({ user: ['set-role'] })
	async setRole(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: SetRoleDto,
	) {
		const user = await this.requireUser(req);
		return this.usersService.setRole(user, req.headers, id, dto);
	}
}
