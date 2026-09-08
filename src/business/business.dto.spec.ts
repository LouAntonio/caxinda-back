import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
	BusinessesQueryDto,
	CreateBusinessDto,
	UpdateBusinessStatusDto,
} from './business.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

describe('Business DTOs', () => {
	describe('CreateBusinessDto', () => {
		it('aceita um payload válido', async () => {
			await expect(
				errorsOf(CreateBusinessDto, {
					name: 'Central do Tecido',
					description: 'Loja de tecidos.',
					province: 'LUANDA',
					phone: '+244 923 000 000',
					categoryId: '00000000-0000-7000-8000-000000000001',
				}),
			).resolves.toEqual([]);
		});

		it('aceita slug, contactos e galeria opcionais', async () => {
			await expect(
				errorsOf(CreateBusinessDto, {
					name: 'Central do Tecido',
					description: 'Loja de tecidos.',
					slug: 'central-do-tecido',
					address: 'Rua X',
					province: 'BENGUELA',
					phone: '+244',
					whatsapp: '+244',
					email: 'contacto@loja.ao',
					website: 'https://loja.ao',
					logoUrl: 'https://cdn.test/logo.jpg',
					coverUrl: 'https://cdn.test/capa.jpg',
					gallery: [
						{ url: 'https://cdn.test/1.jpg', cloudinaryId: 'g' },
					],
					categoryId: '00000000-0000-7000-8000-000000000001',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita name em falta', async () => {
			const errors = await errorsOf(CreateBusinessDto, {
				description: 'd',
				province: 'LUANDA',
				phone: '+244',
				categoryId: '00000000-0000-7000-8000-000000000001',
			});
			expect(errors.some((e) => e.property === 'name')).toBe(true);
		});

		it('rejeita province inválida', async () => {
			const errors = await errorsOf(CreateBusinessDto, {
				name: 'Loja',
				description: 'd',
				province: 'SAO_PAULO',
				phone: '+244',
				categoryId: '00000000-0000-7000-8000-000000000001',
			});
			expect(errors.some((e) => e.property === 'province')).toBe(true);
		});

		it('rejeita categoryId inválido', async () => {
			const errors = await errorsOf(CreateBusinessDto, {
				name: 'Loja',
				description: 'd',
				province: 'LUANDA',
				phone: '+244',
				categoryId: 'not-uuid',
			});
			expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
		});

		it('rejeita slug com espaços', async () => {
			const errors = await errorsOf(CreateBusinessDto, {
				name: 'Loja',
				description: 'd',
				slug: 'loja nova',
				province: 'LUANDA',
				phone: '+244',
				categoryId: '00000000-0000-7000-8000-000000000001',
			});
			expect(errors.some((e) => e.property === 'slug')).toBe(true);
		});
	});

	describe('UpdateBusinessStatusDto', () => {
		it('aceita SHOW e HIDE', async () => {
			await expect(
				errorsOf(UpdateBusinessStatusDto, { status: 'SHOW' }),
			).resolves.toEqual([]);
			await expect(
				errorsOf(UpdateBusinessStatusDto, { status: 'HIDE' }),
			).resolves.toEqual([]);
		});

		it('rejeita um status inválido', async () => {
			const errors = await errorsOf(UpdateBusinessStatusDto, {
				status: 'FROZEN',
			});
			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('status');
		});
	});

	describe('BusinessesQueryDto', () => {
		it('aceita body vazio', async () => {
			await expect(errorsOf(BusinessesQueryDto, {})).resolves.toEqual([]);
		});

		it('aceita filtros válidos', async () => {
			await expect(
				errorsOf(BusinessesQueryDto, {
					q: 'tecido',
					province: 'HUÍLA',
					categoryId: '00000000-0000-7000-8000-000000000001',
					page: 1,
					limit: 20,
					sortBy: 'name_asc',
				}),
			).resolves.toEqual([]);
		});

		it('rejeita sortBy inválido', async () => {
			const errors = await errorsOf(BusinessesQueryDto, {
				sortBy: 'random',
			});
			expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
		});
	});
});
