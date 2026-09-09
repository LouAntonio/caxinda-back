import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { GlobalSearchQueryDto } from './search.dto';
import { SearchService } from './search.service';

@Controller('search')
@ApiTags('Busca')
@Public()
export class SearchController {
	constructor(private readonly searchService: SearchService) {}

	@Get()
	@ApiOperation({
		summary:
			'Busca global pública em anúncios, empresas e utilizadores (relevância)',
	})
	async search(@Query() query: GlobalSearchQueryDto) {
		return this.searchService.searchPublic(query);
	}
}
