import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { checkAuth } from './redux/slices/authSlice';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import OPQueuePage from './pages/OPQueuePage';
import DoctorConsultationPage from './pages/DoctorConsultationPage';
import IPAdmissionsPage from './pages/IPAdmissionsPage';
import BillingPage from './pages/BillingPage';
import PharmacyPage from './pages/PharmacyPage';
import PharmacyBillingPage from './pages/PharmacyBilling';
import LabPage from './pages/LabPage';
import BedsPage from './pages/BedsPage';
import StaffPage from './pages/StaffPage';
import ReportsPage from './pages/ReportsPage';
import AppointmentsPage from './pages/AppointmentsPage';
import SettingsPage, { SettingsIndexRedirect } from './pages/SettingsPage';
import ServiceMasterPage from './pages/ServiceMasterPage';
import HospitalBrandingPage from './pages/HospitalBrandingPage';
import DepartmentPage from './pages/DepartmentPage';
import AssetPage from './pages/AssetPage';
import AssetComplaintPage from './pages/AssetComplaintPage';
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import BrandingSync from './components/branding/BrandingSync';
import { canAccessRoute } from './constants/navConfig';

const ProtectedRoute = ({ children, routeKey }) => {
  const { user, loading } = useSelector((s) => s.auth);
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (routeKey && !canAccessRoute(user.role, `/${routeKey}`)) {
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

        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route path="/dashboard" element={<ProtectedRoute routeKey="dashboard"><DashboardPage /></ProtectedRoute>} />
          <Route path="/patients" element={<ProtectedRoute routeKey="patients"><PatientsPage /></ProtectedRoute>} />
          <Route path="/op-queue" element={<ProtectedRoute routeKey="op-queue"><OPQueuePage /></ProtectedRoute>} />
          <Route path="/consultation/:opId" element={<ProtectedRoute routeKey="consultation"><DoctorConsultationPage /></ProtectedRoute>} />
          <Route path="/ip-admissions" element={<ProtectedRoute routeKey="ip-admissions"><IPAdmissionsPage /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute routeKey="billing"><BillingPage /></ProtectedRoute>} />
          <Route path="/pharmacy" element={<ProtectedRoute routeKey="pharmacy"><PharmacyPage /></ProtectedRoute>} />

          {/* ── NEW: Pharmacy Billing Reports ── */}
          <Route path="/pharmacy-billing" element={<ProtectedRoute routeKey="billing"><PharmacyBillingPage /></ProtectedRoute>} />

          <Route path="/lab" element={<ProtectedRoute routeKey="lab"><LabPage /></ProtectedRoute>} />
          <Route path="/beds" element={<ProtectedRoute routeKey="beds"><BedsPage /></ProtectedRoute>} />
          <Route path="/departments" element={<ProtectedRoute routeKey="departments"><DepartmentPage /></ProtectedRoute>} />
          <Route path="/assets" element={<ProtectedRoute routeKey="assets"><AssetPage /></ProtectedRoute>} />
          <Route path="/asset-complaints" element={<ProtectedRoute routeKey="asset-complaints"><AssetComplaintPage /></ProtectedRoute>} />
          <Route path="/appointments" element={<ProtectedRoute routeKey="appointments"><AppointmentsPage /></ProtectedRoute>} />
          <Route path="/staff" element={<ProtectedRoute routeKey="staff"><StaffPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute routeKey="reports"><ReportsPage /></ProtectedRoute>} />

          <Route path="/settings" element={<ProtectedRoute routeKey="settings"><SettingsPage /></ProtectedRoute>}>
            <Route index element={<SettingsIndexRedirect />} />
            <Route path="hospital-branding" element={<HospitalBrandingPage />} />
            <Route path="services" element={<ServiceMasterPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}