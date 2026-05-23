export function getUserRoleName(user) {
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name;
  return typeof roleName === 'string' ? roleName.toLowerCase() : '';
}

export function isFarmerUser(user) {
  return getUserRoleName(user) === 'farmer';
}

export function routeRequiresRegisteredFarm(pathname = '') {
  return (
    pathname === '/' ||
    pathname.startsWith('/crop-management') ||
    pathname.startsWith('/scan') ||
    pathname.startsWith('/disease-detector') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/marketplace')
  );
}
