import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoadingSpinner from './common/LoadingSpinner';
import permissions from '../constants/permissions';

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
  if (user.role === 'Super Admin') {
    return children;
  }

  // 1. Role-based check if allowedRoles is specified
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // 2. Permission-based check if requiredPermission is specified
  if (requiredPermission) {
    const userPermissions = permissions[user.role] || [];
    const hasPermission = userPermissions.includes(requiredPermission) || userPermissions.includes('*');
    
    if (!hasPermission) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
}
