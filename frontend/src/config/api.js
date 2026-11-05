import axios from 'axios';

// Kết nối API:
// 1. Môi trường dev (localhost) -> http://localhost:3001
// 2. Chạy trên GitHub Pages (dsluong) -> https://autotaxpos.com
// 3. Chạy trực tiếp trên domain autotaxpos.com -> '' (same-origin)
const isGithubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
const API_BASE = import.meta.env.DEV 
  ? 'http://localhost:3001' 
  : (isGithubPages ? 'https://autotaxpos.com' : '');

// Tự động gắn Authorization token cho TẤT CẢ request
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

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
