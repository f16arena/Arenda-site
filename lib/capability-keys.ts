export const CAPABILITY_PERMISSION_PREFIX = "cap:"
export const USER_CAPABILITY_ROLE_PREFIX = "user:"

export function capabilityPermissionKey(key: string) {
  return `${CAPABILITY_PERMISSION_PREFIX}${key}`
}

export function capabilityKeyFromPermission(permissionKey: string) {
  return permissionKey.startsWith(CAPABILITY_PERMISSION_PREFIX)
    ? permissionKey.slice(CAPABILITY_PERMISSION_PREFIX.length)
    : null
}

export function userCapabilityRole(userId: string) {
  return `${USER_CAPABILITY_ROLE_PREFIX}${userId}`
}

export function userIdFromCapabilityRole(role: string) {
  return role.startsWith(USER_CAPABILITY_ROLE_PREFIX)
    ? role.slice(USER_CAPABILITY_ROLE_PREFIX.length)
    : null
}
