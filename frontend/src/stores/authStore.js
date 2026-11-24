import { create } from './createStore';

export const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('auth_user') || 'null'),
  token: localStorage.getItem('auth_token') || null,
  isAuthenticated: !!localStorage.getItem('auth_token'),
  permissions: JSON.parse(localStorage.getItem('auth_permissions') || '[]'),

  login: (userData, token, permissions = []) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(userData));
    localStorage.setItem('auth_permissions', JSON.stringify(permissions));
    set({
      user: userData,
      token,
      permissions,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_permissions');
    set({
      user: null,
      token: null,
      permissions: [],
      isAuthenticated: false,
    });
  },

  hasPermission: (permission) => {
    const { permissions, user } = get();
    if (user?.role === 'admin' || user?.role === 'superadmin') return true;
    return permissions.includes(permission);
  },
}));

export default useAuthStore;
