import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Bed, Boxes, ClipboardList, Eye, EyeOff,
  FileBarChart, FlaskConical, Headphones, HeartPulse, KeyRound,
  Lock, Mail, Pill, Receipt, ShieldCheck, Stethoscope, Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { login } from '../redux/slices/authSlice';
import { SOFTWARE_LOGO, SYSTEM_NAME, SYSTEM_SHORT_NAME } from '../constants/branding';
import api from '../services/api';
import '../styles/gmsLogin.css';

const SUPPORT_PHONE = '88076 30501';
const SUPPORT_TEL = '+918807630501';

const MODULES = [
  { label: 'OP & IP', Icon: Stethoscope, bg: '#dbeafe', color: '#1d4ed8' },
  { label: 'Billing', Icon: Receipt, bg: '#dcfce7', color: '#15803d' },
  { label: 'Laboratory', Icon: FlaskConical, bg: '#f3e8ff', color: '#7e22ce' },
  { label: 'Pharmacy', Icon: Pill, bg: '#fee2e2', color: '#b91c1c' },
  { label: 'Medical Inventory', Icon: Boxes, bg: '#ffedd5', color: '#c2410c' },
  { label: 'Nurse Station', Icon: ClipboardList, bg: '#ccfbf1', color: '#0f766e' },
  { label: 'Biomedical', Icon: Wrench, bg: '#e0e7ff', color: '#4338ca' },
  { label: 'Reports & Analytics', Icon: FileBarChart, bg: '#ecfccb', color: '#4d7c0f' },
];

const STATS = [
  { title: '500+ Happy Patients Daily', note: 'Across live hospital workflows', Icon: HeartPulse },
  { title: '99.9% Uptime & Security', note: 'Always-on hospital operations', Icon: ShieldCheck },
  { title: 'Multi-Hospital Cloud Ready', note: 'Separate branding per hospital', Icon: Bed },
  { title: 'Secure & Reliable Data', note: 'Role-based access control', Icon: Lock },
];

function GmsMark({ height = 52 }) {
  return (
    <img
      src={SOFTWARE_LOGO}
      alt={SYSTEM_NAME}
      style={{ height, width: 'auto', objectFit: 'contain' }}
    />
  );
}

