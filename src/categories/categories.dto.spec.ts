import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

describe('Categories DTOs', () => {
	describe('CreateCategoryDto', () => {
		it('aceita name válido', async () => {
			await expect(
				errorsOf(CreateCategoryDto, { name: 'Eletrónica' }),
			).resolves.toEqual([]);
		});

		it('aceita slug válido', async () => {
			const errors = await errorsOf(CreateCategoryDto, {
				name: 'Eletrónica',
				slug: 'eletronica',
			});

			expect(errors).toEqual([]);
		});

		it('rejeita name vazio', async () => {
			const errors = await errorsOf(CreateCategoryDto, { name: '' });

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('name');
		});

		it('rejeita name acima de 80 caracteres', async () => {
			const errors = await errorsOf(CreateCategoryDto, {
				name: 'a'.repeat(81),
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('name');
		});

		it('rejeita slug com espaços ou maiúsculas', async () => {
			const errors = await errorsOf(CreateCategoryDto, {
				name: 'Eletrónica',
				slug: 'Eletronica CIA',
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('slug');
		});
	});

	describe('UpdateCategoryDto', () => {
		it('aceita corpo vazio (tudo opcional)', async () => {
			await expect(errorsOf(UpdateCategoryDto, {})).resolves.toEqual([]);
		});

		it('rejeita slug inválido', async () => {
			const errors = await errorsOf(UpdateCategoryDto, {
				slug: 'slug inválido',
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('slug');
		});
	});
});
