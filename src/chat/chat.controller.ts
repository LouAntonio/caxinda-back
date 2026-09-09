import {
	Body,
	Controller,
	Get,
	HttpCode,
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
import {
	ConversationsQueryDto,
	CreateConversationDto,
	MessageQueryDto,
	SendMessageDto,
} from './chat.dto';
import { ChatsService } from './chat.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/roles';

@Controller('conversations')
@ApiTags('Chat')
@UseGuards(PermissionsGuard)
export class ChatsController {
	constructor(private readonly chatsService: ChatsService) {}

	private async requireUser(req: Request) {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			throw new UnauthorizedException('Não autenticado');
		}
		return session.user.id;
	}

	@Post()
	@ApiOperation({
		summary:
			'Abrir (ou reusar) uma conversa: adId para anúncio, businessId para empresa ou type SUPPORT',
	})
	async createConversation(
		@Req() req: Request,
		@Body() dto: CreateConversationDto,
	) {
		const userId = await this.requireUser(req);
		return this.chatsService.createConversation(userId, dto);
	}

	@Get()
	@ApiOperation({ summary: 'Listar minhas conversas' })
	async list(@Req() req: Request, @Query() query: ConversationsQueryDto) {
		const userId = await this.requireUser(req);
		return this.chatsService.listConversations(userId, query);
	}

	@Get('admin')
	@ApiOperation({ summary: 'Listar todas as conversas (admin/moderador)' })
	@Roles(Role.ADMIN, Role.MODERATOR)
	async adminList(@Query() query: ConversationsQueryDto) {
		return this.chatsService.adminList(query);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Detalhe de uma conversa' })
	async getConversation(@Req() req: Request, @Param('id') id: string) {
		const userId = await this.requireUser(req);
		return this.chatsService.getConversation(userId, id);
	}

	@Get(':id/messages')
	@ApiOperation({ summary: 'Mensagens de uma conversa (cursor-based)' })
	async getMessages(
		@Req() req: Request,
		@Param('id') id: string,
		@Query() query: MessageQueryDto,
	) {
		const userId = await this.requireUser(req);
		return this.chatsService.getMessages(userId, id, query);
	}

	@Post(':id/messages')
	@ApiOperation({
		summary: 'Enviar mensagem pela REST (fallback do socket)',
	})
	@HttpCode(201)
	async sendMessage(
		@Req() req: Request,
		@Param('id') id: string,
		@Body() dto: SendMessageDto,
	) {
		const userId = await this.requireUser(req);
		return this.chatsService.sendMessage(userId, id, dto);
	}

	@Post(':id/read')
	@ApiOperation({ summary: 'Marcar mensagens recebidas como lidas' })
	@HttpCode(200)
	async markRead(@Req() req: Request, @Param('id') id: string) {
		const userId = await this.requireUser(req);
		return this.chatsService.markRead(userId, id);
	}
}
