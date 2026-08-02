/** SEC-C-4: 프론트엔드 권한 체크 훅 */
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { isModuleEnabled } from "@/lib/authorization";

export interface Permission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

const ALL_TRUE: Permission = { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true };
const ALL_FALSE: Permission = { canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };

export function useAuthorization(module?: string): Permission {
  const { profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const role = profile?.role;
  const moduleEnabled = !module || isModuleEnabled(licenses, module.toUpperCase());

  if (!moduleEnabled) return ALL_FALSE;

  switch (role) {
    case 'admin':
      return ALL_TRUE;
    case 'manager':
      return { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: true, canExport: true };
    case 'editor':
      return { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false };
    case 'viewer':
      return { canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
    default:
      return ALL_FALSE;
  }
}
