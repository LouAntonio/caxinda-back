import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
	CreateReviewDto,
	RespondReviewDto,
	ReviewsQueryDto,
} from './reviews.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

describe('Reviews DTOs', () => {
	describe('CreateReviewDto', () => {
		it('aceita adId + rating válido', async () => {
			await expect(
				errorsOf(CreateReviewDto, {
					adId: '00000000-0000-7000-8000-000000000001',
					rating: 5,
				}),
			).resolves.toEqual([]);
		});

		it('aceita businessId + rating válido', async () => {
			await expect(
				errorsOf(CreateReviewDto, {
					businessId: '00000000-0000-7000-8000-000000000002',
					rating: 4,
				}),
			).resolves.toEqual([]);
		});

		it('aceita rating + comment', async () => {
			await expect(
				errorsOf(CreateReviewDto, {
					adId: '00000000-0000-7000-8000-000000000001',
					rating: 3,
					comment: 'Bom',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita adId inválido', async () => {
			const errors = await errorsOf(CreateReviewDto, {
				adId: 'not-uuid',
				rating: 5,
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('adId');
		});

		it('rejeita businessId inválido', async () => {
			const errors = await errorsOf(CreateReviewDto, {
				businessId: 'not-uuid',
				rating: 5,
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('businessId');
		});

		it('rejeita rating acima de 5', async () => {
			const errors = await errorsOf(CreateReviewDto, {
				adId: '00000000-0000-7000-8000-000000000001',
				rating: 6,
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('rating');
		});

		it('rejeita rating abaixo de 1', async () => {
			const errors = await errorsOf(CreateReviewDto, {
				adId: '00000000-0000-7000-8000-000000000001',
				rating: 0,
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('rating');
		});

		it('rejeita comment acima de 1000 caracteres', async () => {
			const errors = await errorsOf(CreateReviewDto, {
				adId: '00000000-0000-7000-8000-000000000001',
				rating: 5,
				comment: 'a'.repeat(1001),
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('comment');
		});
	});

	describe('RespondReviewDto', () => {
		it('aceita response válido', async () => {
			await expect(
				errorsOf(RespondReviewDto, { response: 'Obrigado' }),
			).resolves.toEqual([]);
		});

		it('rejeita response vazio', async () => {
			const errors = await errorsOf(RespondReviewDto, { response: '' });
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('response');
		});
	});

	describe('ReviewsQueryDto', () => {
		it('aceita body vazio', async () => {
			await expect(errorsOf(ReviewsQueryDto, {})).resolves.toEqual([]);
		});

		it('rejeita adId inválido', async () => {
			const errors = await errorsOf(ReviewsQueryDto, { adId: 'x' });
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('adId');
		});

		it('rejeita businessId inválido no filtro', async () => {
			const errors = await errorsOf(ReviewsQueryDto, {
				businessId: 'x',
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('businessId');
		});
	});
});
