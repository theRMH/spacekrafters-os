import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CRMProvider } from './context/CRMContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { SidebarNavigation } from './components/navigation/SidebarNavigation'
import { NavigationBar } from './components/navigation/NavigationBar'
import LoginScreen from './screens/Login/LoginScreen'
import DashboardScreen from './screens/Dashboard/DashboardScreen'
import OutstandingProjectDetailScreen from './screens/Dashboard/OutstandingProjectDetailScreen'
import SalesPersonDetailScreen from './screens/Dashboard/SalesPersonDetailScreen'
import MyTaskScreen from './screens/MyTasks/MyTaskScreen'
import MyProjectDetailScreen from './screens/MyTasks/MyProjectDetailScreen'
import SettingsScreen from './screens/Settings/SettingsScreen'
import UserManagementScreen from './screens/Settings/UserManagementScreen'
import AttendanceSettingsScreen from './screens/Settings/AttendanceSettingsScreen'
import LeadsScreen from './screens/Leads/LeadsScreen'
import LeadDetailScreen from './screens/Leads/LeadDetailScreen'
import AppointmentsScreen from './screens/Appointments/AppointmentsScreen'
import FollowUpsScreen from './screens/FollowUps/FollowUpsScreen'
import SiteVisitsScreen from './screens/SiteVisits/SiteVisitsScreen'
import RequirementsScreen from './screens/Requirements/RequirementsScreen'
import QuotationsScreen from './screens/Quotations/QuotationsScreen'
import ProjectsScreen from './screens/Projects/ProjectsScreen'
import ProjectWorkspaceScreen from './screens/ProjectWorkspace/ProjectWorkspaceScreen'
import TaskDetailScreen from './screens/ProjectWorkspace/TaskDetailScreen'
import LeaveScreen from './screens/Leave/LeaveScreen'
import WeeklyPlannerScreen from './screens/WeeklyPlanner/WeeklyPlannerScreen'
import DailyTasksScreen from './screens/DailyTasks/DailyTasksScreen'
import AttendanceScreen from './screens/Attendance/AttendanceScreen'
import DesignCenterScreen from './screens/Design/DesignCenterScreen'
import DailyDiaryScreen from './screens/DailyDiary/DailyDiaryScreen'
import TasksScreen from './screens/Tasks/TasksScreen'
import GanttListScreen from './screens/Gantt/GanttListScreen'
import VendorMasterScreen from './screens/Procurement/VendorMasterScreen'
import MRFScreen from './screens/MRF/MRFScreen'
import VendorLabourScreen from './screens/VendorLabour/VendorLabourScreen'
import DailyReportScreen from './screens/DailyReport/DailyReportScreen'
import ApprovalScreen from './screens/Approval/ApprovalScreen'
import ClientMasterScreen from './screens/Clients/ClientMasterScreen'
import ProcurementScreen from './screens/Procurement/ProcurementScreen'
import ExpenseRequestScreen from './screens/Expenses/ExpenseRequestScreen'
import CompanyAccountsScreen from './screens/Finance/CompanyAccountsScreen'
import ReceivablesScreen from './screens/Finance/ReceivablesScreen'
import PayablesScreen from './screens/Finance/PayablesScreen'
import StatementImportScreen from './screens/Finance/StatementImportScreen'
import ReportsScreen from './screens/Reports/ReportsScreen'
import SiteVisitReportScreen from './screens/Reports/SiteVisitReportScreen'
import FilesScreen from './screens/Files/FilesScreen'
import AuditLogScreen from './screens/Settings/AuditLogScreen'
import PersonalFinanceScreen from './screens/PersonalFinance/PersonalFinanceScreen'
import PersonalCategoriesScreen from './screens/PersonalFinance/PersonalCategoriesScreen'
import PersonalCommitmentsScreen from './screens/PersonalFinance/PersonalCommitmentsScreen'
import PersonalInvestmentsScreen from './screens/PersonalFinance/PersonalInvestmentsScreen'
import PersonalPlansScreen from './screens/PersonalFinance/PersonalPlansScreen'
import PersonalReportsScreen from './screens/PersonalFinance/PersonalReportsScreen'
import PersonalCalendarScreen from './screens/PersonalFinance/PersonalCalendarScreen'
import CombinedFinanceScreen from './screens/PersonalFinance/CombinedFinanceScreen'
import ProductSalesScreen from './screens/ProductSales/ProductSalesScreen'
import ProductSaleDetailScreen from './screens/ProductSales/ProductSaleDetailScreen'
import { getDefaultRoute } from './utils/permissions'

function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-[#0F2A4A] rounded-full animate-spin" />
    </div>
  )
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:pl-[260px]">
      <SidebarNavigation />
      {children}
      <NavigationBar />
    </div>
  )
}

