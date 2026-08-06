import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { checkAuth } from './redux/slices/authSlice';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import PatientProfilePage from './pages/PatientProfile/PatientProfilePage';
import OPQueuePage from './pages/OPQueuePage';
import DoctorConsultationPage from './pages/DoctorConsultationPage';
import IPAdmissionsPage from './pages/IPAdmissionsPage';
import IPAdmissionDetailPage from './pages/IPAdmissionDetailPage';
import NurseStationPage from './pages/NurseStationPage';
import ChangeRequestsPage from './pages/ChangeRequestsPage';
import BillingPage from './pages/BillingPage';
import PharmacyPage from './pages/PharmacyPage';
import PharmacyBillingPage from './pages/PharmacyBilling';
import PharmacyExpiryReportPage from './pages/PharmacyExpiryReportPage';
import LabPage from './pages/LabPage';
import AssetComplaintPage from './pages/AssetComplaintPage';
import BiomedicalPage from './pages/BiomedicalPage';
import MastersPage from './pages/MastersPage';
import AppointmentsPage from './pages/AppointmentsPage';
import TVQueueDisplayPage from './pages/TVQueueDisplayPage';
import ReportsPage from './pages/ReportsPage';
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import BrandingSync from './components/branding/BrandingSync';
import { canAccessRoute } from './constants/navConfig';

const ProtectedRoute = ({ children, routeKey }) => {
  const { user, loading } = useSelector((s) => s.auth);
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (routeKey && !canAccessRoute(user, `/${routeKey}`)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

export default function App() {
  const dispatch = useDispatch();
  const { loading } = useSelector((s) => s.auth);

  useEffect(() => {
    dispatch(checkAuth());
  }, [dispatch]);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <>
      <BrandingSync />
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route path="/queue-display" element={<ProtectedRoute routeKey="queue-display"><TVQueueDisplayPage /></ProtectedRoute>} />

        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route path="/dashboard" element={<ProtectedRoute routeKey="dashboard"><DashboardPage /></ProtectedRoute>} />
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

          {/* ── NEW: Pharmacy Billing Reports ── */}
          <Route path="/pharmacy-billing" element={<ProtectedRoute routeKey="billing"><PharmacyBillingPage /></ProtectedRoute>} />

          {/* ── NEW: Medicine Expiry Report (Inventory → Pharmacy → Medicine Expiry Report) ── */}
          <Route path="/pharmacy/expiry-report" element={<ProtectedRoute routeKey="expiry-report"><PharmacyExpiryReportPage /></ProtectedRoute>} />

          <Route path="/lab" element={<ProtectedRoute routeKey="lab"><LabPage /></ProtectedRoute>} />
          <Route path="/masters" element={<ProtectedRoute routeKey="masters"><MastersPage /></ProtectedRoute>} />
          <Route path="/masters/:section" element={<ProtectedRoute routeKey="masters"><MastersPage /></ProtectedRoute>} />

          {/* Legacy master routes → unified Masters hub */}
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
    </>
  );
}