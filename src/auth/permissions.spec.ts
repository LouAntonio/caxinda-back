import {
	ac,
	adminRole,
	buildPermissionMatrix,
	moderatorRole,
	userRole,
} from './permissions';

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

	describe('buildPermissionMatrix', () => {
		it('devolve todos os recursos do catálogo', () => {
			const matrix = buildPermissionMatrix();

			expect(matrix.resources.map((r) => r.resource)).toEqual(
				Object.keys(ac.statements),
			);
		});

		it('devolve as 4 roles por ordem crescente de privilégio', () => {
			expect(buildPermissionMatrix().roles).toEqual([
				'USER',
				'PROMOTER',
				'MODERATOR',
				'ADMIN',
			]);
		});

		it('tem uma entrada por role em todos os recursos', () => {
			const matrix = buildPermissionMatrix();

			for (const row of matrix.resources) {
				expect(Object.keys(row.roles).sort()).toEqual(
					[...matrix.roles].sort(),
				);
				for (const name of matrix.roles) {
					expect(Array.isArray(row.roles[name])).toBe(true);
				}
			}
		});

		it('ADMIN tem todas as acções de todos os recursos', () => {
			const matrix = buildPermissionMatrix();

			for (const row of matrix.resources) {
				expect(row.roles.ADMIN).toEqual(row.actions);
			}
			expect(matrix.totals.ADMIN).toBe(
				matrix.resources.reduce((sum, r) => sum + r.actions.length, 0),
			);
		});

		it('USER não tem permissões de gestão de catálogo', () => {
			const matrix = buildPermissionMatrix();
			const byResource = Object.fromEntries(
				matrix.resources.map((r) => [r.resource, r.roles.USER]),
			);

			expect(byResource.ad).toEqual([]);
			expect(byResource.category).toEqual([]);
			expect(byResource.business).toEqual([]);
		});

		it('os totais batem com a soma das linhas', () => {
			const matrix = buildPermissionMatrix();

			for (const name of matrix.roles) {
				const sum = matrix.resources.reduce(
					(total, row) => total + row.roles[name].length,
					0,
				);
				expect(matrix.totals[name]).toBe(sum);
			}
		});

		it('privilegios crescem de USER até ADMIN', () => {
			const { totals } = buildPermissionMatrix();

			expect(totals.USER).toBeLessThan(totals.PROMOTER);
			expect(totals.PROMOTER).toBeLessThan(totals.MODERATOR);
			expect(totals.MODERATOR).toBeLessThanOrEqual(totals.ADMIN);
		});

		// integrity: nenhuma role pode ter uma acção fora do catálogo
		it('nenhuma role tem acções fora do catálogo', () => {
			const matrix = buildPermissionMatrix();

			for (const row of matrix.resources) {
				for (const name of matrix.roles) {
					for (const action of row.roles[name]) {
						expect(row.actions).toContain(action);
					}
				}
			}
		});

		it('não expõe os objectos internos (copy defensiva)', () => {
			const matrix = buildPermissionMatrix();
			const ad = matrix.resources.find((r) => r.resource === 'ad');

			ad?.actions.push('acao-injectada');
			expect(ac.statements.ad).not.toContain('acao-injectada');
		});
	});
});
