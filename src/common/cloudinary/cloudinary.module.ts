import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, ConfigOptions } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

export const CLOUDINARY = 'CLOUDINARY';

const cloudinaryProvider = {
	provide: CLOUDINARY,
	inject: [ConfigService],
	useFactory: (configService: ConfigService): typeof cloudinary => {
		const options: ConfigOptions = {
			cloud_name: configService.getOrThrow<string>(
				'CLOUDINARY_CLOUD_NAME',
			),
			api_key: configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
			api_secret: configService.getOrThrow<string>(
				'CLOUDINARY_API_SECRET',
			),
		};
		cloudinary.config(options);
		return cloudinary;
	},
};

@Global()
@Module({
	providers: [cloudinaryProvider, CloudinaryService],
	exports: [CloudinaryService, CLOUDINARY],
})
export class CloudinaryModule {}
