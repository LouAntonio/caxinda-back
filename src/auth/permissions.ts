import { createAccessControl, Role } from 'better-auth/plugins/access';

const statements = {
	kyc: ['submit', 'review', 'ban'] as const,
	upload: ['upload', 'delete'] as const,
	ad: ['create', 'edit', 'delete', 'moderate'] as const,
	business: ['create', 'edit', 'delete', 'moderate'] as const,
	category: ['create', 'edit', 'delete'] as const,
	user: ['manage', 'list', 'ban', 'set-role', 'create'] as const,
	review: ['create', 'delete'] as const,
	report: ['create', 'list', 'moderate'] as const,
	plan: ['manage'] as const,
	subscription: ['manage'] as const,
	payment: ['buy', 'submit', 'cancel', 'review', 'manage'] as const,
};

export const ac = createAccessControl(statements);

export const userRole = ac.newRole({
	kyc: ['submit'],
	upload: ['upload'],
	review: ['create', 'delete'],
	report: ['create'],
	payment: ['buy', 'submit', 'cancel'],
});

export const promoterRole = ac.newRole({
	kyc: ['submit'],
	upload: ['upload', 'delete'],
	business: ['create', 'edit', 'delete'],
	review: ['create', 'delete'],
	report: ['create'],
	payment: ['buy', 'submit', 'cancel'],
});

export const moderatorRole = ac.newRole({
	kyc: ['submit', 'review'],
	upload: ['upload', 'delete'],
	ad: ['create', 'edit', 'delete', 'moderate'],
	business: ['create', 'edit', 'delete', 'moderate'],
	category: ['create', 'edit', 'delete'],
	user: ['list', 'ban', 'set-role'],
	review: ['create', 'delete'],
	report: ['create', 'list', 'moderate'],
	plan: ['manage'],
	subscription: ['manage'],
	payment: ['buy', 'submit', 'cancel', 'review'],
});

export const adminRole = ac.newRole({
	kyc: ['submit', 'review', 'ban'],
	upload: ['upload', 'delete'],
	ad: ['create', 'edit', 'delete', 'moderate'],
	business: ['create', 'edit', 'delete', 'moderate'],
	category: ['create', 'edit', 'delete'],
	user: ['manage', 'list', 'ban', 'set-role', 'create'],
	review: ['create', 'delete'],
	report: ['create', 'list', 'moderate'],
	plan: ['manage'],
	subscription: ['manage'],
	payment: ['buy', 'submit', 'cancel', 'review', 'manage'],
});

export const roles: Record<string, Role> = {
	USER: userRole,
	PROMOTER: promoterRole,
	MODERATOR: moderatorRole,
	ADMIN: adminRole,
};

export interface PermissionMatrixResource {
	/** Recurso (ex.: 'ad', 'category'). */
	resource: string;
	/** Todas as acções que o recurso suporta (catálogo). */
	actions: string[];
	/** Acções concedidas a cada role; array vazio quando não tem nenhuma. */
	roles: Record<string, string[]>;
}

export interface PermissionMatrix {
	resources: PermissionMatrixResource[];
	/** Nomes das roles, por ordem crescente de privilégio. */
	roles: string[];
	/** Total de acções concedidas por role. */
	totals: Record<string, number>;
}

/**
 * Matriz de permissões de todas as roles, derivada de `ac.statements` e do
 * `.statements` de cada role. Como é gerada a partir da fonte de verdade,
 * acompanha automaticamente qualquer alteração em `permissions.ts`.
 */
export function buildPermissionMatrix(): PermissionMatrix {
	const roleNames = Object.keys(roles);

	const resources: PermissionMatrixResource[] = Object.entries(
		ac.statements,
	).map(([resource, actions]) => ({
		resource,
		actions: [...actions],
		roles: Object.fromEntries(
			roleNames.map((name) => [
				name,
				[
					...((
						roles[name].statements as Record<
							string,
							readonly string[] | undefined
						>
					)[resource] ?? []),
				],
			]),
		),
	}));

	const totals = Object.fromEntries(
		roleNames.map((name) => [
			name,
			resources.reduce((sum, row) => sum + row.roles[name].length, 0),
		]),
	);

	return { resources, roles: roleNames, totals };
}
