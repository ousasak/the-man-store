import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, hasRole } from '@/utils/permissionUtils';

/**
 * usePermission Hook
 * Checks whether current authenticated user has permission or role
 */
export function usePermission() {
  const user = useAuthStore((state) => state.user);

  return useMemo(
    () => ({
      user,
      can: (permission) => hasPermission(user, permission),
      isRole: (roles) => hasRole(user, Array.isArray(roles) ? roles : [roles]),
      isAdmin: hasRole(user, ['admin', 'superadmin']),
    }),
    [user]
  );
}

export default usePermission;
