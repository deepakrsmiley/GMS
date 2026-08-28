import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { checkAuth, clearSession, stopHydrating } from './redux/slices/authSlice';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/LoginPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import BrandingSync from './components/branding/BrandingSync';
import { canAccessRoute } from './constants/navConfig';
import { homePathForUser, isGmsConsoleUser } from './utils/homePath';
import { isSuperAdmin } from './utils/roles';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const GmsAdminPage = lazy(() => import('./pages/GmsAdminPage'));
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'));
const PatientsPage = lazy(() => import('./pages/PatientsPage'));
const PatientProfilePage = lazy(() => import('./pages/PatientProfile/PatientProfilePage'));
const OPQueuePage = lazy(() => import('./pages/OPQueuePage'));
const DoctorConsultationPage = lazy(() => import('./pages/DoctorConsultationPage'));
const IPAdmissionsPage = lazy(() => import('./pages/IPAdmissionsPage'));
const IPAdmissionDetailPage = lazy(() => import('./pages/IPAdmissionDetailPage'));
const NurseStationPage = lazy(() => import('./pages/NurseStationPage'));
const ChangeRequestsPage = lazy(() => import('./pages/ChangeRequestsPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const PharmacyPage = lazy(() => import('./pages/PharmacyPage'));
const PharmacyReportsPage = lazy(() => import('./pages/PharmacyReportsPage'));
const LabPage = lazy(() => import('./pages/LabPage'));
const AssetComplaintPage = lazy(() => import('./pages/AssetComplaintPage'));
const BiomedicalPage = lazy(() => import('./pages/BiomedicalPage'));
const MastersPage = lazy(() => import('./pages/MastersPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const TVQueueDisplayPage = lazy(() => import('./pages/TVQueueDisplayPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'));
const HowToUsePage = lazy(() => import('./pages/HowToUsePage'));

const ProtectedRoute = ({ children, routeKey }) => {
  const { user } = useSelector((s) => s.auth);
  if (!user) return <Navigate to="/login" replace />;
  if (routeKey === 'gms') {
    if (!isSuperAdmin(user)) return <Navigate to="/unauthorized" replace />;
    if (!isGmsConsoleUser(user)) return <Navigate to="/dashboard" replace />;
  }
  if (routeKey && !canAccessRoute(user, `/${routeKey}`)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

const HomeRedirect = () => {
  const { user } = useSelector((s) => s.auth);
  return <Navigate to={homePathForUser(user)} replace />;
};

export default function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(checkAuth());
    const refreshSession = () => {
      if (!localStorage.getItem('hms_token')) return;
      dispatch(checkAuth());
    };
    const onUnauthorized = () => dispatch(clearSession());
    window.addEventListener('focus', refreshSession);
    window.addEventListener('hms:unauthorized', onUnauthorized);
    const timer = setInterval(refreshSession, 30000);
    const bootTimeout = setTimeout(() => dispatch(stopHydrating()), 8000);
    return () => {
      window.removeEventListener('focus', refreshSession);
      window.removeEventListener('hms:unauthorized', onUnauthorized);
      clearInterval(timer);
      clearTimeout(bootTimeout);
    };
  }, [dispatch]);

  return (
    <>
      <BrandingSync />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route path="/queue-display" element={<ProtectedRoute routeKey="queue-display"><TVQueueDisplayPage /></ProtectedRoute>} />

          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            <Route path="/gms" element={<ProtectedRoute routeKey="gms"><GmsAdminPage /></ProtectedRoute>} />
            <Route path="/gms/hospitals" element={<ProtectedRoute routeKey="gms"><OrganizationsPage /></ProtectedRoute>} />

            <Route path="/dashboard" element={<ProtectedRoute routeKey="dashboard"><DashboardPage /></ProtectedRoute>} />
            <Route path="/how-to-use" element={<ProtectedRoute routeKey="how-to-use"><HowToUsePage /></ProtectedRoute>} />
            <Route path="/patients" element={<ProtectedRoute routeKey="patients"><PatientsPage /></ProtectedRoute>} />
            <Route path="/patients/:id/profile" element={<ProtectedRoute routeKey="patients"><PatientProfilePage /></ProtectedRoute>} />
            <Route path="/op-queue" element={<ProtectedRoute routeKey="op-queue"><OPQueuePage /></ProtectedRoute>} />
            <Route path="/consultation/:opId" element={<ProtectedRoute routeKey="consultation"><DoctorConsultationPage /></ProtectedRoute>} />
            <Route path="/ip-admissions" element={<ProtectedRoute routeKey="ip-admissions"><IPAdmissionsPage /></ProtectedRoute>} />
            <Route path="/ip-admissions/:id" element={<ProtectedRoute routeKey="ip-admissions"><IPAdmissionDetailPage /></ProtectedRoute>} />
            <Route path="/nurse-station" element={<ProtectedRoute routeKey="nurse-station"><NurseStationPage /></ProtectedRoute>} />
            <Route path="/change-requests" element={<ProtectedRoute routeKey="change-requests"><ChangeRequestsPage /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute routeKey="billing"><BillingPage /></ProtectedRoute>} />
            <Route path="/pharmacy" element={<ProtectedRoute routeKey="pharmacy"><PharmacyPage /></ProtectedRoute>} />

            <Route path="/pharmacy-reports" element={<ProtectedRoute routeKey="pharmacy-reports"><PharmacyReportsPage /></ProtectedRoute>} />
            <Route path="/pharmacy-billing" element={<Navigate to="/pharmacy-reports" replace />} />
            <Route path="/pharmacy/expiry-report" element={<Navigate to="/pharmacy-reports" replace />} />

            <Route path="/lab" element={<ProtectedRoute routeKey="lab"><LabPage /></ProtectedRoute>} />
            <Route path="/masters" element={<ProtectedRoute routeKey="masters"><MastersPage /></ProtectedRoute>} />
            <Route path="/masters/:section" element={<ProtectedRoute routeKey="masters"><MastersPage /></ProtectedRoute>} />

            <Route path="/beds" element={<Navigate to="/masters/beds" replace />} />
            <Route path="/departments" element={<Navigate to="/masters/departments" replace />} />
            <Route path="/assets" element={<Navigate to="/masters/assets" replace />} />
            <Route path="/staff" element={<Navigate to="/masters/staff" replace />} />
            <Route path="/settings" element={<Navigate to="/masters/branding" replace />} />
            <Route path="/settings/hospital-branding" element={<Navigate to="/masters/branding" replace />} />
            <Route path="/settings/services" element={<Navigate to="/masters/services" replace />} />

            <Route path="/asset-complaints" element={<ProtectedRoute routeKey="asset-complaints"><AssetComplaintPage /></ProtectedRoute>} />
            <Route path="/biomedical" element={<ProtectedRoute routeKey="biomedical"><BiomedicalPage /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute routeKey="appointments"><AppointmentsPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute routeKey="reports"><ReportsPage /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
