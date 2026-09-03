import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { homePathForUser } from '../utils/homePath';

/** Full-bleed auth shell — login page owns its own layout. */
export default function AuthLayout() {
  const { user } = useSelector((s) => s.auth);
  if (user) return <Navigate to={homePathForUser(user)} replace />;

  return (
    <div className="min-h-[100dvh] bg-[#F4F7FB]">
      <Outlet />
    </div>
  );
}
