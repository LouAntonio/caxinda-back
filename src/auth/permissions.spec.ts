import { adminRole, moderatorRole, userRole } from './permissions';

const CATEGORY_ACTIONS = ['create', 'edit', 'delete'] as const;

describe('role permissions', () => {
	describe('categorias', () => {
		it('ADMIN pode criar, editar e apagar categorias', () => {
			for (const action of CATEGORY_ACTIONS) {
				expect(
					adminRole.authorize({ category: [action] }).success,
				).toBe(true);
			}
		});

		// O frontend (/admin + link "Categorias" na sidebar) dá acesso ao
		// MODERATOR, por isso o backend tem de permitir as mesmas operações.
		it('MODERATOR pode criar, editar e apagar categorias', () => {
			for (const action of CATEGORY_ACTIONS) {
				expect(
					moderatorRole.authorize({ category: [action] }).success,
				).toBe(true);
			}
		});

		it('USER não pode gerir categorias', () => {
			for (const action of CATEGORY_ACTIONS) {
				expect(userRole.authorize({ category: [action] }).success).toBe(
					false,
				);
			}
		});
	});

	it('MODERATOR não manage utilizadores (reservado ao ADMIN)', () => {
		expect(moderatorRole.authorize({ user: ['manage'] }).success).toBe(
			false,
		);
		expect(moderatorRole.authorize({ user: ['list'] }).success).toBe(true);
	});

	it('MODERATOR continua a poder moderar anúncios e empresas', () => {
		expect(moderatorRole.authorize({ ad: ['moderate'] }).success).toBe(
			true,
		);
		expect(
			moderatorRole.authorize({ business: ['moderate'] }).success,
		).toBe(true);
	});
});
