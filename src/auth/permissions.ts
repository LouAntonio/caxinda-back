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
	payment: [
		'buy',
		'submit',
		'cancel',
		'review',
		'release',
		'manage',
	] as const,
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
	user: ['list', 'ban', 'set-role'],
	review: ['create', 'delete'],
	report: ['create', 'list', 'moderate'],
	plan: ['manage'],
	subscription: ['manage'],
	payment: ['buy', 'submit', 'cancel', 'review', 'release'],
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
	payment: ['buy', 'submit', 'cancel', 'review', 'release', 'manage'],
});

export const roles: Record<string, Role> = {
	USER: userRole,
	PROMOTER: promoterRole,
	MODERATOR: moderatorRole,
	ADMIN: adminRole,
};
