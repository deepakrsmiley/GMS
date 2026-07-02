import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Activity,
  Clock,
  Calendar,
  HeartPulse,
  Stethoscope,
} from "lucide-react";
import { format } from "date-fns";
import { login } from "../redux/slices/authSlice";
import { SYSTEM_TAGLINE } from "../constants/branding";
import SystemBrandingLogo from "../components/branding/SystemBrandingLogo";

function FloatingInput({
  id,
  label,
  type = "text",
  register,
  error,
  rightElement,
  autoComplete,
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder=" "
        {...register}
        className={`
          peer w-full px-4 pt-6 pb-2.5
          bg-white/80 backdrop-blur-sm
          border rounded-xl
          text-gray-900 text-[15px]
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-0
          ${
            error
              ? "border-red-300 focus:border-red-400"
              : "border-gray-200/80 focus:border-[#2563EB] hover:border-[#60A5FA]/60"
          }
          focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12),0_4px_12px_rgba(37,99,235,0.08)]
          ${rightElement ? "pr-12" : ""}
        `}
      />
      <label
        htmlFor={id}
        className={`
          absolute left-4 top-1/2 -translate-y-1/2
          text-gray-400 text-[15px] pointer-events-none
          transition-all duration-300 ease-out
          peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:font-medium
          peer-focus:text-[#2563EB]
          peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0
          peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium
          peer-[:not(:placeholder-shown)]:text-gray-500
          ${rightElement ? "peer-focus:pr-8" : ""}
        `}
      >
        {label}
      </label>
      {rightElement && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {rightElement}
        </div>
      )}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-xs text-red-500 font-medium"
        >
          {error.message}
        </motion.p>
      )}
    </div>
  );
}

function DateTimeDisplay() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-500"
    >
      <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-100 shadow-sm">
        <Calendar size={15} className="text-[#2563EB]" />
        <span className="font-medium text-gray-600">
          {format(now, "EEEE, MMMM d, yyyy")}
        </span>
      </div>
      <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-100 shadow-sm">
        <Clock size={15} className="text-[#0EA5E9]" />
        <span className="font-semibold text-gray-700 tabular-nums">
          {format(now, "hh:mm:ss a")}
        </span>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.auth);
  const [showPass, setShowPass] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = (data) => dispatch(login(data));

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
        {/* Branding panel — desktop */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="hidden lg:flex flex-col justify-center space-y-8 px-4"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2563EB]/8 border border-[#2563EB]/15 text-[#2563EB] text-xs font-semibold tracking-wide uppercase mb-6">
              <HeartPulse size={14} />
              Enterprise Healthcare Platform
            </div>
            <div>
              <h1 className="text-5xl font-bold text-gray-900">
                Galactic Medical Systems
              </h1>

              <p className="mt-3 text-xl text-[#2563EB] font-semibold">
                Hospital Management System
              </p>

              <p className="mt-5 text-gray-600 leading-relaxed">
                Enterprise-grade healthcare platform designed for hospitals,
                clinics, pharmacies and laboratories with secure patient
                management, billing, reporting and workflow automation.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { icon: Stethoscope, text: "Integrated patient care workflows" },
              { icon: ShieldCheck, text: "HIPAA-compliant secure access" },
              { icon: Activity, text: "Real-time clinical operations" },
            ].map(({ icon: Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 text-gray-600"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100">
                  <Icon size={18} className="text-[#2563EB]" />
                </div>
                <span className="text-[15px] font-medium">{text}</span>
              </motion.div>
            ))}
          </div>

          <DateTimeDisplay />
        </motion.div>

        {/* Login card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md mx-auto lg:max-w-none"
        >
          {/* Mobile date/time */}
          <div className="lg:hidden mb-6 flex justify-center">
            <DateTimeDisplay />
          </div>

          <div
            className="
              relative bg-white/90 backdrop-blur-xl
              border border-white/60
              rounded-[20px] p-7 sm:p-9
              shadow-[0_4px_24px_rgba(37,99,235,0.06),0_12px_48px_rgba(15,23,42,0.04)]
              before:absolute before:inset-0 before:rounded-[20px]
              before:bg-gradient-to-b before:from-white/50 before:to-transparent
              before:pointer-events-none
            "
          >
            {/* Logo & header */}
            <div className="text-center mb-8 relative">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
                className="flex justify-center mb-4"
              >
                <SystemBrandingLogo size="sm" showTagline={false} />
              </motion.div>
              <p className="text-[15px] text-gray-500 font-medium">
                {SYSTEM_TAGLINE}
              </p>

              {/* Secure badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full
                  bg-gradient-to-r from-[#2563EB]/5 to-[#0EA5E9]/5
                  border border-[#2563EB]/15 text-[#2563EB] text-xs font-semibold"
              >
                <ShieldCheck size={14} className="text-[#0EA5E9]" />
                256-bit Encrypted Secure Login
              </motion.div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium"
              >
                {error}
              </motion.div>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5 relative"
            >
              <FloatingInput
                id="email"
                label="Email Address"
                type="email"
                autoComplete="email"
                register={register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: "Invalid email address",
                  },
                })}
                error={errors.email}
              />

              <FloatingInput
                id="password"
                label="Password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                register={register("password", {
                  required: "Password is required",
                })}
                error={errors.password}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#2563EB] hover:bg-[#2563EB]/5 transition-all duration-200"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              <div className="flex justify-end">
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors duration-200 hover:underline underline-offset-2"
                >
                  Forgot Password?
                </a>
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.01, y: loading ? 0 : -1 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="
                  relative w-full py-3.5 sm:py-4 mt-1
                  bg-gradient-to-r from-[#2563EB] via-[#0EA5E9] to-[#60A5FA]
                  hover:from-[#1d4ed8] hover:via-[#0284c7] hover:to-[#3b82f6]
                  text-white font-semibold text-[15px] sm:text-base
                  rounded-xl
                  shadow-[0_4px_16px_rgba(37,99,235,0.35)]
                  hover:shadow-[0_8px_24px_rgba(37,99,235,0.45)]
                  transition-all duration-300
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                  flex items-center justify-center gap-2.5
                  overflow-hidden
                  group
                "
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </motion.button>
            </form>
          </div>

          {/* Mobile branding */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="lg:hidden flex justify-center mt-6"
          >
            <SystemBrandingLogo size="sm" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
