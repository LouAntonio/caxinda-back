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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import {
	ConversationsQueryDto,
	CreateConversationDto,
	MessageQueryDto,
	SendMessageDto,
} from './chat.dto';
import { ChatsService } from './chat.service';
import { ChatsGateway } from './chat.gateway';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/roles';

const chatThrottle = {
	default: {
		limit: Number(process.env.THROTTLE_CHAT_LIMIT ?? 120),
		ttl: Number(process.env.THROTTLE_CHAT_TTL_MS ?? 60000),
	},
};

const supportThrottle = {
	default: {
		limit: Number(process.env.THROTTLE_SUPPORT_LIMIT ?? 30),
		ttl: Number(process.env.THROTTLE_SUPPORT_TTL_MS ?? 60000),
	},
};

@Controller('conversations')
@ApiTags('Chat')
@Throttle(chatThrottle)
export class ChatsController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly chatsGateway: ChatsGateway,
	) {}

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
		const result = await this.chatsService.createConversation(userId, dto);
		if (result.created && dto.type === 'SUPPORT') {
			this.chatsGateway.notifyNewSupportConversation(result.id);
		}
		return result;
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

	@Post(':id/claim')
	@Throttle(supportThrottle)
	@ApiOperation({
		summary:
			'Atribuir a conversa de suporte ao agente logado (admin/moderador)',
	})
	@Roles(Role.ADMIN, Role.MODERATOR)
	@HttpCode(200)
	async claimConversation(@Req() req: Request, @Param('id') id: string) {
		const userId = await this.requireUser(req);
		return this.chatsService.claimConversation(userId, id);
	}

	@Post(':id/release')
	@Throttle(supportThrottle)
	@ApiOperation({
		summary: 'Liberar a conversa de suporte (volta à fila OPEN)',
	})
	@Roles(Role.ADMIN, Role.MODERATOR)
	@HttpCode(200)
	async releaseConversation(@Req() req: Request, @Param('id') id: string) {
		const userId = await this.requireUser(req);
		return this.chatsService.releaseConversation(userId, id);
	}

	@Patch(':id/resolve')
	@Throttle(supportThrottle)
	@ApiOperation({
		summary: 'Resolver a conversa de suporte (status RESOLVED)',
	})
	@Roles(Role.ADMIN, Role.MODERATOR)
	@HttpCode(200)
	async resolveConversation(@Req() req: Request, @Param('id') id: string) {
		const userId = await this.requireUser(req);
		return this.chatsService.resolveConversation(userId, id);
	}
}
