import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
	AdProximityQueryDto,
	AdQueryDto,
	CreateAdDto,
	ModerateAdDto,
	UpdateAdDto,
	UpdateVisibilityDto,
} from './ads.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	const errors = await validate(instance);
	return errors.map((error) => error.property);
}

describe('Ads DTOs', () => {
	describe('CreateAdDto', () => {
		const catA = '00000000-0000-7000-8000-000000000001';
		const catB = '00000000-0000-7000-8000-000000000002';
		const base = {
			title: 'iPhone 12',
			description: 'Ótimo estado',
			categoryIds: [catA, catB],
		};

		it('aceita corpo mínimo válido', async () => {
			await expect(errorsOf(CreateAdDto, base)).resolves.toEqual([]);
		});

		it('aceita price e location', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				price: 250000,
				location: { lat: -8.8, lng: 13.2 },
			});

			expect(errors).toEqual([]);
		});

		it('rejeita categoryIds ausente', async () => {
			const errors = await errorsOf(CreateAdDto, {
				title: 'iPhone',
				description: 'desc',
			});

			expect(errors).toContain('categoryIds');
		});

		it('rejeita categoryIds com UUID inválido', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				categoryIds: ['nao-uuid'],
			});

			expect(errors).toContain('categoryIds');
		});

		it('rejeita price negativo', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				price: -1,
			});

			expect(errors).toContain('price');
		});

		it('rejeita lat fora do intervalo', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				location: { lat: 95, lng: 13.2 },
			});

			expect(errors).toContain('location');
		});

		it('rejeita gallery com url inválida', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				gallery: [{ url: 'nao-url', cloudinaryId: 'ads/x' }],
			});

			expect(errors).toContain('gallery');
		});

		it('rejeita title acima de 140 caracteres', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				title: 'a'.repeat(141),
			});

			expect(errors).toContain('title');
		});

		it('aceita slug válido', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				slug: 'iphone-12-64gb',
			});

			expect(errors).toEqual([]);
		});

		it('rejeita slug com espaços ou maiúsculas', async () => {
			const errors = await errorsOf(CreateAdDto, {
				...base,
				slug: 'Iphone 12',
			});

			expect(errors).toContain('slug');
		});
	});

	describe('UpdateAdDto', () => {
		it('aceita corpo vazio (tudo opcional)', async () => {
			await expect(errorsOf(UpdateAdDto, {})).resolves.toEqual([]);
		});

		it('aceita location null para remover localização', async () => {
			await expect(
				errorsOf(UpdateAdDto, { location: null }),
			).resolves.toEqual([]);
		});

		it('aceita slug válido', async () => {
			await expect(
				errorsOf(UpdateAdDto, { slug: 'novo-slug' }),
			).resolves.toEqual([]);
		});

		it('rejeita slug inválido', async () => {
			const errors = await errorsOf(UpdateAdDto, {
				slug: 'Slug Inválido',
			});

			expect(errors).toContain('slug');
		});
	});

	describe('UpdateVisibilityDto', () => {
		it('aceita VISIBLE e HIDDEN', async () => {
			await expect(
				errorsOf(UpdateVisibilityDto, { visibility: 'HIDDEN' }),
			).resolves.toEqual([]);
		});

		it('rejeita outro valor', async () => {
			const errors = await errorsOf(UpdateVisibilityDto, {
				visibility: 'BANNED',
			});

			expect(errors).toContain('visibility');
		});
	});

	describe('ModerateAdDto', () => {
		it('aceita verified e status', async () => {
			await expect(
				errorsOf(ModerateAdDto, {
					verified: true,
					status: 'REJECTED',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita status inválido', async () => {
			const errors = await errorsOf(ModerateAdDto, {
				status: 'PENDING',
			});

			expect(errors).toContain('status');
		});
	});

	describe('AdQueryDto', () => {
		it('aceita consulta vazia', async () => {
			await expect(errorsOf(AdQueryDto, {})).resolves.toEqual([]);
		});

		it('transforma includeInactive em booleano', async () => {
			const instance = plainToInstance(AdQueryDto, {
				includeInactive: 'true',
			});
			const trueErrors = await validate(instance);

			const falseInstance = plainToInstance(AdQueryDto, {
				includeInactive: 'false',
			});
			const falseErrors = await validate(falseInstance);

			expect(trueErrors).toEqual([]);
			expect(instance.includeInactive).toBe(true);
			expect(falseErrors).toEqual([]);
			expect(falseInstance.includeInactive).toBe(false);
		});

		it('transforma featured em booleano', async () => {
			const instance = plainToInstance(AdQueryDto, { featured: 'true' });
			const trueErrors = await validate(instance);

			const falseInstance = plainToInstance(AdQueryDto, {
				featured: 'false',
			});
			const falseErrors = await validate(falseInstance);

			expect(trueErrors).toEqual([]);
			expect(instance.featured).toBe(true);
			expect(falseErrors).toEqual([]);
			expect(falseInstance.featured).toBe(false);
		});

		it('converte números a partir de strings', async () => {
			const instance = plainToInstance(AdQueryDto, {
				page: '2',
				limit: '30',
				lat: '-8.8',
				lng: '13.2',
				radiusKm: '15',
			});
			const errors = await validate(instance);

			expect(errors).toEqual([]);
			expect(instance.radiusKm).toBe(15);
		});

		it('rejeita limit acima de 50', async () => {
			const errors = await errorsOf(AdQueryDto, { limit: 51 });

			expect(errors).toContain('limit');
		});

		it('rejeita radiusKm acima de 199', async () => {
			const errors = await errorsOf(AdQueryDto, { radiusKm: 200 });

			expect(errors).toContain('radiusKm');
		});

		it('rejeita lng fora do intervalo', async () => {
			const errors = await errorsOf(AdQueryDto, { lng: 200 });

			expect(errors).toContain('lng');
		});

		it('rejeita sortBy inválido', async () => {
			const errors = await errorsOf(AdQueryDto, {
				sortBy: 'relevant',
			});

			expect(errors).toContain('sortBy');
		});
	});

	describe('AdProximityQueryDto', () => {
		it('aceita lat e lng válidos', async () => {
			const errors = await errorsOf(AdProximityQueryDto, {
				lat: -8.8,
				lng: 13.2,
			});

			expect(errors).toEqual([]);
		});

		it('aceita query vazia (proximidade opcional)', async () => {
			const errors = await errorsOf(AdProximityQueryDto, {});

			expect(errors).toEqual([]);
		});

		it('converte números a partir de strings', async () => {
			const instance = plainToInstance(AdProximityQueryDto, {
				lat: '-8.8',
				lng: '13.2',
			});
			const errors = await validate(instance);

			expect(errors).toEqual([]);
			expect(instance.lat).toBe(-8.8);
			expect(instance.lng).toBe(13.2);
		});

		it('rejeita lat fora do intervalo', async () => {
			const errors = await errorsOf(AdProximityQueryDto, {
				lat: 95,
				lng: 13.2,
			});

			expect(errors).toContain('lat');
		});

		it('rejeita lng fora do intervalo', async () => {
			const errors = await errorsOf(AdProximityQueryDto, {
				lat: -8.8,
				lng: 200,
			});

			expect(errors).toContain('lng');
		});
	});
});
