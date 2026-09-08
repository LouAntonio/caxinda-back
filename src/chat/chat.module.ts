import { Module } from '@nestjs/common';
import { ChatsController } from './chat.controller';
import { ChatsGateway } from './chat.gateway';
import { ChatsService } from './chat.service';

@Module({
	controllers: [ChatsController],
	providers: [ChatsGateway, ChatsService],
	exports: [ChatsService],
})
export class ChatsModule {}
