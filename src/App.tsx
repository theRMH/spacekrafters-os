import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CRMProvider } from './context/CRMContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { SidebarNavigation } from './components/navigation/SidebarNavigation'
import { NavigationBar } from './components/navigation/NavigationBar'
import LoginScreen from './screens/Login/LoginScreen'
import HomeScreen from './screens/Home/HomeScreen'
import SettingsScreen from './screens/Settings/SettingsScreen'
import UserManagementScreen from './screens/Settings/UserManagementScreen'
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
import AttendanceScreen from './screens/Attendance/AttendanceScreen'
import DesignCenterScreen from './screens/Design/DesignCenterScreen'
import DailyDiaryScreen from './screens/DailyDiary/DailyDiaryScreen'
import TasksScreen from './screens/Tasks/TasksScreen'
import GanttListScreen from './screens/Gantt/GanttListScreen'

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
  const { isAuthReady, isLoggedIn } = useAuth()

  if (!isAuthReady) return <AppLoadingScreen />

  return (
    <Routes>
      <Route
        path="/login"
        element={isLoggedIn ? <Navigate to="/home" replace /> : <LoginScreen />}
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute screenPath="home">
            <AppShell><HomeScreen /></AppShell>
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
          <ProtectedRoute screenPath="projects">
            <AppShell><ProjectWorkspaceScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/tasks/:taskId"
        element={
          <ProtectedRoute screenPath="projects">
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
        path="/attendance"
        element={
          <ProtectedRoute screenPath="attendance">
            <AppShell><AttendanceScreen /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isLoggedIn ? '/home' : '/login'} replace />} />
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
