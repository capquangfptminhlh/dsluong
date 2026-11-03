import axios from 'axios';
import { emitUiNotification, mutationNotification, tunnelStatusNotification } from '../utils/uiEvents';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
let authRecheckPromise = null;

async function confirmSessionExpired(token) {
  if (!token) return true;
  if (!authRecheckPromise) {
    authRecheckPromise = fetch(`${API_BASE}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.status === 401)
      .catch(() => false)
      .finally(() => { authRecheckPromise = null; });
  }
  return authRecheckPromise;
}

function clearExpiredSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
}

// Danh tính của người dùng chỉ đi qua Bearer token. Không gửi user_id/tenant_id
// từ client để tránh tạo thêm nguồn danh tính cạnh tranh với JWT ở backend.
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// Một điểm duy nhất cho feedback của toàn app: mọi thao tác ghi dữ liệu thành công
// đều phát toast; khi người dùng bật notification, feedback cũng có thể lên điện thoại.
axios.interceptors.response.use(
  (response) => {
    const tunnelNotification = tunnelStatusNotification(response);
    if (tunnelNotification && window.__autotaxLastTunnelErrorTag !== tunnelNotification.tag) {
      window.__autotaxLastTunnelErrorTag = tunnelNotification.tag;
      emitUiNotification(tunnelNotification);
    }

    const notification = mutationNotification(response);
    if (notification) {
      window.__autotaxLastMutationFeedback = { at: Date.now(), type: notification.type || 'success' };
      emitUiNotification(notification);
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      const token = localStorage.getItem('token');
      if (token && await confirmSessionExpired(token)) clearExpiredSession();
    }

    const method = String(error.config?.method || 'get').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method) && error.config?.autotaxNotify !== false && error.response?.status !== 401) {
      window.__autotaxLastMutationFeedback = { at: Date.now(), type: 'error' };
      emitUiNotification({
        title: 'Thao tác chưa hoàn tất',
        message: error.response?.data?.error || error.response?.data?.message || 'AutoTax chưa thể lưu thay đổi. Vui lòng kiểm tra lại dữ liệu.',
        type: 'error',
        important: false,
        device: true,
        tag: 'mutation-error',
      });
    }
    return Promise.reject(error);
  },
);

export default API_BASE;

export async function downloadAuthFile(path, filename) {
  const res = await axios.get(`${API_BASE}${path}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
