import {
	ApiOperation,
	ApiProperty,
	ApiPropertyOptional,
	ApiTags,
} from '@nestjs/swagger';
import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../auth/decorators/roles.decorator';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';

export const MEDIA_FOLDERS = [
	'ads',
	'businesses',
	'categories',
	'chat',
	'kyc',
	'reports',
	'payments',
] as const;

export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export class MediaSignQueryDto {
	@ApiProperty({
		enum: MEDIA_FOLDERS,
		description: 'Pasta (contexto) do upload no Cloudinary',
	})
	@IsIn(MEDIA_FOLDERS, { message: 'Pasta de upload inválida.' })
	folder: MediaFolder;

	@ApiPropertyOptional({
		description: 'Tipo de recurso para upload no Cloudinary',
	})
	@IsOptional()
	@IsString()
	resourceType?: string;

	@ApiPropertyOptional({
		description: 'Tags adicionais separadas por vírgula',
	})
	@IsOptional()
	@IsString()
	tags?: string;
}

@Controller('media')
@ApiTags('Media')
export class MediaController {
	constructor(private readonly cloudinary: CloudinaryService) {}

	@Get('sign')
	@RequirePermission({ upload: ['upload'] })
	@ApiOperation({
		summary:
			'Obter parâmetros assinados para upload direto no Cloudinary (a partir do browser)',
	})
	sign(@Query() query: MediaSignQueryDto) {
		const params = this.cloudinary.getSignedUploadParams({
			folder: query.folder,
			...(query.tags ? { tags: query.tags } : {}),
		});
		return {
			...params,
			...(query.resourceType ? { resourceType: query.resourceType } : {}),
		};
	}
}
