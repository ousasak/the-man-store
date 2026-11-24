/**
 * Role-Based Access Control (RBAC) and Permission Utilities
 */

export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  STAFF: 'staff',
};

export function hasRole(user, allowedRoles = []) {
  if (!user || !user.role) return false;
  if (user.role === ROLES.SUPERADMIN || user.role === ROLES.ADMIN) return true;
  if (!allowedRoles.length) return true;
  return allowedRoles.includes(user.role);
}

export function hasPermission(user, requiredPermission) {
  if (!user) return false;
  if (user.role === ROLES.SUPERADMIN || user.role === ROLES.ADMIN) return true;
  const userPermissions = user.permissions || [];
  return userPermissions.includes(requiredPermission);
}
