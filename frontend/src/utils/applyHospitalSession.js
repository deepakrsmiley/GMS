import { setUser } from '../redux/slices/authSlice';
import { disconnectSocket, initSocket } from '../services/socket';

export const applyHospitalSession = async (payload, dispatch, queryClient) => {
  if (payload?.token) localStorage.setItem('hms_token', payload.token);
  if (payload?.data) dispatch(setUser(payload.data));
  disconnectSocket();
  if (payload?.data?._id) initSocket(payload.data._id, payload.data.role);
  if (queryClient?.invalidateQueries) {
    await queryClient.invalidateQueries();
  }
};
