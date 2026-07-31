import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

function MedicalCross({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="12" width="12" height="40" rx="3" fill="currentColor" opacity="0.15" />
      <rect x="12" y="26" width="40" height="12" rx="3" fill="currentColor" opacity="0.15" />
      <rect x="28" y="16" width="8" height="32" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="16" y="28" width="32" height="8" rx="2" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

function HeartbeatLine({ className }) {
  return (
    <svg className={className} viewBox="0 0 400 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0 40 H80 L95 20 L110 60 L125 30 L140 50 L155 40 H400"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.2"
      />
      <path
        d="M0 40 H80 L95 20 L110 60 L125 30 L140 50 L155 40 H400"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.08"
        transform="translate(0, 8)"
      />
    </svg>
  );
}

function DNAHelix({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M30 10 Q60 40 30 70 Q0 100 30 130 Q60 160 30 190"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.12"
      />
      <path
        d="M90 10 Q60 40 90 70 Q120 100 90 130 Q60 160 90 190"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.12"
      />
      {[20, 50, 80, 110, 140, 170].map((y) => (
        <line key={y} x1="35" y1={y} x2="85" y2={y} stroke="currentColor" strokeWidth="1.5" opacity="0.08" />
      ))}
    </svg>
  );
}

export default function AuthLayout() {
  const { user } = useSelector((s) => s.auth);
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] overflow-hidden">
      {/* Soft gradient washes */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-[#60A5FA]/20 via-[#0EA5E9]/10 to-transparent rounded-full blur-3xl -translate-y-1/4 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-[#2563EB]/15 via-[#60A5FA]/10 to-transparent rounded-full blur-3xl translate-y-1/4 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-[#0EA5E9]/5 via-transparent to-[#2563EB]/5 rounded-full blur-3xl" />
      </div>

      {/* Medical illustrations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <MedicalCross className="absolute top-[8%] left-[6%] w-20 h-20 text-[#2563EB] animate-pulse-slow" />
        <MedicalCross className="absolute bottom-[12%] right-[8%] w-16 h-16 text-[#0EA5E9] animate-pulse-slow" />
        <HeartbeatLine className="absolute top-[18%] right-[5%] w-72 text-[#2563EB] hidden md:block" />
        <HeartbeatLine className="absolute bottom-[22%] left-[3%] w-64 text-[#60A5FA] hidden lg:block rotate-180" />
        <DNAHelix className="absolute top-[30%] left-[3%] w-24 text-[#2563EB] hidden xl:block" />
        <DNAHelix className="absolute bottom-[28%] right-[4%] w-20 text-[#0EA5E9] hidden xl:block scale-x-[-1]" />

        {/* Floating dots */}
        <div className="absolute top-[40%] right-[15%] w-3 h-3 rounded-full bg-[#60A5FA]/30 hidden md:block" />
        <div className="absolute top-[55%] left-[12%] w-2 h-2 rounded-full bg-[#2563EB]/25 hidden md:block" />
        <div className="absolute bottom-[35%] right-[22%] w-4 h-4 rounded-full bg-[#0EA5E9]/20 hidden lg:block" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #2563EB08 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <Outlet />
      </div>
    </div>
  );
}
