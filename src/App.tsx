import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import LoginPage from "./pages/Login";
import LotsPage from "./pages/Lots";
import LotNewPage from "./pages/LotNew";
import LotDetailPage from "./pages/LotDetail";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/lots" element={<ProtectedRoute><LotsPage /></ProtectedRoute>} />
    <Route path="/lots/new" element={<ProtectedRoute><LotNewPage /></ProtectedRoute>} />
    <Route path="/lots/:id" element={<ProtectedRoute><LotDetailPage /></ProtectedRoute>} />
    <Route path="/surveys" element={<ProtectedRoute><SurveysPage /></ProtectedRoute>} />
    <Route path="/surveys/progress" element={<ProtectedRoute><SurveyProgressPage /></ProtectedRoute>} />
    <Route path="/surveys/:id" element={<ProtectedRoute><SurveyWizardPage /></ProtectedRoute>} />
    <Route path="/surveys/:id/review" element={<ProtectedRoute><SurveyReviewPage /></ProtectedRoute>} />
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
    <Route path="/revenue" element={<ProtectedRoute><RevenueDashboard /></ProtectedRoute>} />
    <Route path="/revenue/daily" element={<ProtectedRoute><RevenueDaily /></ProtectedRoute>} />
    <Route path="/revenue/reconcile" element={<ProtectedRoute><RevenueReconcile /></ProtectedRoute>} />
    <Route path="/revenue/analysis" element={<ProtectedRoute><RevenueAnalysis /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
