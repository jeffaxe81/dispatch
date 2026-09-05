export function hasEmbeddedApplicationPermission(
  permissions: readonly string[] | null | undefined,
  permission: "embedded_apps.view" | "embedded_apps.manage",
): boolean {
  if (!permissions) return false;
  return permissions.includes("*") || permissions.includes(permission);
}

export function canViewEmbeddedApplications(
  permissions: readonly string[] | null | undefined,
): boolean {
  return hasEmbeddedApplicationPermission(permissions, "embedded_apps.view");
}

export function canManageEmbeddedApplications(
  permissions: readonly string[] | null | undefined,
): boolean {
  return hasEmbeddedApplicationPermission(permissions, "embedded_apps.manage");
}
