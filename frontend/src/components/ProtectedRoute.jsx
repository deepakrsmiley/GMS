import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoadingSpinner from './common/LoadingSpinner';
import { hasPermission } from '../constants/permissions';
import { hasRole, normalizeRole } from '../utils/roles';

export default function ProtectedRoute({ children, allowedRoles, requiredPermission }) {
  const { user, loading } = useSelector((s) => s.auth);
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  // Not logged in -> Redirect to Login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Super Admin has full bypass
  if (normalizeRole(user.role) === 'Super Admin') {
    return children;
  }

  // Permission grants from Super Admin take priority over hardcoded roles
  if (requiredPermission) {
    if (!hasPermission(user, requiredPermission)) {
      return <Navigate to="/unauthorized" replace />;
    }
    return children;
  }

  if (allowedRoles && !hasRole(user.role, allowedRoles)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