function AuthedRoutes() {
  const { isAuthReady, isLoggedIn, user } = useAuth()

  if (!isAuthReady) return <AppLoadingScreen />

  // Every role's real landing page is role-specific (see getDefaultRoute) —
  // owner lands on /dashboard, everyone else on /my-tasks. The PWA's
  // start_url is bare "/", which has no route of its own and falls through
  // to the catch-all below, and the /login route hits this same question for
  // an already-logged-in visitor.
  const defaultRoute = isLoggedIn && user ? getDefaultRoute(user.role) : '/login'

  return (
    <Routes>
      <Route
        path="/login"
        element={isLoggedIn ? <Navigate to={defaultRoute} replace /> : <LoginScreen />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute screenPath="dashboard">
            <AppShell><DashboardScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/outstanding/:projectId"
        element={
          <ProtectedRoute screenPath="dashboard">
            <AppShell><OutstandingProjectDetailScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/sales/:personName"
        element={
          <ProtectedRoute screenPath="dashboard">
            <AppShell><SalesPersonDetailScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-tasks"
        element={
          <ProtectedRoute screenPath="my-tasks">
            <AppShell><MyTaskScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-tasks/project/:projectId"
        element={
          <ProtectedRoute screenPath="my-tasks">
            <AppShell><MyProjectDetailScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute screenPath="settings">
            <AppShell><SettingsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/users"
        element={
          <ProtectedRoute screenPath="settings/users">
            <AppShell><UserManagementScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/attendance"
        element={
          <ProtectedRoute screenPath="settings/attendance">
            <AppShell><AttendanceSettingsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute screenPath="leads">
            <AppShell><LeadsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/:id"
        element={
          <ProtectedRoute screenPath="leads">
            <AppShell><LeadDetailScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute screenPath="appointments">
            <AppShell><AppointmentsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/follow-ups"
        element={
          <ProtectedRoute screenPath="follow-ups">
            <AppShell><FollowUpsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/site-visits"
        element={
          <ProtectedRoute screenPath="site-visits">
            <AppShell><SiteVisitsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/requirements"
        element={
          <ProtectedRoute screenPath="requirements">
            <AppShell><RequirementsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotations"
        element={
          <ProtectedRoute screenPath="quotations">
            <AppShell><QuotationsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute screenPath="projects">
            <AppShell><ProjectsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute screenPath="project-workspace">
            <AppShell><ProjectWorkspaceScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/tasks/:taskId"
        element={
          <ProtectedRoute screenPath="project-workspace">
            <AppShell><TaskDetailScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute screenPath="tasks">
            <AppShell><TasksScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gantt"
        element={
          <ProtectedRoute screenPath="gantt">
            <AppShell><GanttListScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/procurement"
        element={
          <ProtectedRoute screenPath="procurement">
            <AppShell><ProcurementScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendors"
        element={
          <ProtectedRoute screenPath="vendors">
            <AppShell><VendorMasterScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mrf"
        element={
          <ProtectedRoute screenPath="mrf">
            <AppShell><MRFScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendors-labour"
        element={
          <ProtectedRoute screenPath="vendors-labour">
            <AppShell><VendorLabourScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-reports"
        element={
          <ProtectedRoute screenPath="daily-reports">
            <AppShell><DailyReportScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/approval"
        element={
          <ProtectedRoute screenPath="approval">
            <AppShell><ApprovalScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute screenPath="clients">
            <AppShell><ClientMasterScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute screenPath="expenses">
            <AppShell><ExpenseRequestScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/company-accounts"
        element={
          <ProtectedRoute screenPath="company-accounts">
            <AppShell><CompanyAccountsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/receivables"
        element={
          <ProtectedRoute screenPath="receivables">
            <AppShell><ReceivablesScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payables"
        element={
          <ProtectedRoute screenPath="payables">
            <AppShell><PayablesScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute screenPath="audit-log">
            <AppShell><AuditLogScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute screenPath="reports">
            <AppShell><ReportsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/site-visit-report"
        element={
          <ProtectedRoute screenPath="site-visit-report">
            <AppShell><SiteVisitReportScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/files"
        element={
          <ProtectedRoute screenPath="files">
            <AppShell><FilesScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statement-import"
        element={
          <ProtectedRoute screenPath="statement-import">
            <AppShell><StatementImportScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-diary"
        element={
          <ProtectedRoute screenPath="daily-diary">
            <AppShell><DailyDiaryScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/design"
        element={
          <ProtectedRoute screenPath="design">
            <AppShell><DesignCenterScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave"
        element={
          <ProtectedRoute screenPath="leave">
            <AppShell><LeaveScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/weekly-planner"
        element={
          <ProtectedRoute screenPath="weekly-planner">
            <AppShell><WeeklyPlannerScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-tasks"
        element={
          <ProtectedRoute screenPath="daily-tasks">
            <AppShell><DailyTasksScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute screenPath="attendance">
            <AppShell><AttendanceScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-finance"
        element={
          <ProtectedRoute screenPath="personal-finance">
            <AppShell><PersonalFinanceScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-categories"
        element={
          <ProtectedRoute screenPath="personal-categories">
            <AppShell><PersonalCategoriesScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-commitments"
        element={
          <ProtectedRoute screenPath="personal-commitments">
            <AppShell><PersonalCommitmentsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-investments"
        element={
          <ProtectedRoute screenPath="personal-investments">
            <AppShell><PersonalInvestmentsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-plans"
        element={
          <ProtectedRoute screenPath="personal-plans">
            <AppShell><PersonalPlansScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-reports"
        element={
          <ProtectedRoute screenPath="personal-reports">
            <AppShell><PersonalReportsScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal-calendar"
        element={
          <ProtectedRoute screenPath="personal-calendar">
            <AppShell><PersonalCalendarScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/combined-finance"
        element={
          <ProtectedRoute screenPath="combined-finance">
            <AppShell><CombinedFinanceScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/product-sales"
        element={
          <ProtectedRoute screenPath="product-sales">
            <AppShell><ProductSalesScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/product-sales/:leadId"
        element={
          <ProtectedRoute screenPath="product-sales/project">
            <AppShell><ProductSaleDetailScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CRMProvider>
            <AuthedRoutes />
          </CRMProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
