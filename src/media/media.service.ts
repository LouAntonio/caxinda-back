import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const MEDIA_QUEUE = 'media';

@Injectable()
export class MediaService {
	private readonly logger = new Logger(MediaService.name);

	constructor(@InjectQueue(MEDIA_QUEUE) private readonly queue: Queue) {}

	/**
	 * Agenda a remoção de recursos do Cloudinary (imagens principais, galerias
	 * e selfies KYC que deixaram de ser referenciadas).
	 *
	 * Se a fila (Redis) estiver indisponível, a exceção é capturada e
	 * registada: não bloqueamos o fluxo principal (ex.: remoção de anúncio)
	 * por causa de uma falha secundária de limpeza de mídia.
	 */
	async enqueueDeletion(publicIds: string[]): Promise<void> {
		if (!publicIds || publicIds.length === 0) {
			return;
		}
		try {
			await this.queue.add(
				'delete',
				{ publicIds },
				{
					attempts: 3,
					backoff: { type: 'exponential', delay: 2000 },
					removeOnComplete: 1000,
					removeOnFail: 1000,
				},
			);
		} catch (error) {
			this.logger.error(
				`Falha ao agendar exclusão de mídia no Cloudinary: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}
