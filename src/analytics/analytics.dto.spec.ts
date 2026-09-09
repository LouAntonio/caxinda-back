import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsRangeDto, TrackBusinessClickDto } from './analytics.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

describe('Analytics DTOs', () => {
	describe('TrackBusinessClickDto', () => {
		it('aceita um payload válido', async () => {
			await expect(
				errorsOf(TrackBusinessClickDto, {
					businessId: '00000000-0000-7000-8000-000000000001',
					channel: 'whatsapp',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita businessId em falta', async () => {
			const errors = await errorsOf(TrackBusinessClickDto, {
				channel: 'phone',
			});
			expect(errors.some((e) => e.property === 'businessId')).toBe(true);
		});

		it('rejeita channel inválido', async () => {
			const errors = await errorsOf(TrackBusinessClickDto, {
				businessId: '00000000-0000-7000-8000-000000000001',
				channel: 'telegram',
			});
			expect(errors.some((e) => e.property === 'channel')).toBe(true);
		});

		it('aceita todos os canais de contacto', async () => {
			for (const channel of ['phone', 'whatsapp', 'email', 'website']) {
				const errors = await errorsOf(TrackBusinessClickDto, {
					businessId: '00000000-0000-7000-8000-000000000001',
					channel,
				});
				expect(errors).toEqual([]);
			}
		});
	});

	describe('AnalyticsRangeDto', () => {
		it('usa 30d por omissão', () => {
			const dto = plainToInstance(AnalyticsRangeDto, {});
			expect(dto.range).toBe('30d');
		});

		it('aceita ranges válidos', async () => {
			for (const range of ['7d', '30d', '90d', '180d', '365d', '730d']) {
				const errors = await errorsOf(AnalyticsRangeDto, { range });
				expect(errors).toEqual([]);
			}
		});

		it('rejeita range inválido', async () => {
			const errors = await errorsOf(AnalyticsRangeDto, { range: '1y' });
			expect(errors.some((e) => e.property === 'range')).toBe(true);
		});
	});
});
