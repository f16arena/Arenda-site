export const CAPABILITY_PERMISSION_PREFIX = "cap:"

export function capabilityPermissionKey(key: string) {
  return `${CAPABILITY_PERMISSION_PREFIX}${key}`
}

export function capabilityKeyFromPermission(permissionKey: string) {
  return permissionKey.startsWith(CAPABILITY_PERMISSION_PREFIX)
    ? permissionKey.slice(CAPABILITY_PERMISSION_PREFIX.length)
    : null
}
