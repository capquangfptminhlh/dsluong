/**
 * Tiện ích phân quyền phía giao diện.
 *
 * LƯU Ý QUAN TRỌNG: đây chỉ để ẨN menu cho đỡ rối mắt.
 * Việc chặn thật nằm ở backend (middleware/auth.js) — người dùng có sửa
 * localStorage cũng không lấy được dữ liệu, vì server kiểm tra quyền trong token đã ký.
 */

export function layNguoiDung() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

/** Chỉ platform superadmin, không đồng nhất với chủ cửa hàng. */
export function laSuperadmin() {
  return String(layNguoiDung().role || '').toLowerCase() === 'superadmin';
}

/** Chủ cửa hàng / superadmin có toàn quyền trong phạm vi tenant. */
export function laChuCuaHang() {
  const u = layNguoiDung();
  return u.role !== 'staff';
}

/** Có quyền vào ít nhất một trong các module truyền vào không? */
export function coQuyen(...modules) {
  if (modules.includes('__superadmin__')) return laSuperadmin();
  if (laChuCuaHang()) return true;
  if (modules.length === 0) return true;
  const u = layNguoiDung();
  const ds = Array.isArray(u.permissions) ? u.permissions : [];
  return modules.some((m) => ds.includes(m));
}
