import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
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
import { useEffect } from "react";
import "@/styles/print.css";
import "@/lib/i18n";

// --- Page imports (unchanged) ---
import Index from "./pages/Index";
import LoginPage from "./pages/Login";
import LotsPage from "./pages/Lots";
import LotNewPage from "./pages/LotNew";
import LotDetailPage from "./pages/LotDetail";
import LotEditPage from "./pages/LotEdit";
import SurveysPage from "./pages/Surveys";
import SurveyWizardPage from "./pages/SurveyWizard";
import SurveyReviewPage from "./pages/SurveyReview";
import SurveyProgressPage from "./pages/SurveyProgress";
import OpsDashboardPage from "./pages/ops/OpsDashboard";
import OpsStaffPage from "./pages/ops/OpsStaff";
import OpsContractsPage from "./pages/ops/OpsContracts";
import OpsFeesPage from "./pages/ops/OpsFees";
import OpsExemptionsPage from "./pages/ops/OpsExemptions";
import OpsPassesPage from "./pages/ops/OpsPasses";
import OpsEnforcementPage from "./pages/ops/OpsEnforcement";
import OpsFreeHoursPage from "./pages/ops/OpsFreeHours";
import FacilityDashboard from "./pages/facility/FacilityDashboard";
import FacilityEquipment from "./pages/facility/FacilityEquipment";
import FacilityMaintenance from "./pages/facility/FacilityMaintenance";
import FacilitySchedule from "./pages/facility/FacilitySchedule";
import FacilitySafety from "./pages/facility/FacilitySafety";
import FacilityMarkings from "./pages/facility/FacilityMarkings";
import RevenueDashboard from "./pages/revenue/RevenueDashboard";
import RevenueDaily from "./pages/revenue/RevenueDaily";
import RevenueReconcile from "./pages/revenue/RevenueReconcile";
import RevenueAnalysis from "./pages/revenue/RevenueAnalysis";
import BudgetDashboard from "./pages/budget/BudgetDashboard";
import BudgetPlans from "./pages/budget/BudgetPlans";
import BudgetExecutions from "./pages/budget/BudgetExecutions";
import BudgetTransfers from "./pages/budget/BudgetTransfers";
import ProcurementDashboard from "./pages/procurement/ProcurementDashboard";
import ProcurementProjects from "./pages/procurement/ProcurementProjects";
import ProcurementProjectNew from "./pages/procurement/ProcurementProjectNew";
import ProcurementProjectDetail from "./pages/procurement/ProcurementProjectDetail";
import ProcurementContracts from "./pages/procurement/ProcurementContracts";
import ProcurementDocuments from "./pages/procurement/ProcurementDocuments";
import ServiceDashboard from "./pages/service/ServiceDashboard";
import ServiceProjects from "./pages/service/ServiceProjects";
import ServiceProjectNew from "./pages/service/ServiceProjectNew";
import ServiceProjectDetail from "./pages/service/ServiceProjectDetail";
import ServiceInspections from "./pages/service/ServiceInspections";
import ServicePayments from "./pages/service/ServicePayments";
import ServiceIssues from "./pages/service/ServiceIssues";
import ComplaintDashboard from "./pages/complaint/ComplaintDashboard";
import ComplaintNew from "./pages/complaint/ComplaintNew";
import ComplaintDetail from "./pages/complaint/ComplaintDetail";
import ComplaintStats from "./pages/complaint/ComplaintStats";
import PlanningDashboard from "./pages/planning/PlanningDashboard";
import PlanningSites from "./pages/planning/PlanningSites";
import PlanningProjects from "./pages/planning/PlanningProjects";
import PlanningProjectDetail from "./pages/planning/PlanningProjectDetail";
import PlanningDocuments from "./pages/planning/PlanningDocuments";
import PlanningPermits from "./pages/planning/PlanningPermits";
import RealtimeDashboard from "./pages/realtime/RealtimeDashboard";
import RealtimeSensors from "./pages/realtime/RealtimeSensors";
import RealtimeGateways from "./pages/realtime/RealtimeGateways";
import RealtimeDisplays from "./pages/realtime/RealtimeDisplays";
import RealtimeApi from "./pages/realtime/RealtimeApi";
import RealtimeMonitor from "./pages/realtime/RealtimeMonitor";
import ReportCenter from "./pages/report/ReportCenter";
import ReportGenerate from "./pages/report/ReportGenerate";
import ReportHistory from "./pages/report/ReportHistory";
import ReportSchedules from "./pages/report/ReportSchedules";
import DashboardBuilder from "./pages/report/DashboardBuilder";
import SurveyPrint from "./pages/SurveyPrint";
import ParkingLayout from "./pages/facility/ParkingLayout";
import ApprovalsPage from "./pages/Approvals";
import NotificationsPage from "./pages/Notifications";
import ProfilePage from "./pages/Profile";
import ActivityAnalyticsPage from "./pages/settings/ActivityAnalytics";
import SettingsPage from "./pages/Settings";
import HelpPage from "./pages/Help";
import DeliveryChecklist from "./pages/admin/DeliveryChecklist";
import SecurityReview from "./pages/admin/SecurityReview";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PrivacyPage from "./pages/Privacy";
import ForbiddenPage from "./pages/Forbidden";
import NotFound from "./pages/NotFound";
import { HelpPanel } from "./components/help/HelpPanel";
import { OnboardingGuide } from "./components/help/OnboardingGuide";
import { SecurityDiagnosisBanner } from "./pages/settings/SecurityManagement";
import { initProductionErrorFilter } from "./lib/error-sanitizer";

// SEC-C-2: 프로덕션 에러 필터링 초기화
initProductionErrorFilter();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
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
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/403" element={<ForbiddenPage />} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
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
    <Route path="/planning/sites" element={<ProtectedRoute><PlanningSites /></ProtectedRoute>} />
    <Route path="/planning/projects" element={<ProtectedRoute><PlanningProjects /></ProtectedRoute>} />
    <Route path="/planning/projects/:id" element={<ProtectedRoute><PlanningProjectDetail /></ProtectedRoute>} />
    <Route path="/planning/documents" element={<ProtectedRoute><PlanningDocuments /></ProtectedRoute>} />
    <Route path="/planning/permits" element={<ProtectedRoute><PlanningPermits /></ProtectedRoute>} />
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
    <Route path="/approvals" element={<ProtectedRoute><ApprovalsPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/settings/analytics" element={<ProtectedRoute><ActivityAnalyticsPage /></ProtectedRoute>} />
    <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
    <Route path="/admin/delivery-checklist" element={<ProtectedRoute><DeliveryChecklist /></ProtectedRoute>} />
    <Route path="/admin/security-review" element={<ProtectedRoute><SecurityReview /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

function AppWithSync() {
  useEffect(() => {
    const cleanup = setupOnlineSync();
    return cleanup;
  }, []);
  return (
    <>
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
