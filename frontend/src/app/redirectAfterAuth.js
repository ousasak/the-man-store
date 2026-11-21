export function isAdminUser(user) {
  // Support different backend shapes
  if (!user) return false;

  const role = user.role ? String(user.role).toLowerCase() : "";
  if (role === "admin" || role === "superadmin") return true;

  // common patterns:
  if (user.type && String(user.type).toLowerCase() === "admin") return true;
  if (user.is_admin === true) return true;
  if (user.isAdmin === true) return true;

  // optional: array roles
  if (Array.isArray(user.roles) && user.roles.some((r) => String(r).toLowerCase() === "admin")) return true;

  return false;
}

/** Web/mobile storefront checkout — admins use /admin/checkout (POS). */
export function canPlaceStorefrontOrder(user) {
  return Boolean(user) && !isAdminUser(user);
}

export function redirectAfterAuth(navigate, user) {
  navigate(isAdminUser(user) ? "/admin" : "/", { replace: true });
}
