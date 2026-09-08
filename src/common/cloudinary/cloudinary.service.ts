import { Inject, Injectable } from '@nestjs/common';
import {
	DeleteApiResponse,
	ResourceType,
	UploadApiErrorResponse,
	UploadApiOptions,
	UploadApiResponse,
	v2 as CloudinaryV2,
} from 'cloudinary';

type SignParams = Record<string, string | number | boolean>;

@Injectable()
export class CloudinaryService {
	constructor(
		@Inject('CLOUDINARY') private readonly cloudinary: typeof CloudinaryV2,
	) {}

	upload(
		file: string | Buffer,
		options: UploadApiOptions = {},
	): Promise<UploadApiResponse> {
		if (Buffer.isBuffer(file)) {
			return new Promise<UploadApiResponse>((resolve, reject) => {
				const stream = this.cloudinary.uploader.upload_stream(
					{ ...options },
					(
						err: UploadApiErrorResponse | undefined,
						result?: UploadApiResponse,
					) => {
						if (err) {
							reject(new Error(err.message));
						} else {
							resolve(result as UploadApiResponse);
						}
					},
				);
				stream.end(file);
			});
		}
		return this.cloudinary.uploader.upload(file, options);
	}

	getSignedUploadParams(options: SignParams = {}): SignParams {
		const params: SignParams = {
			...options,
			api_key: String(this.cloudinary.config().api_key ?? ''),
			timestamp: Math.floor(Date.now() / 1000),
		};
		const signature = this.cloudinary.utils.api_sign_request(
			params,
			this.cloudinary.config().api_secret ?? '',
		);
		return { ...params, signature };
	}

	deleteResource(
		publicId: string,
		resourceType: ResourceType = 'image',
	): Promise<DeleteApiResponse> {
		return this.cloudinary.api.delete_resources([publicId], {
			resource_type: resourceType,
		}) as Promise<DeleteApiResponse>;
	}

	deleteResources(
		publicIds: string[],
		resourceType: ResourceType = 'image',
	): Promise<DeleteApiResponse> {
		return this.cloudinary.api.delete_resources(publicIds, {
			resource_type: resourceType,
		}) as Promise<DeleteApiResponse>;
	}
}
