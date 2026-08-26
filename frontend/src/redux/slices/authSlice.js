import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import toast from 'react-hot-toast';

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials, { skipErrorToast: true });
    localStorage.setItem('hms_token', data.token);
    return data.data;
  } catch (err) {
    const body = err.response?.data;
    if (body?.requiresOrganization && Array.isArray(body.hospitals)) {
      return rejectWithValue({
        requiresOrganization: true,
        hospitals: body.hospitals,
        message: body.message || 'Select your hospital to continue.',
      });
    }
    return rejectWithValue(body?.message || 'Login failed');
  }
});

export const checkAuth = createAsyncThunk('auth/checkAuth', async (_, { rejectWithValue, getState }) => {
  const token = localStorage.getItem('hms_token');
  if (!token) return rejectWithValue({ reason: 'no_token' });
  try {
    const { data } = await api.get('/auth/me');
    return data.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('hms_token');
      return rejectWithValue({ reason: 'auth_failed' });
    }
    const hasUser = Boolean(getState()?.auth?.user);
    if (hasUser) return rejectWithValue({ reason: 'network' });
    return rejectWithValue({ reason: 'auth_failed' });
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.get('/auth/logout').catch(() => {});
  localStorage.removeItem('hms_token');
});

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, loading: true, error: null },
  reducers: {
    clearError: (state) => { state.error = null; },
    setUser: (state, action) => { state.user = action.payload; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; toast.success(`Welcome, ${action.payload.name}!`); })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = typeof action.payload === 'string'
          ? action.payload
          : action.payload?.message || 'Login failed';
      })
      .addCase(checkAuth.pending, (state) => { if (!state.user) state.loading = true; })
      .addCase(checkAuth.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; })
      .addCase(checkAuth.rejected, (state, action) => {
        state.loading = false;
        if (action.payload?.reason === 'network' && state.user) return;
        state.user = null;
      })
      .addCase(logout.fulfilled, (state) => { state.user = null; state.loading = false; });
  },
});

export const { clearError, setUser } = authSlice.actions;
export default authSlice.reducer;
