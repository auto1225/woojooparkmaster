export type UserRole = "admin" | "manager" | "editor" | "viewer";

export interface ModuleLicenseLike {
  module_code: string;
  is_active: boolean | null;
  starts_at?: string | null;
  expires_at?: string | null;
}

const MODULE_PREFIXES: Array<[string, string]> = [
  ["/surveys", "SURVEY"],
  ["/ops", "OPS"],
  ["/facility", "FACILITY"],
  ["/revenue", "REVENUE"],
  ["/budget", "BUDGET"],
  ["/procurement", "PROCUREMENT"],
  ["/service", "SERVICE"],
  ["/complaints", "COMPLAINT"],
  ["/planning", "PLANNING"],
  ["/realtime", "REALTIME"],
  ["/reports", "REPORT"],
];

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
};

export function getModuleForPath(pathname: string): string | null {
  return MODULE_PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null;
}

export function isLicenseActive(
  license: ModuleLicenseLike | undefined,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (!license?.is_active) return false;
  if (license.starts_at && license.starts_at > today) return false;
  if (license.expires_at && license.expires_at < today) return false;
  return true;
}

export function isModuleEnabled(
  licenses: ModuleLicenseLike[] | null | undefined,
  moduleCode: string,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (!licenses?.length) return true;
  return isLicenseActive(
    licenses.find((license) => license.module_code === moduleCode),
    today,
  );
}

export function minimumRoleForPath(pathname: string): UserRole {
  if (pathname === "/settings" || pathname.startsWith("/settings/") || pathname.startsWith("/admin/")) return "admin";
  if (pathname.endsWith("/review")) return "manager";
  if (pathname === "/realtime/api") return "admin";
  if (pathname.endsWith("/new") || pathname.endsWith("/edit")) return "editor";
  return "viewer";
}

export function hasRequiredRole(role: string | null | undefined, minimum: UserRole): boolean {
  if (!role || !(role in ROLE_RANK)) return false;
  return ROLE_RANK[role as UserRole] >= ROLE_RANK[minimum];
}
