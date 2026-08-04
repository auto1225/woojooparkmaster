import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { SessionManager } from "@/components/common/SessionManager";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { handleSupabaseError } from "@/lib/api-error-handler";
import { toast } from "sonner";
import { setupOnlineSync } from "@/lib/offline-survey";
import { lazy, Suspense, useEffect } from "react";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { getModuleForPath, hasRequiredRole, isModuleEnabled, minimumRoleForPath } from "@/lib/authorization";
import "@/styles/print.css";
import "@/lib/i18n";

import { HelpPanel } from "./components/help/HelpPanel";
import { OnboardingGuide } from "./components/help/OnboardingGuide";
import { initProductionErrorFilter } from "./lib/error-sanitizer";
import { runSecurityChecks } from "./lib/security-check";

const Index = lazy(() => import("./pages/Index"));
const LoginPage = lazy(() => import("./pages/Login"));
const LotsPage = lazy(() => import("./pages/Lots"));
const LotNewPage = lazy(() => import("./pages/LotNew"));
const LotDetailPage = lazy(() => import("./pages/LotDetail"));
const LotEditPage = lazy(() => import("./pages/LotEdit"));
const SurveysPage = lazy(() => import("./pages/Surveys"));
const SurveyWizardPage = lazy(() => import("./pages/SurveyWizard"));
const SurveyReviewPage = lazy(() => import("./pages/SurveyReview"));
const SurveyProgressPage = lazy(() => import("./pages/SurveyProgress"));
const OpsDashboardPage = lazy(() => import("./pages/ops/OpsDashboard"));
const OpsStaffPage = lazy(() => import("./pages/ops/OpsStaff"));
const OpsContractsPage = lazy(() => import("./pages/ops/OpsContracts"));
const OpsFeesPage = lazy(() => import("./pages/ops/OpsFees"));
const OpsExemptionsPage = lazy(() => import("./pages/ops/OpsExemptions"));
const OpsPassesPage = lazy(() => import("./pages/ops/OpsPasses"));
const OpsEnforcementPage = lazy(() => import("./pages/ops/OpsEnforcement"));
const OpsFreeHoursPage = lazy(() => import("./pages/ops/OpsFreeHours"));
const OpsAbandonedVehicles = lazy(() => import("./pages/ops/OpsAbandonedVehicles"));
const OpsSecurityInspections = lazy(() => import("./pages/ops/OpsSecurityInspections"));
const FacilityDashboard = lazy(() => import("./pages/facility/FacilityDashboard"));
const FacilityEquipment = lazy(() => import("./pages/facility/FacilityEquipment"));
const FacilityMaintenance = lazy(() => import("./pages/facility/FacilityMaintenance"));
const FacilitySchedule = lazy(() => import("./pages/facility/FacilitySchedule"));
const FacilitySafety = lazy(() => import("./pages/facility/FacilitySafety"));
const FacilityMarkings = lazy(() => import("./pages/facility/FacilityMarkings"));
const ParkingLayout = lazy(() => import("./pages/facility/ParkingLayout"));
const FacilityAnalysis = lazy(() => import("./pages/facility/FacilityAnalysis"));
const RevenueDashboard = lazy(() => import("./pages/revenue/RevenueDashboard"));
const RevenueDaily = lazy(() => import("./pages/revenue/RevenueDaily"));
const RevenueReconcile = lazy(() => import("./pages/revenue/RevenueReconcile"));
const RevenueAnalysis = lazy(() => import("./pages/revenue/RevenueAnalysis"));
const RevenuePrintMonthly = lazy(() => import("./pages/revenue/RevenuePrintMonthly"));
const BudgetDashboard = lazy(() => import("./pages/budget/BudgetDashboard"));
const BudgetPlans = lazy(() => import("./pages/budget/BudgetPlans"));
const BudgetExecutions = lazy(() => import("./pages/budget/BudgetExecutions"));
const BudgetTransfers = lazy(() => import("./pages/budget/BudgetTransfers"));
const BudgetAnalysis = lazy(() => import("./pages/budget/BudgetAnalysis"));
const ProcurementDashboard = lazy(() => import("./pages/procurement/ProcurementDashboard"));
const ProcurementProjects = lazy(() => import("./pages/procurement/ProcurementProjects"));
const ProcurementProjectNew = lazy(() => import("./pages/procurement/ProcurementProjectNew"));
const ProcurementProjectDetail = lazy(() => import("./pages/procurement/ProcurementProjectDetail"));
const ProcurementContracts = lazy(() => import("./pages/procurement/ProcurementContracts"));
const ProcurementDocuments = lazy(() => import("./pages/procurement/ProcurementDocuments"));
const ServiceDashboard = lazy(() => import("./pages/service/ServiceDashboard"));
const ServiceProjects = lazy(() => import("./pages/service/ServiceProjects"));
const ServiceProjectNew = lazy(() => import("./pages/service/ServiceProjectNew"));
const ServiceProjectDetail = lazy(() => import("./pages/service/ServiceProjectDetail"));
const ServiceInspections = lazy(() => import("./pages/service/ServiceInspections"));
const ServicePayments = lazy(() => import("./pages/service/ServicePayments"));
const ServiceIssues = lazy(() => import("./pages/service/ServiceIssues"));
const ComplaintDashboard = lazy(() => import("./pages/complaint/ComplaintDashboard"));
const ComplaintNew = lazy(() => import("./pages/complaint/ComplaintNew"));
const ComplaintDetail = lazy(() => import("./pages/complaint/ComplaintDetail"));
const ComplaintStats = lazy(() => import("./pages/complaint/ComplaintStats"));
const PlanningDashboard = lazy(() => import("./pages/planning/PlanningDashboard"));
const PlanningDecisionCenter = lazy(() => import("./pages/planning/PlanningDecisionCenter"));
const PlanningSites = lazy(() => import("./pages/planning/PlanningSites"));
const PlanningProjects = lazy(() => import("./pages/planning/PlanningProjects"));
const PlanningProjectDetail = lazy(() => import("./pages/planning/PlanningProjectDetail"));
const PlanningDocuments = lazy(() => import("./pages/planning/PlanningDocuments"));
const PlanningPermits = lazy(() => import("./pages/planning/PlanningPermits"));
const PlanningProcedures = lazy(() => import("./pages/planning/PlanningProcedures"));
const RealtimeDashboard = lazy(() => import("./pages/realtime/RealtimeDashboard"));
const RealtimeSensors = lazy(() => import("./pages/realtime/RealtimeSensors"));
const RealtimeGateways = lazy(() => import("./pages/realtime/RealtimeGateways"));
const RealtimeDisplays = lazy(() => import("./pages/realtime/RealtimeDisplays"));
const RealtimeApi = lazy(() => import("./pages/realtime/RealtimeApi"));
const RealtimeMonitor = lazy(() => import("./pages/realtime/RealtimeMonitor"));
const ReportCenter = lazy(() => import("./pages/report/ReportCenter"));
const ReportGenerate = lazy(() => import("./pages/report/ReportGenerate"));
const ReportHistory = lazy(() => import("./pages/report/ReportHistory"));
const ReportSchedules = lazy(() => import("./pages/report/ReportSchedules"));
const DashboardBuilder = lazy(() => import("./pages/report/DashboardBuilder"));
const ParkingRanking = lazy(() => import("./pages/report/ParkingRanking"));
const ExecutiveDashboard = lazy(() => import("./pages/report/ExecutiveDashboard"));
const LotsPrintSummary = lazy(() => import("./pages/report/LotsPrintSummary"));
const QuarterlyReport = lazy(() => import("./pages/report/QuarterlyReport"));
const SurveyPrint = lazy(() => import("./pages/SurveyPrint"));
const ApprovalsPage = lazy(() => import("./pages/Approvals"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const ActivityAnalyticsPage = lazy(() => import("./pages/settings/ActivityAnalytics"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const HelpPage = lazy(() => import("./pages/Help"));
const DeliveryChecklist = lazy(() => import("./pages/admin/DeliveryChecklist"));
const SecurityReview = lazy(() => import("./pages/admin/SecurityReview"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const PrivacyPage = lazy(() => import("./pages/Privacy"));
const ForbiddenPage = lazy(() => import("./pages/Forbidden"));
const SecurityReport = lazy(() => import("./pages/settings/SecurityReport"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MasterHub = lazy(() => import("./pages/MasterHub"));
const DynamicMasterView = lazy(() => import("./pages/DynamicMasterView"));
const DocumentsPage = lazy(() => import("./pages/Documents"));
const DocumentDetailPage = lazy(() => import("./pages/DocumentDetail"));
const TeamWorkCenter = lazy(() => import("./pages/TeamWorkCenter"));
const TeamDuties = lazy(() => import("./pages/TeamDuties"));
const BusinessCards = lazy(() => import("./pages/BusinessCards"));
const SecurityDiagnosisBanner = lazy(() => import("./pages/settings/SecurityManagement").then((module) => ({
  default: module.SecurityDiagnosisBanner,
})));

// SEC-C-2: 프로덕션 에러 필터링 초기화
initProductionErrorFilter();
// SEC-WEB-5: 프론트엔드 보안 체크
runSecurityChecks();
// SEC-WEB-4: 토큰 보안 초기화

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 429) return false; // SEC-WEB-3: 429는 재시도 안 함
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
    mutations: {
      onError: (error: any) => {
        toast.error(handleSupabaseError(error));
      },
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const moduleCode = getModuleForPath(location.pathname);
  const { data: licenses, isLoading: licensesLoading } = useModuleLicenses();
  if (loading || (user && !profile) || (moduleCode && licensesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRequiredRole(profile?.role, minimumRoleForPath(location.pathname))) {
    return <Navigate to="/403" replace />;
  }
  if (moduleCode && !isModuleEnabled(licenses, moduleCode)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="화면 불러오는 중">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

const AppRoutes = () => (
  <Suspense fallback={<RouteLoading />}>
    <Routes>
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/403" element={<ForbiddenPage />} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/master" element={<ProtectedRoute><MasterHub /></ProtectedRoute>} />
    <Route path="/master/:moduleCode" element={<ProtectedRoute><DynamicMasterView /></ProtectedRoute>} />
    <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
    <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetailPage /></ProtectedRoute>} />
    <Route path="/team-work" element={<ProtectedRoute><TeamWorkCenter /></ProtectedRoute>} />
    <Route path="/team-work/duties" element={<ProtectedRoute><TeamDuties /></ProtectedRoute>} />
    <Route path="/business-cards" element={<ProtectedRoute><BusinessCards /></ProtectedRoute>} />
    <Route path="/lots" element={<ProtectedRoute><LotsPage /></ProtectedRoute>} />
    <Route path="/lots/new" element={<ProtectedRoute><LotNewPage /></ProtectedRoute>} />
    <Route path="/lots/:id" element={<ProtectedRoute><LotDetailPage /></ProtectedRoute>} />
    <Route path="/lots/:id/edit" element={<ProtectedRoute><LotEditPage /></ProtectedRoute>} />
    <Route path="/surveys" element={<ProtectedRoute><SurveysPage /></ProtectedRoute>} />
    <Route path="/surveys/progress" element={<ProtectedRoute><SurveyProgressPage /></ProtectedRoute>} />
    <Route path="/surveys/:id" element={<ProtectedRoute><SurveyWizardPage /></ProtectedRoute>} />
    <Route path="/surveys/:id/review" element={<ProtectedRoute><SurveyReviewPage /></ProtectedRoute>} />
    <Route path="/surveys/:id/print" element={<ProtectedRoute><SurveyPrint /></ProtectedRoute>} />
    <Route path="/ops" element={<ProtectedRoute><OpsDashboardPage /></ProtectedRoute>} />
    <Route path="/ops/staff" element={<ProtectedRoute><OpsStaffPage /></ProtectedRoute>} />
    <Route path="/ops/contracts" element={<ProtectedRoute><OpsContractsPage /></ProtectedRoute>} />
    <Route path="/ops/fees" element={<ProtectedRoute><OpsFeesPage /></ProtectedRoute>} />
    <Route path="/ops/exemptions" element={<ProtectedRoute><OpsExemptionsPage /></ProtectedRoute>} />
    <Route path="/ops/passes" element={<ProtectedRoute><OpsPassesPage /></ProtectedRoute>} />
    <Route path="/ops/enforcement" element={<ProtectedRoute><OpsEnforcementPage /></ProtectedRoute>} />
    <Route path="/ops/free-hours" element={<ProtectedRoute><OpsFreeHoursPage /></ProtectedRoute>} />
    <Route path="/ops/abandoned-vehicles" element={<ProtectedRoute><OpsAbandonedVehicles /></ProtectedRoute>} />
    <Route path="/ops/security-inspections" element={<ProtectedRoute><OpsSecurityInspections /></ProtectedRoute>} />
    <Route path="/ops/report" element={<ProtectedRoute><Navigate to="/reports/generate?template=RPT-OPS-STATUS&scope=operations" replace /></ProtectedRoute>} />
    <Route path="/facility" element={<ProtectedRoute><FacilityDashboard /></ProtectedRoute>} />
    <Route path="/facility/equipment" element={<ProtectedRoute><FacilityEquipment /></ProtectedRoute>} />
    <Route path="/facility/maintenance" element={<ProtectedRoute><FacilityMaintenance /></ProtectedRoute>} />
    <Route path="/facility/schedule" element={<ProtectedRoute><FacilitySchedule /></ProtectedRoute>} />
    <Route path="/facility/safety" element={<ProtectedRoute><FacilitySafety /></ProtectedRoute>} />
    <Route path="/facility/markings" element={<ProtectedRoute><FacilityMarkings /></ProtectedRoute>} />
    <Route path="/facility/layout/:lotId" element={<ProtectedRoute><ParkingLayout /></ProtectedRoute>} />
    <Route path="/revenue" element={<ProtectedRoute><RevenueDashboard /></ProtectedRoute>} />
    <Route path="/revenue/daily" element={<ProtectedRoute><RevenueDaily /></ProtectedRoute>} />
    <Route path="/revenue/reconcile" element={<ProtectedRoute><RevenueReconcile /></ProtectedRoute>} />
    <Route path="/revenue/analysis" element={<ProtectedRoute><RevenueAnalysis /></ProtectedRoute>} />
    <Route path="/budget" element={<ProtectedRoute><BudgetDashboard /></ProtectedRoute>} />
    <Route path="/budget/plans" element={<ProtectedRoute><BudgetPlans /></ProtectedRoute>} />
    <Route path="/budget/plans/:id" element={<ProtectedRoute><BudgetPlans /></ProtectedRoute>} />
    <Route path="/budget/executions" element={<ProtectedRoute><BudgetExecutions /></ProtectedRoute>} />
    <Route path="/budget/transfers" element={<ProtectedRoute><BudgetTransfers /></ProtectedRoute>} />
    <Route path="/procurement" element={<ProtectedRoute><ProcurementDashboard /></ProtectedRoute>} />
    <Route path="/procurement/projects" element={<ProtectedRoute><ProcurementProjects /></ProtectedRoute>} />
    <Route path="/procurement/projects/new" element={<ProtectedRoute><ProcurementProjectNew /></ProtectedRoute>} />
    <Route path="/procurement/projects/:id" element={<ProtectedRoute><ProcurementProjectDetail /></ProtectedRoute>} />
    <Route path="/procurement/contracts" element={<ProtectedRoute><ProcurementContracts /></ProtectedRoute>} />
    <Route path="/procurement/documents" element={<ProtectedRoute><ProcurementDocuments /></ProtectedRoute>} />
    <Route path="/service" element={<ProtectedRoute><ServiceDashboard /></ProtectedRoute>} />
    <Route path="/service/projects" element={<ProtectedRoute><ServiceProjects /></ProtectedRoute>} />
    <Route path="/service/projects/new" element={<ProtectedRoute><ServiceProjectNew /></ProtectedRoute>} />
    <Route path="/service/projects/:id" element={<ProtectedRoute><ServiceProjectDetail /></ProtectedRoute>} />
    <Route path="/service/inspections" element={<ProtectedRoute><ServiceInspections /></ProtectedRoute>} />
    <Route path="/service/payments" element={<ProtectedRoute><ServicePayments /></ProtectedRoute>} />
    <Route path="/service/issues" element={<ProtectedRoute><ServiceIssues /></ProtectedRoute>} />
    <Route path="/complaints" element={<ProtectedRoute><ComplaintDashboard /></ProtectedRoute>} />
    <Route path="/complaints/new" element={<ProtectedRoute><ComplaintNew /></ProtectedRoute>} />
    <Route path="/complaints/stats" element={<ProtectedRoute><ComplaintStats /></ProtectedRoute>} />
    <Route path="/complaints/:id" element={<ProtectedRoute><ComplaintDetail /></ProtectedRoute>} />
    <Route path="/planning" element={<ProtectedRoute><PlanningDashboard /></ProtectedRoute>} />
    <Route path="/planning/decisions" element={<ProtectedRoute><PlanningDecisionCenter /></ProtectedRoute>} />
    <Route path="/planning/sites" element={<ProtectedRoute><PlanningSites /></ProtectedRoute>} />
    <Route path="/planning/projects" element={<ProtectedRoute><PlanningProjects /></ProtectedRoute>} />
    <Route path="/planning/projects/:id" element={<ProtectedRoute><PlanningProjectDetail /></ProtectedRoute>} />
    <Route path="/planning/documents" element={<ProtectedRoute><PlanningDocuments /></ProtectedRoute>} />
    <Route path="/planning/permits" element={<ProtectedRoute><PlanningPermits /></ProtectedRoute>} />
    <Route path="/planning/procedures" element={<ProtectedRoute><PlanningProcedures /></ProtectedRoute>} />
    <Route path="/realtime" element={<ProtectedRoute><RealtimeDashboard /></ProtectedRoute>} />
    <Route path="/realtime/sensors" element={<ProtectedRoute><RealtimeSensors /></ProtectedRoute>} />
    <Route path="/realtime/gateways" element={<ProtectedRoute><RealtimeGateways /></ProtectedRoute>} />
    <Route path="/realtime/displays" element={<ProtectedRoute><RealtimeDisplays /></ProtectedRoute>} />
    <Route path="/realtime/api" element={<ProtectedRoute><RealtimeApi /></ProtectedRoute>} />
    <Route path="/realtime/monitor" element={<ProtectedRoute><RealtimeMonitor /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><ReportCenter /></ProtectedRoute>} />
    <Route path="/reports/generate" element={<ProtectedRoute><ReportGenerate /></ProtectedRoute>} />
    <Route path="/reports/history" element={<ProtectedRoute><ReportHistory /></ProtectedRoute>} />
    <Route path="/reports/schedules" element={<ProtectedRoute><ReportSchedules /></ProtectedRoute>} />
    <Route path="/reports/dashboard-builder" element={<ProtectedRoute><DashboardBuilder /></ProtectedRoute>} />
    <Route path="/reports/ranking" element={<ProtectedRoute><ParkingRanking /></ProtectedRoute>} />
    <Route path="/reports/executive" element={<ProtectedRoute><ExecutiveDashboard /></ProtectedRoute>} />
    <Route path="/reports/print-quarterly" element={<ProtectedRoute><QuarterlyReport /></ProtectedRoute>} />
    <Route path="/budget/analysis" element={<ProtectedRoute><BudgetAnalysis /></ProtectedRoute>} />
    <Route path="/facility/analysis" element={<ProtectedRoute><FacilityAnalysis /></ProtectedRoute>} />
    <Route path="/lots/print-summary" element={<ProtectedRoute><LotsPrintSummary /></ProtectedRoute>} />
    <Route path="/revenue/print-monthly" element={<ProtectedRoute><RevenuePrintMonthly /></ProtectedRoute>} />
    <Route path="/approvals" element={<ProtectedRoute><ApprovalsPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/settings/analytics" element={<ProtectedRoute><ActivityAnalyticsPage /></ProtectedRoute>} />
    <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
    <Route path="/admin/delivery-checklist" element={<ProtectedRoute><DeliveryChecklist /></ProtectedRoute>} />
    <Route path="/admin/security-review" element={<ProtectedRoute><SecurityReview /></ProtectedRoute>} />
    <Route path="/settings/security/report" element={<ProtectedRoute><SecurityReport /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

function AppWithSync() {
  useEffect(() => {
    const cleanup = setupOnlineSync();
    return cleanup;
  }, []);
  return (
    <>
      <Suspense fallback={null}>
        <SecurityDiagnosisBanner />
      </Suspense>
      <AppRoutes />
      <HelpPanel />
      <OnboardingGuide />
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SessionManager />
            <GlobalSearch />
            <AppWithSync />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
