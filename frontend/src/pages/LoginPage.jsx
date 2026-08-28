import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Activity,
  Clock,
  Calendar,
  HeartPulse,
  Stethoscope,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { login } from "../redux/slices/authSlice";
import { SYSTEM_TAGLINE } from "../constants/branding";
import SystemBrandingLogo from "../components/branding/SystemBrandingLogo";
import api from "../services/api";

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
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder=" "
        {...register}
        className={`
          peer w-full px-4 pt-6 pb-2.5
          bg-white/80 backdrop-blur-sm
          border rounded-xl
          text-gray-900 text-base
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
          <span className="hidden sm:inline">{format(now, "EEEE, MMMM d, yyyy")}</span>
          <span className="sm:hidden">{format(now, "EEE, d MMM")}</span>
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
  const { loginLoading, error } = useSelector((s) => s.auth);
  const [showPass, setShowPass] = useState(false);
  // login | forgot-email | forgot-reset
  const [mode, setMode] = useState("login");
  const [fpBusy, setFpBusy] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpOtp, setFpOtp] = useState("");
  const [fpNewPassword, setFpNewPassword] = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [fpShowNew, setFpShowNew] = useState(false);
  const [hintOtp, setHintOtp] = useState(""); // shown when API returns OTP (dev / hospital mode)
  const [hospitalChoices, setHospitalChoices] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [pendingLogin, setPendingLogin] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    const payload = { ...data };
    if (selectedHospitalId) payload.organizationId = selectedHospitalId;
    const result = await dispatch(login(payload));
    if (login.rejected.match(result) && result.payload?.requiresOrganization) {
      setHospitalChoices(result.payload.hospitals || []);
      setPendingLogin(data);
      toast.error(result.payload.message || "Select your hospital to continue.");
      return;
    }
    if (login.fulfilled.match(result)) {
      setHospitalChoices([]);
      setPendingLogin(null);
      setSelectedHospitalId("");
    }
  };

  const continueWithHospital = async () => {
    if (!selectedHospitalId || !pendingLogin) {
      toast.error("Select your hospital");
      return;
    }
    const result = await dispatch(login({ ...pendingLogin, organizationId: selectedHospitalId }));
    if (login.fulfilled.match(result)) {
      setHospitalChoices([]);
      setPendingLogin(null);
    }
  };

  const resetForgotForm = () => {
    setFpEmail("");
    setFpOtp("");
    setFpNewPassword("");
    setFpConfirm("");
    setHintOtp("");
    setFpShowNew(false);
    setMode("login");
  };

  const requestOtp = async (e) => {
    e?.preventDefault?.();
    const email = fpEmail.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setFpBusy(true);
    try {
      const body = { email };
      if (selectedHospitalId) body.organizationId = selectedHospitalId;
      const { data } = await api.post("/auth/forgotpassword", body, { skipErrorToast: true });
      if (data.otp) {
        setHintOtp(String(data.otp));
        setFpOtp(String(data.otp));
      } else {
        setHintOtp("");
      }
      toast.success(data.message || "Verification code sent");
      setMode("forgot-reset");
    } catch (err) {
      const body = err.response?.data;
      if (body?.requiresOrganization && Array.isArray(body.hospitals)) {
        setHospitalChoices(body.hospitals);
        toast.error(body.message || "Select your hospital to continue.");
      } else {
        toast.error(body?.message || "Could not send verification code");
      }
    } finally {
      setFpBusy(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    if (!fpOtp.trim() || fpOtp.trim().length !== 6) {
      toast.error("Enter the 6-digit verification code");
      return;
    }
    if (!fpNewPassword || fpNewPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (fpNewPassword !== fpConfirm) {
      toast.error("New passwords do not match");
      return;
    }
    setFpBusy(true);
    try {
      const { data } = await api.post("/auth/resetpassword", {
        email: fpEmail.trim().toLowerCase(),
        otp: fpOtp.trim(),
        newPassword: fpNewPassword,
        confirmNewPassword: fpConfirm,
        ...(selectedHospitalId ? { organizationId: selectedHospitalId } : {}),
      });
      toast.success(data.message || "Password changed — sign in with your new password");
      resetForgotForm();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not reset password");
    } finally {
      setFpBusy(false);
    }
  };

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
              <h1 className="text-4xl xl:text-5xl font-bold text-gray-900">
                Galactic Medical Systems
              </h1>

              <p className="mt-3 text-xl text-[#2563EB] font-semibold">
                Hospital Management System
              </p>

              <p className="mt-5 text-gray-600 leading-relaxed">
                GMS is the Super Admin organization. Sri Sanjeevi Hospital and
                Srinivasa hospital are client hospitals. Each client keeps its own
                branding, with GMS developed shown at the top. Sri Sanjeevi live
                data stays in Sri Sanjeevi.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: "GMS is the Super Admin organization" },
              { icon: Stethoscope, text: "Sri Sanjeevi and Srinivasa are client hospitals" },
              { icon: Activity, text: "Sri Sanjeevi live data stays in Sri Sanjeevi" },
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
              rounded-[20px] p-5 sm:p-7 lg:p-9
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
              <p className="mt-2 text-xs text-gray-400">
                GMS Super Admin · client hospitals keep their own branding
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

            {error && mode === "login" && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium"
              >
                {error}
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {mode === "login" && (
                <motion.form
                  key="login"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
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

                  {hospitalChoices.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-[#2563EB]/20 bg-[#2563EB]/5 p-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Select your hospital
                      </label>
                      <select
                        value={selectedHospitalId}
                        onChange={(e) => setSelectedHospitalId(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">Choose hospital…</option>
                        {hospitalChoices.map((h) => (
                          <option key={h.organizationId} value={h.organizationId}>
                            {h.name}{h.code ? ` (${h.code})` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={continueWithHospital}
                        disabled={loginLoading || !selectedHospitalId}
                        className="w-full rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Continue with selected hospital
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMode("forgot-email")}
                      className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors duration-200 hover:underline underline-offset-2"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={loginLoading}
                    whileHover={{ scale: loginLoading ? 1 : 1.01, y: loginLoading ? 0 : -1 }}
                    whileTap={{ scale: loginLoading ? 1 : 0.98 }}
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
                    {loginLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </motion.button>
                </motion.form>
              )}

              {mode === "forgot-email" && (
                <motion.form
                  key="forgot-email"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  onSubmit={requestOtp}
                  className="space-y-5 relative"
                >
                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#2563EB]/5 border border-[#2563EB]/15">
                    <KeyRound size={18} className="text-[#2563EB] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Reset your password</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        Enter your staff email. A 6-digit code will be generated (shown here in hospital mode,
                        or ask Super Admin from notifications).
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder=" "
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      className="peer w-full px-4 pt-6 pb-2.5 bg-white/80 border border-gray-200/80 rounded-xl text-gray-900 text-[15px] focus:outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                      required
                    />
                    <label className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[15px] pointer-events-none transition-all peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:font-medium peer-focus:text-[#2563EB] peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:text-gray-500">
                      Email Address
                    </label>
                  </div>

                  {hospitalChoices.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Select your hospital</label>
                      <select
                        value={selectedHospitalId}
                        onChange={(e) => setSelectedHospitalId(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">Choose hospital…</option>
                        {hospitalChoices.map((h) => (
                          <option key={h.organizationId} value={h.organizationId}>
                            {h.name}{h.code ? ` (${h.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={fpBusy}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0EA5E9] text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {fpBusy ? "Sending…" : "Get verification code"}
                  </button>

                  <button
                    type="button"
                    onClick={resetForgotForm}
                    className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-[#2563EB]"
                  >
                    <ArrowLeft size={14} /> Back to sign in
                  </button>
                </motion.form>
              )}

              {mode === "forgot-reset" && (
                <motion.form
                  key="forgot-reset"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  onSubmit={submitNewPassword}
                  className="space-y-4 relative"
                >
                  <p className="text-sm text-gray-600">
                    Code sent for <span className="font-semibold text-gray-900">{fpEmail}</span>
                  </p>

                  {hintOtp ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                      Your code: <span className="font-bold tracking-[0.3em] text-lg ml-1">{hintOtp}</span>
                      <span className="block text-xs mt-1 text-amber-700/80">Valid for 10 minutes</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Ask Super Admin / Admin for the OTP from their notifications bell, or check the backend console.
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">6-digit code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={fpOtp}
                      onChange={(e) => setFpOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-lg tracking-[0.4em] font-semibold focus:outline-none focus:border-[#2563EB]"
                      placeholder="••••••"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">New password</label>
                    <div className="relative">
                      <input
                        type={fpShowNew ? "text" : "password"}
                        value={fpNewPassword}
                        onChange={(e) => setFpNewPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:border-[#2563EB]"
                        placeholder="Min 8 chars, A-z, 0-9, symbol"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setFpShowNew((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                      >
                        {fpShowNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Confirm new password</label>
                    <input
                      type={fpShowNew ? "text" : "password"}
                      value={fpConfirm}
                      onChange={(e) => setFpConfirm(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#2563EB]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={fpBusy}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0EA5E9] text-white font-semibold disabled:opacity-60"
                  >
                    {fpBusy ? "Updating…" : "Set new password"}
                  </button>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={fpBusy}
                      onClick={requestOtp}
                      className="text-sm text-[#2563EB] hover:underline"
                    >
                      Resend code
                    </button>
                    <button
                      type="button"
                      onClick={resetForgotForm}
                      className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-[#2563EB]"
                    >
                      <ArrowLeft size={14} /> Back to sign in
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
