import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import toast from 'react-hot-toast';

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    localStorage.setItem('hms_token', data.token);
    return data.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Login failed');
  }
});

export const checkAuth = createAsyncThunk('auth/checkAuth', async (_, { rejectWithValue }) => {
  const token = localStorage.getItem('hms_token');
  if (!token) return rejectWithValue('No token');
  try {
    const { data } = await api.get('/auth/me');
    return data.data;
  } catch {
    localStorage.removeItem('hms_token');
    return rejectWithValue('Auth failed');
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; toast.success(`Welcome, ${action.payload.name}!`); })
      .addCase(login.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(checkAuth.pending, (state) => { state.loading = true; })
      .addCase(checkAuth.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; })
      .addCase(checkAuth.rejected, (state) => { state.loading = false; state.user = null; })
      .addCase(logout.fulfilled, (state) => { state.user = null; state.loading = false; });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
