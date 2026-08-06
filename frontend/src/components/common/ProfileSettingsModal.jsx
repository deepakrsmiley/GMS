import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Save, Upload, Trash2, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from './Modal';
import { setUser, logout } from '../../redux/slices/authSlice';
import '../../styles/assetMaster.css';

const emptyPassword = () => ({
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
});

/** Resize image client-side before storing in MongoDB (max ~400px, JPEG). */
const fileToProfileDataUri = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const max = 400;
        let { width, height } = img;
        if (width > max || height > max) {
          const scale = Math.min(max / width, max / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

export default function ProfileSettingsModal({ isOpen, onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const fileRef = useRef(null);
  const [tab, setTab] = useState('profile'); // profile | password
  const [saving, setSaving] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [form, setForm] = useState({});
  const [pwd, setPwd] = useState(emptyPassword());
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    setTab('profile');
    setPwd(emptyPassword());
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      specialization: user.specialization || '',
      qualification: user.qualification || '',
      experience: user.experience ?? '',
      shift: user.shift || 'morning',
      consultationFee: user.consultationFee ?? '',
      followUpFee: user.followUpFee ?? '',
      morningSessionStart: user.morningSessionStart || '',
      morningSessionEnd: user.morningSessionEnd || '',
      eveningSessionStart: user.eveningSessionStart || '',
      eveningSessionEnd: user.eveningSessionEnd || '',
      avatar: user.avatar || '',
    });
  }, [isOpen, user]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setPwdField = (key) => (e) => setPwd((p) => ({ ...p, [key]: e.target.value }));

  const persistPhoto = async (dataUri) => {
    const { data } = await api.put('/auth/updateprofile', { avatar: dataUri });
    dispatch(setUser(data.data));
    setForm((f) => ({ ...f, avatar: data.data?.avatar || dataUri || '' }));
    return data.data;
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG, WEBP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be under 5MB before resize');
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUri = await fileToProfileDataUri(file);
      setForm((f) => ({ ...f, avatar: dataUri }));
      await persistPhoto(dataUri);
      toast.success('Photo saved');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      await persistPhoto('');
      toast.success('Photo removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        experience: form.experience === '' ? undefined : Number(form.experience),
        consultationFee: form.consultationFee === '' ? undefined : Number(form.consultationFee),
        followUpFee: form.followUpFee === '' ? undefined : Number(form.followUpFee),
      };
      const { data } = await api.put('/auth/updateprofile', payload);
      dispatch(setUser(data.data));
      toast.success('Profile updated');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (!pwd.currentPassword || !pwd.newPassword || !pwd.confirmNewPassword) {
      toast.error('Fill all password fields');
      return;
    }
    if (pwd.newPassword !== pwd.confirmNewPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setPwdSaving(true);
    try {
      await api.put('/auth/updatepassword', pwd);
      toast.success('Password changed — please sign in again');
      onClose();
      await dispatch(logout());
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setPwdSaving(false);
    }
  };

  if (!user) return null;

  const isDoctor = user.role === 'Doctor';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="My Profile"
      subtitle="Edit your account details"
      size="lg"
    >
      <div className="am-shell" style={{ padding: '0.85rem 1.15rem 1.15rem' }}>
        <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-lg border border-[var(--am-line)] bg-[var(--am-canvas)]">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-semibold overflow-hidden border-2 border-white shadow-sm">
              {form.avatar ? (
                <img src={form.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                (user.name || '?').charAt(0).toUpperCase()
              )}
            </div>
            <button
              type="button"
              title="Change photo"
              disabled={photoBusy}
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow border-2 border-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Camera size={14} />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="am-name truncate">{user.name}</p>
            <p className="am-sub">
              {user.role}
              {user.employeeId ? ` · ${user.employeeId}` : ''}
              {user.department?.name ? ` · ${user.department.name}` : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <button
                type="button"
                className="am-btn am-btn--ghost"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} />
                {photoBusy ? 'Saving…' : 'Upload photo'}
              </button>
              {form.avatar ? (
                <button
                  type="button"
                  className="am-btn am-btn--ghost"
                  disabled={photoBusy}
                  onClick={handleRemovePhoto}
                >
                  <Trash2 size={14} /> Remove
                </button>
              ) : null}
            </div>
            <p className="am-sub mt-1">JPG / PNG / WEBP · saved to MongoDB immediately · shows in header &amp; sidebar</p>
          </div>
        </div>

        <div className="corp-tabs mb-4">
          <button
            type="button"
            className={`corp-tab ${tab === 'profile' ? 'corp-tab-active' : ''}`}
            onClick={() => setTab('profile')}
          >
            <User size={14} className="inline mr-1.5 -mt-0.5" />
            Profile details
          </button>
          <button
            type="button"
            className={`corp-tab ${tab === 'password' ? 'corp-tab-active' : ''}`}
            onClick={() => setTab('password')}
          >
            <Lock size={14} className="inline mr-1.5 -mt-0.5" />
            Password
          </button>
        </div>

        {tab === 'profile' ? (
          <form onSubmit={saveProfile} className="am-form" style={{ padding: 0 }}>
            <div className="am-form__section">
              <p className="am-form__section-title">Personal</p>
              <div className="am-form__grid">
                <div>
                  <label className="am-label">Full name *</label>
                  <input className="am-field" value={form.name || ''} onChange={setField('name')} required />
                </div>
                <div>
                  <label className="am-label">Phone number</label>
                  <input
                    className="am-field"
                    value={form.phone || ''}
                    onChange={setField('phone')}
                    placeholder="e.g. 9876543210"
                  />
                </div>
                <div className="am-form__span-2">
                  <label className="am-label">Email *</label>
                  <input
                    type="email"
                    className="am-field"
                    value={form.email || ''}
                    onChange={setField('email')}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="am-form__section">
              <p className="am-form__section-title">Professional</p>
              <div className="am-form__grid">
                <div>
                  <label className="am-label">Qualification</label>
                  <input className="am-field" value={form.qualification || ''} onChange={setField('qualification')} />
                </div>
                <div>
                  <label className="am-label">Specialization</label>
                  <input className="am-field" value={form.specialization || ''} onChange={setField('specialization')} />
                </div>
                <div>
                  <label className="am-label">Experience (years)</label>
                  <input
                    type="number"
                    min="0"
                    className="am-field"
                    value={form.experience}
                    onChange={setField('experience')}
                  />
                </div>
                <div>
                  <label className="am-label">Shift</label>
                  <select className="am-field" value={form.shift || 'morning'} onChange={setField('shift')}>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="night">Night</option>
                    <option value="rotating">Rotating</option>
                  </select>
                </div>
                {isDoctor && (
                  <>
                    <div>
                      <label className="am-label">Consultation fee (₹)</label>
                      <input
                        type="number"
                        min="0"
                        className="am-field"
                        value={form.consultationFee}
                        onChange={setField('consultationFee')}
                      />
                    </div>
                    <div>
                      <label className="am-label">Follow-up fee (₹)</label>
                      <input
                        type="number"
                        min="0"
                        className="am-field"
                        value={form.followUpFee}
                        onChange={setField('followUpFee')}
                      />
                    </div>
                    <div>
                      <label className="am-label">Morning start</label>
                      <input type="time" className="am-field" value={form.morningSessionStart || ''} onChange={setField('morningSessionStart')} />
                    </div>
                    <div>
                      <label className="am-label">Morning end</label>
                      <input type="time" className="am-field" value={form.morningSessionEnd || ''} onChange={setField('morningSessionEnd')} />
                    </div>
                    <div>
                      <label className="am-label">Evening start</label>
                      <input type="time" className="am-field" value={form.eveningSessionStart || ''} onChange={setField('eveningSessionStart')} />
                    </div>
                    <div>
                      <label className="am-label">Evening end</label>
                      <input type="time" className="am-field" value={form.eveningSessionEnd || ''} onChange={setField('eveningSessionEnd')} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="am-hint">
              Role, employee ID, and department are managed by admin and cannot be changed here.
            </p>

            <div className="am-form__footer">
              <button type="button" className="am-btn am-btn--ghost" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={saving} className="am-btn am-btn--primary">
                <Save size={14} />
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={savePassword} className="am-form" style={{ padding: 0 }}>
            <div className="am-form__section">
              <p className="am-form__section-title">Change password</p>
              <div className="am-form__grid">
                <div className="am-form__span-2">
                  <label className="am-label">Current password *</label>
                  <input
                    type="password"
                    className="am-field"
                    value={pwd.currentPassword}
                    onChange={setPwdField('currentPassword')}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div>
                  <label className="am-label">New password *</label>
                  <input
                    type="password"
                    className="am-field"
                    value={pwd.newPassword}
                    onChange={setPwdField('newPassword')}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label className="am-label">Confirm new password *</label>
                  <input
                    type="password"
                    className="am-field"
                    value={pwd.confirmNewPassword}
                    onChange={setPwdField('confirmNewPassword')}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
            </div>
            <p className="am-hint">
              Password must be at least 8 characters with uppercase, lowercase, number, and special character.
              After changing, you will be signed out and must log in again.
            </p>
            <div className="am-form__footer">
              <button type="button" className="am-btn am-btn--ghost" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={pwdSaving} className="am-btn am-btn--primary">
                <Lock size={14} />
                {pwdSaving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
