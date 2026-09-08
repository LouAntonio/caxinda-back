import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
	BanUserDto,
	CreateUserDto,
	SetRoleDto,
	UpdateProfileDto,
} from './users.dto';

async function errorsOf(dto: new () => object, body: Record<string, unknown>) {
	const instance = plainToInstance(dto, body);
	return validate(instance);
}

describe('Users DTOs', () => {
	describe('CreateUserDto', () => {
		it('aceita email e nome válidos', async () => {
			const input = {
				email: 'novo@test.com',
				name: 'João',
			};

			await expect(errorsOf(CreateUserDto, input)).resolves.toEqual([]);
		});

		it('aceita role válida quando informada', async () => {
			const errors = await errorsOf(CreateUserDto, {
				email: 'novo@test.com',
				name: 'João',
				role: 'PROMOTER',
			});

			expect(errors).toEqual([]);
		});

		it('rejeita email inválido', async () => {
			const errors = await errorsOf(CreateUserDto, {
				email: 'nao-e-email',
				name: 'João',
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('email');
		});

		it('rejeita role inválida', async () => {
			const errors = await errorsOf(CreateUserDto, {
				email: 'novo@test.com',
				name: 'João',
				role: 'SUPERUSER',
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('role');
		});

		it('rejeita nome vazio', async () => {
			const errors = await errorsOf(CreateUserDto, {
				email: 'novo@test.com',
				name: '',
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('name');
		});
	});

	describe('SetRoleDto', () => {
		it('aceita role válida', async () => {
			await expect(
				errorsOf(SetRoleDto, { role: 'MODERATOR' }),
			).resolves.toEqual([]);
		});

		it('rejeita role inválida', async () => {
			const errors = await errorsOf(SetRoleDto, { role: 'OWNER' });

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('role');
		});
	});

	describe('BanUserDto', () => {
		it('aceita banimento permanente sem motivo', async () => {
			await expect(errorsOf(BanUserDto, {})).resolves.toEqual([]);
		});

		it('aceita motivo e duração válidos', async () => {
			const errors = await errorsOf(BanUserDto, {
				reason: 'Fraude',
				banExpiresIn: 3600,
			});

			expect(errors).toEqual([]);
		});

		it('converte string numérica de duração e aceita', async () => {
			const instance = plainToInstance(BanUserDto, {
				banExpiresIn: '3600',
			});
			const errors = await validate(instance);

			expect(errors).toEqual([]);
			expect(instance.banExpiresIn).toBe(3600);
		});

		it('rejeita duração zero ou negativa', async () => {
			const zero = await errorsOf(BanUserDto, { banExpiresIn: 0 });
			const neg = await errorsOf(BanUserDto, { banExpiresIn: -10 });

			expect(zero).toHaveLength(1);
			expect(neg).toHaveLength(1);
		});
	});

	describe('UpdateProfileDto', () => {
		it('aceita perfil vazio (sem alterações)', async () => {
			await expect(errorsOf(UpdateProfileDto, {})).resolves.toEqual([]);
		});

		it('aceita campos preenchidos', async () => {
			const errors = await errorsOf(UpdateProfileDto, {
				name: 'João',
				surname: 'Silva',
				phone: '+55 11 99999-9999',
				image: 'https://cdn.test/avatar.jpg',
			});

			expect(errors).toEqual([]);
		});

		it('rejeita telefone acima do limite', async () => {
			const errors = await errorsOf(UpdateProfileDto, {
				phone: 'x'.repeat(41),
			});

			expect(errors).toHaveLength(1);
			expect(errors[0].property).toBe('phone');
		});
	});
});
