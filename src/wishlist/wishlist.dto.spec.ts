import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddWishlistDto, WishlistQueryDto } from './wishlist.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

const UUID = '00000000-0000-7000-8000-000000000001';

describe('Wishlist DTOs', () => {
	describe('AddWishlistDto', () => {
		it('aceita adId UUID válido', async () => {
			await expect(
				errorsOf(AddWishlistDto, { adId: UUID }),
			).resolves.toEqual([]);
		});

		it('rejeita adId inválido', async () => {
			const errors = await errorsOf(AddWishlistDto, { adId: 'x' });
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('adId');
		});

		it('rejeita corpo vazio', async () => {
			const errors = await errorsOf(AddWishlistDto, {});
			expect(errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ property: 'adId' }),
				]),
			);
		});
	});

	describe('WishlistQueryDto', () => {
		it('aceita corpo vazio', async () => {
			await expect(errorsOf(WishlistQueryDto, {})).resolves.toEqual([]);
		});

		it('aceita page/limit válidos', async () => {
			await expect(
				errorsOf(WishlistQueryDto, { page: 2, limit: 10 }),
			).resolves.toEqual([]);
		});

		it('rejeita page zero', async () => {
			const errors = await errorsOf(WishlistQueryDto, { page: 0 });
			expect(errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ property: 'page' }),
				]),
			);
		});

		it('rejeita limit acima de 50', async () => {
			const errors = await errorsOf(WishlistQueryDto, { limit: 51 });
			expect(errors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ property: 'limit' }),
				]),
			);
		});
	});
});
