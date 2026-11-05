import axios from 'axios';
import { initPharmacyStandaloneEngine } from './pharmacyStandaloneEngine';

// Cấu hình kết nối độc lập cho Hệ thống Quản lý Nhà Thuốc Nhân Đức GPP
const customBackendUrl = import.meta.env.VITE_API_URL || (typeof localStorage !== 'undefined' && localStorage.getItem('NHANDUC_API_URL')) || '';
const API_BASE = customBackendUrl;

// Kích hoạt cơ sở dữ liệu độc lập Nhà Thuốc Nhân Đức khi chạy trực tiếp trên web tĩnh (GitHub Pages / Cloudflare)
if (!customBackendUrl) {
  initPharmacyStandaloneEngine(axios);
}

// Tự động gắn Authorization token cho mọi request
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default API_BASE;

// Tải file xuất (Excel/PDF) có kèm token
export async function downloadAuthFile(path, filename) {
  const res = await axios.get(`${API_BASE}${path}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
