import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export { PrismaService };

@Global()
@Module({
	providers: [PrismaService],
	exports: [PrismaService],
})
export class PrismaModule {}
