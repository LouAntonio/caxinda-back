import { SetMetadata } from '@nestjs/common';
import { Role } from '../roles';

export const REQUIRED_ROLES_KEY = 'requiredRoles';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

export const Roles = (...roles: Role[]) =>
	SetMetadata(REQUIRED_ROLES_KEY, roles);

export type RequiredPermissions = Record<string, string[]>;

export const RequirePermission = (permissions: RequiredPermissions) =>
	SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
