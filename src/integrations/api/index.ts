/**
 * 자체 백엔드 API 클라이언트 통합 export.
 *
 * 사용 예 (마이그레이션 후 표준 패턴):
 *
 *   import { authApi, codeMasterApi } from "@/integrations/api";
 *
 *   const user = await authApi.login(email, password);
 *   const codes = await codeMasterApi.list({ group_code: "VEHICLE_TYPE" });
 *
 * Supabase 호환 shim이 필요한 경우(점진적 마이그레이션 중):
 *
 *   import { supabase } from "@/integrations/api/supabase-compat";
 *
 *   // 기존 supabase.from('code_master').select('*') 호출이 그대로 동작
 */
export { apiClient, ApiError } from "./client";
export type { ApiClient } from "./client";

export { authApi } from "./auth";
export type { AuthUser } from "./auth";

export { codeMasterApi } from "./code-master";
export type {
  CodeMasterRow,
  CodeMasterListQuery,
  CodeMasterCreateInput,
  CodeMasterUpdateInput,
  ListResult,
} from "./code-master";

export { filesApi } from "./files";
