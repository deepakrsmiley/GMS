import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarOpen: true,
    darkMode: localStorage.getItem('hms_dark') === 'true',
    activeModal: null,
  },
  reducers: {
    toggleSidebar: (state) => { state.sidebarOpen = !state.sidebarOpen; },
    setSidebarOpen: (state, action) => { state.sidebarOpen = action.payload; },
    toggleDarkMode: (state) => {
      state.darkMode = !state.darkMode;
      localStorage.setItem('hms_dark', state.darkMode);
      if (state.darkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    },
    openModal: (state, action) => { state.activeModal = action.payload; },
    closeModal: (state) => { state.activeModal = null; },
  },
});

export const { toggleSidebar, setSidebarOpen, toggleDarkMode, openModal, closeModal } = uiSlice.actions;
export default uiSlice.reducer;