export default function LoginPage() {
  const dispatch = useDispatch();
  const { loginLoading, error } = useSelector((s) => s.auth);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState('login');
  const [fpBusy, setFpBusy] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');
  const [fpShowNew, setFpShowNew] = useState(false);
  const [hintOtp, setHintOtp] = useState('');
  const [hospitalChoices, setHospitalChoices] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
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
      toast.error(result.payload.message || 'Select your hospital to continue.');
      return;
    }
    if (login.fulfilled.match(result)) {
      setHospitalChoices([]);
      setPendingLogin(null);
      setSelectedHospitalId('');
    }
  };

  const continueWithHospital = async () => {
    if (!selectedHospitalId || !pendingLogin) {
      toast.error('Select your hospital');
      return;
    }
    const result = await dispatch(login({ ...pendingLogin, organizationId: selectedHospitalId }));
    if (login.fulfilled.match(result)) {
      setHospitalChoices([]);
      setPendingLogin(null);
    }
  };

  const resetForgotForm = () => {
    setFpEmail('');
    setFpOtp('');
    setFpNewPassword('');
    setFpConfirm('');
    setHintOtp('');
    setFpShowNew(false);
    setMode('login');
  };

  const requestOtp = async (e) => {
    e?.preventDefault?.();
    const email = fpEmail.trim().toLowerCase();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    setFpBusy(true);
    try {
      const body = { email };
      if (selectedHospitalId) body.organizationId = selectedHospitalId;
      const { data } = await api.post('/auth/forgotpassword', body, { skipErrorToast: true });
      if (data.otp) {
        setHintOtp(String(data.otp));
        setFpOtp(String(data.otp));
      } else {
        setHintOtp('');
      }
      toast.success(data.message || 'Verification code sent');
      setMode('forgot-reset');
    } catch (err) {
      const body = err.response?.data;
      if (body?.requiresOrganization && Array.isArray(body.hospitals)) {
        setHospitalChoices(body.hospitals);
        toast.error(body.message || 'Select your hospital to continue.');
      } else {
        toast.error(body?.message || 'Could not send verification code');
      }
    } finally {
      setFpBusy(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    if (!fpOtp.trim() || fpOtp.trim().length !== 6) {
      toast.error('Enter the 6-digit verification code');
      return;
    }
    if (!fpNewPassword || fpNewPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (fpNewPassword !== fpConfirm) {
      toast.error('New passwords do not match');
      return;
    }
    setFpBusy(true);
    try {
      const { data } = await api.post('/auth/resetpassword', {
        email: fpEmail.trim().toLowerCase(),
        otp: fpOtp.trim(),
        newPassword: fpNewPassword,
        confirmNewPassword: fpConfirm,
        ...(selectedHospitalId ? { organizationId: selectedHospitalId } : {}),
      });
      toast.success(data.message || 'Password changed — sign in with your new password');
      resetForgotForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reset password');
    } finally {
      setFpBusy(false);
    }
  };

  const hospitalPicker = hospitalChoices.length > 0 && (
    <div className="gms-login__hospital">
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Select your hospital</label>
      <select
        value={selectedHospitalId}
        onChange={(e) => setSelectedHospitalId(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">Choose hospital…</option>
        {hospitalChoices.map((h) => (
          <option key={h.organizationId} value={h.organizationId}>
            {h.name}{h.code ? ` (${h.code})` : ''}
          </option>
        ))}
      </select>
      {mode === 'login' && pendingLogin && (
        <button
          type="button"
          onClick={continueWithHospital}
          disabled={loginLoading || !selectedHospitalId}
          className="gms-login__submit mt-3"
          style={{ padding: '11px 14px', fontSize: 14 }}
        >
          Continue with selected hospital
        </button>
      )}
    </div>
  );

  return (
    <div className="gms-login">
      <div className="gms-login__bg" aria-hidden />

      <header className="gms-login__top">
        <div className="gms-login__brand">
          <GmsMark height={72} />
          <div className="gms-login__brand-text">
            <strong>{SYSTEM_SHORT_NAME}</strong>
            <span>Galactic Medical Systems</span>
          </div>
        </div>
        <div className="gms-login__trust">
          Trusted by Modern Hospitals | Made in India <span aria-hidden>🇮🇳</span>
        </div>
        <a className="gms-login__support" href={`tel:${SUPPORT_TEL}`}>
          <Headphones size={15} />
          24×7 Support {SUPPORT_PHONE}
        </a>
      </header>

      <main className="gms-login__main">
        <section className="gms-login__left">
          <div className="gms-login__hero-pill">
            <HeartPulse size={14} />
            Complete Hospital Management System
          </div>
          <h1 className="gms-login__headline">
            Smarter Hospitals.
            <em>Healthier Lives.</em>
          </h1>
          <p className="gms-login__lead">
            Streamline OP, IP, pharmacy, laboratory, billing, and nursing with one secure,
            multi-hospital cloud platform built for modern care teams.
          </p>

          <div className="gms-login__modules">
            {MODULES.map(({ label, Icon, bg, color }) => (
              <div key={label} className="gms-login__module">
                <span className="gms-login__module-ico" style={{ background: bg, color }}>
                  <Icon size={20} />
                </span>
                {label}
              </div>
            ))}
          </div>

          <div className="gms-login__stats">
            {STATS.map(({ title, note, Icon }) => (
              <div key={title} className="gms-login__stat">
                <span className="gms-login__module-ico" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{note}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="gms-login__hero" aria-hidden>
          <img src="/gms-login-doctor.png" alt="" />
        </section>

        <section className="gms-login__card-wrap">
          <div className="gms-login__card">
            <div className="gms-login__card-logo">
              <GmsMark height={92} />
            </div>
            <h2>Hospital Management System</h2>
            <p className="gms-login__card-sub">Secure • Smart • Simple</p>
            <p className="gms-login__welcome">
              <strong>Welcome Back!</strong>
              <span>Sign in to access your hospital dashboard.</span>
            </p>

            {error && mode === 'login' && <div className="gms-login__error">{error}</div>}

            <AnimatePresence mode="wait">
              {mode === 'login' && (
                <motion.form
                  key="login"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onSubmit={handleSubmit(onSubmit)}
                >
                  <label className="gms-login__label" htmlFor="email">Email Address</label>
                  <div className="gms-login__field">
                    <Mail size={16} className="gms-login__field-ico" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="Email Address"
                      {...register('email', {
                        required: 'Email is required',
                        pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email address' },
                      })}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500 font-medium mb-2 -mt-1">{errors.email.message}</p>}

                  <label className="gms-login__label" htmlFor="password">Password</label>
                  <div className="gms-login__field">
                    <Lock size={16} className="gms-login__field-ico" />
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register('password', { required: 'Password is required' })}
                    />
                    <button
                      type="button"
                      className="gms-login__field-eye"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500 font-medium mb-2 -mt-1">{errors.password.message}</p>}

                  {hospitalPicker}

                  <div className="gms-login__row">
                    <label className="gms-login__remember">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                      Remember me
                    </label>
                    <button type="button" className="gms-login__forgot" onClick={() => setMode('forgot-email')}>
                      Forgot Password?
                    </button>
                  </div>

                  <button type="submit" className="gms-login__submit" disabled={loginLoading}>
                    {loginLoading ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign In
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </motion.form>
              )}

              {mode === 'forgot-email' && (
                <motion.form
                  key="forgot-email"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onSubmit={requestOtp}
                >
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 mb-3">
                    <KeyRound size={18} className="text-blue-700 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Reset your password</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Enter your staff email. A 6-digit code will be generated for verification.
                      </p>
                    </div>
                  </div>
                  <label className="gms-login__label">Email Address</label>
                  <div className="gms-login__field">
                    <Mail size={16} className="gms-login__field-ico" />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="Email Address"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      required
                    />
                  </div>
                  {hospitalPicker}
                  <button type="submit" className="gms-login__submit" disabled={fpBusy}>
                    {fpBusy ? 'Sending…' : 'Get verification code'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForgotForm}
                    className="w-full mt-3 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-blue-700"
                  >
                    <ArrowLeft size={14} /> Back to sign in
                  </button>
                </motion.form>
              )}

              {mode === 'forgot-reset' && (
                <motion.form
                  key="forgot-reset"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onSubmit={submitNewPassword}
                  className="space-y-3"
                >
                  {hintOtp && (
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      Hospital mode code: <strong>{hintOtp}</strong>
                    </p>
                  )}
                  <div className="gms-login__field">
                    <KeyRound size={16} className="gms-login__field-ico" />
                    <input
                      value={fpOtp}
                      onChange={(e) => setFpOtp(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="tracking-[0.3em] text-center font-semibold"
                      required
                    />
                  </div>
                  <div className="gms-login__field">
                    <Lock size={16} className="gms-login__field-ico" />
                    <input
                      type={fpShowNew ? 'text' : 'password'}
                      value={fpNewPassword}
                      onChange={(e) => setFpNewPassword(e.target.value)}
                      placeholder="New password"
                      required
                    />
                    <button type="button" className="gms-login__field-eye" onClick={() => setFpShowNew((v) => !v)}>
                      {fpShowNew ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <div className="gms-login__field">
                    <Lock size={16} className="gms-login__field-ico" />
                    <input
                      type={fpShowNew ? 'text' : 'password'}
                      value={fpConfirm}
                      onChange={(e) => setFpConfirm(e.target.value)}
                      placeholder="Confirm new password"
                      required
                    />
                  </div>
                  <button type="submit" className="gms-login__submit" disabled={fpBusy}>
                    {fpBusy ? 'Saving…' : 'Update password'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForgotForm}
                    className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-blue-700"
                  >
                    <ArrowLeft size={14} /> Back to sign in
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="gms-login__secure">
              <ShieldCheck size={15} />
              256-bit Encrypted | HIPAA Inspired Security
            </div>
          </div>
          <div className="gms-login__powered">
            <img src={SOFTWARE_LOGO} alt="" />
            Powered by Galactic Medical Systems
          </div>
        </section>
      </main>

      <footer className="gms-login__footer">
        <svg className="gms-login__wave" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
          <path d="M0,32 C240,48 480,0 720,16 C960,32 1200,48 1440,20 L1440,48 L0,48 Z" />
        </svg>
        <div className="gms-login__footer-bar">
          <div className="gms-login__footer-inner">
            <HeartPulse size={18} />
            Digitizing Healthcare for a <em>Better Tomorrow</em>
          </div>
        </div>
      </footer>
    </div>
  );
}
