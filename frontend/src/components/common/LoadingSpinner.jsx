import React from 'react';

export default function LoadingSpinner({ fullScreen = false, size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  const spinner = (
    <div className={`${sizes[size]} border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin`} />
  );
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-950 z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading HMS...</p>
        </div>
      </div>
    );
  }
  return <div className="flex items-center justify-center p-8">{spinner}</div>;
}
