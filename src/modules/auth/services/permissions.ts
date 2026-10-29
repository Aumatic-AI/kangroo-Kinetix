export const PERMISSIONS = {
  MANAGE_WORKSPACE: 'manage:workspace',
  MANAGE_BILLING: 'manage:billing',
  MANAGE_USERS: 'manage:users',
  CREATE_CAMPAIGN: 'create:campaign',
  VIEW_ANALYTICS: 'view:analytics',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export function hasPermission(role: string, permission: Permission): boolean {
  // Simple role-based permission check
  if (role === 'admin') return true;
  if (role === 'editor' && permission !== PERMISSIONS.MANAGE_BILLING) return true;
  if (role === 'viewer' && permission === PERMISSIONS.VIEW_ANALYTICS) return true;
  return false;
}
