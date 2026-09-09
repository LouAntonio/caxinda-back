import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Post,
	Query,
	Req,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../libs/auth';
import { AddWishlistDto, WishlistQueryDto } from './wishlist.dto';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
@ApiTags('Lista de desejos')
export class WishlistController {
	constructor(private readonly wishlistService: WishlistService) {}

	private async requireUser(req: Request): Promise<{ id: string }> {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session) {
			throw new UnauthorizedException('Não autenticado');
		}
		return { id: session.user.id };
	}

	@Get()
	@ApiOperation({ summary: 'Listar itens da lista de desejos' })
	async list(@Req() req: Request, @Query() query: WishlistQueryDto) {
		const user = await this.requireUser(req);
		return this.wishlistService.list(user.id, query);
	}

	@Get('check/:adId')
	@ApiOperation({ summary: 'Verificar se um anúncio está salvo' })
	async check(@Req() req: Request, @Param('adId') adId: string) {
		const user = await this.requireUser(req);
		return this.wishlistService.check(user.id, adId);
	}

	@Post()
	@ApiOperation({ summary: 'Adicionar anúncio à lista de desejos' })
	async add(@Req() req: Request, @Body() dto: AddWishlistDto) {
		const user = await this.requireUser(req);
		return this.wishlistService.add(user.id, dto);
	}

	@Delete(':adId')
	@HttpCode(204)
	@ApiOperation({ summary: 'Remover anúncio da lista de desejos' })
	async remove(@Req() req: Request, @Param('adId') adId: string) {
		const user = await this.requireUser(req);
		await this.wishlistService.remove(user.id, adId);
	}
}
