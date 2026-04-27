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

export { profilesApi } from "./profiles";
export type {
  ProfileRow,
  ProfileListQuery,
  ProfileSelfUpdate,
  ProfileAdminUpdate,
} from "./profiles";

export { parkingLotsApi } from "./parking-lots";
export type {
  ParkingLotRow,
  ParkingSpaceRow,
  ParkingLotWithSpaces,
  ParkingLotListQuery,
  ParkingLotCreateInput,
  ParkingLotUpdateInput,
  LotType,
  OperatorType,
  SurfaceType,
  PowerStatus,
  LotStatus,
  SpaceType,
} from "./parking-lots";

export { revenueDailyApi } from "./revenue-daily";
export type {
  RevenueDailyRow,
  RevenueDailyListQuery,
  RevenueDailyCreateInput,
  RevenueDailyUpdateInput,
} from "./revenue-daily";

export { complaintsApi } from "./complaints";
export type {
  ComplaintRow,
  ComplaintListQuery,
  ComplaintCreateInput,
  ComplaintUpdateInput,
  ComplaintPriority,
  ComplaintStatus,
} from "./complaints";

export { budgetPlansApi, budgetItemsApi } from "./budget";
export type {
  BudgetPlanRow,
  BudgetItemRow,
  BudgetPlanWithItems,
  BudgetPlanListQuery,
  BudgetItemListQuery,
  BudgetPlanCreateInput,
  BudgetPlanUpdateInput,
  BudgetItemCreateInput,
  BudgetItemUpdateInput,
} from "./budget";

export { notificationsApi } from "./notifications";
export type {
  NotificationRow,
  NotificationListQuery,
  NotificationCreateInput,
} from "./notifications";

export { surveysApi } from "./surveys";
export type {
  SurveyRow,
  SurveyStatus,
  SurveyListQuery,
  SurveyCreateInput,
  SurveyUpdateInput,
} from "./surveys";

export { equipmentApi } from "./equipment";
export type {
  EquipmentRow,
  EquipmentListQuery,
  EquipmentCreateInput,
  EquipmentUpdateInput,
} from "./equipment";

export { systemConfigApi } from "./system-config";
export type { SystemConfigRow } from "./system-config";

export { feePoliciesApi } from "./fee-policies";
export type {
  FeePolicyRow,
  FeePolicyListQuery,
  FeePolicyCreateInput,
  FeePolicyUpdateInput,
} from "./fee-policies";

export { securityAuditApi, activeSessionsApi } from "./security-audit";
export type {
  SecurityAuditLogRow,
  SecurityAuditQuery,
  ActiveSessionRow,
  AuditSeverity,
} from "./security-audit";

export { bidProjectsApi } from "./bid-projects";
export type {
  BidProjectRow,
  BidProjectListQuery,
  BidProjectCreateInput,
  BidProjectUpdateInput,
} from "./bid-projects";

export { serviceProjectsApi } from "./service-projects";
export type {
  ServiceProjectRow,
  ServiceProjectListQuery,
  ServiceProjectCreateInput,
  ServiceProjectUpdateInput,
} from "./service-projects";

export { feeExemptionsApi } from "./fee-exemptions";
export type {
  FeeExemptionRow,
  FeeExemptionListQuery,
  FeeExemptionCreateInput,
  FeeExemptionUpdateInput,
} from "./fee-exemptions";

export {
  freeHoursApi,
  monthlyPassesApi,
  surveyPhotosApi,
  outsourcingContractsApi,
  gatewayDevicesApi,
  displayBoardsApi,
  surveyBasicInfoApi,
  surveyOperationApi,
  operationsStaffApi,
  enforcementRecordsApi,
  budgetExecutionsApi,
  bidEvaluationsApi,
  bidContractsApi,
  surveyInfraApi,
  siteCandidatesApi,
  reportGeneratedApi,
  maintenanceLogsApi,
  lotRealtimeStatusApi,
} from "./long-tail";
export type { LotRealtimeStatusRow } from "./long-tail";
export type {
  FreeHoursRow,
  MonthlyPassRow,
  SurveyPhotoRow,
  OutsourcingContractRow,
  GatewayDeviceRow,
  DisplayBoardRow,
  SurveyBasicInfoRow,
  SurveyOperationRow,
} from "./long-tail";
