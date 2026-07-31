import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <ShieldX size={64} className="text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
      <p className="text-gray-500 max-w-md mb-6">
        Your role does not have permission to view this module. Contact your administrator if you believe this is an error.
      </p>
      <Link to="/dashboard" className="btn-primary">Return to Dashboard</Link>
    </div>
  );
}
