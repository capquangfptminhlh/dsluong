const UI_NOTIFICATION_EVENT = 'autotax:ui-notification';

function normalizeText(value) {
  return String(value || '').trim();
}

export function emitUiNotification({
  title = 'AutoTax',
  message = '',
  type = 'info',
  important = false,
  device = false,
  duration = 4200,
  tag,
} = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UI_NOTIFICATION_EVENT, {
    detail: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: normalizeText(title) || 'AutoTax',
      message: normalizeText(message),
      type,
      important: Boolean(important),
      device: Boolean(device),
      duration,
      tag: tag || `autotax-${type}`,
      url: window.location.pathname,
    },
  }));
}

export function subscribeUiNotifications(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => listener(event.detail || {});
  window.addEventListener(UI_NOTIFICATION_EVENT, handler);
  return () => window.removeEventListener(UI_NOTIFICATION_EVENT, handler);
}

function inferAlertType(message) {
  const text = normalizeText(message).toLowerCase();
  if (/lỗi|thất bại|không thể|không tìm thấy|không hợp lệ|từ chối/.test(text)) return 'error';
  if (/cảnh báo|sắp hết|quá hạn|thiếu|chưa/.test(text)) return 'warning';
  if (/thành công|ting ting|đã lưu|đã tạo|đã cập nhật|đã xóa|hoàn tất/.test(text)) return 'success';
  return 'info';
}

export function installLegacyAlertBridge() {
  if (typeof window === 'undefined' || window.__autotaxAlertBridgeInstalled) return () => {};

  const nativeAlert = window.alert.bind(window);
  window.__autotaxNativeAlert = nativeAlert;
  window.__autotaxAlertBridgeInstalled = true;
  window.alert = (message) => {
    const text = normalizeText(message);
    const type = inferAlertType(text);
    const lastMutation = window.__autotaxLastMutationFeedback;
    if (lastMutation && lastMutation.type === type && Date.now() - lastMutation.at < 900) return;

    const important = type === 'success' && /thanh toán|tạo đơn|đơn hàng|ting ting/.test(text.toLowerCase());
    emitUiNotification({
      title: type === 'error' ? 'Không thể hoàn tất' : type === 'success' ? 'Thành công' : type === 'warning' ? 'Cần chú ý' : 'AutoTax',
      message: text,
      type,
      important,
      device: important,
    });
  };

  return () => {
    if (window.__autotaxNativeAlert) window.alert = window.__autotaxNativeAlert;
    delete window.__autotaxNativeAlert;
    delete window.__autotaxAlertBridgeInstalled;
  };
}

export function tunnelStatusNotification(response) {
  const config = response?.config || {};
  const method = String(config.method || 'get').toLowerCase();
  if (method !== 'get') return null;

  const rawUrl = String(config.url || '');
  let path = rawUrl;
  try { path = new URL(rawUrl, window.location.origin).pathname; } catch { }
  if (!/\/api\/system\/tunnel$/.test(path)) return null;

  const data = response?.data || {};
  const lastError = normalizeText(data.lastError);
  if (data.isRunning || !lastError) return null;

  return {
    title: 'Cloudflare Tunnel đã dừng',
    message: lastError,
    type: 'error',
    important: false,
    device: true,
    tag: `tunnel-runtime-error-${lastError}`,
  };
}

export function mutationNotification(response) {
  const config = response?.config || {};
  const method = String(config.method || 'get').toLowerCase();
  if (!['post', 'put', 'patch', 'delete'].includes(method) || config.autotaxNotify === false) return null;

  const rawUrl = String(config.url || '');
  let path = rawUrl;
  try { path = new URL(rawUrl, window.location.origin).pathname; } catch { }

  if (/\/api\/system\/ping$/.test(path) || /\/api\/ai\/(parse-voice-order|chat)/.test(path)) return null;

  const data = response?.data || {};
  const total = Number(data.total_amount || data.total || 0);
  const amount = Number.isFinite(total) && total > 0 ? total.toLocaleString('vi-VN') + 'đ' : '';

  if (/\/api\/pos\/checkout$/.test(path)) {
    const code = data.order_code || data.code || '';
    return {
      title: 'Tạo đơn thành công',
      message: [code ? `Đơn ${code}` : 'Đơn bán hàng đã được tạo', amount].filter(Boolean).join(' • '),
      type: 'success', important: true, device: true, tag: code ? `order-${code}` : 'order-created',
    };
  }
  if (/\/api\/returns/.test(path)) return { title: 'Đã tạo phiếu trả hàng', message: 'Tồn kho và giao dịch liên quan đã được cập nhật.', type: 'success', important: true, device: true, tag: 'return-created' };
  if (/\/api\/(purchase|supplier-orders)/.test(path)) return { title: 'Đã lưu nhập hàng', message: 'Phiếu nhập hoặc đơn nhà cung cấp đã được cập nhật.', type: 'success', device: true, tag: 'purchase-saved' };
  if (/\/api\/inventory/.test(path)) return { title: 'Kho hàng đã cập nhật', message: 'Thay đổi tồn kho đã được lưu.', type: 'success', device: true, tag: 'inventory-updated' };
  if (/\/api\/products/.test(path)) return { title: method === 'delete' ? 'Đã xóa sản phẩm' : method === 'post' ? 'Đã tạo sản phẩm' : 'Đã cập nhật sản phẩm', message: 'Dữ liệu sản phẩm đã được lưu thành công.', type: 'success', device: true, tag: 'product-saved' };
  if (/\/api\/customers/.test(path)) return { title: 'Khách hàng đã cập nhật', message: 'Thông tin khách hàng đã được lưu.', type: 'success', device: true, tag: 'customer-saved' };
  if (/\/api\/suppliers/.test(path)) return { title: 'Nhà cung cấp đã cập nhật', message: 'Thông tin nhà cung cấp đã được lưu.', type: 'success', device: true, tag: 'supplier-saved' };
  if (/\/api\/(finance|transactions|debt)/.test(path)) return { title: 'Tài chính đã cập nhật', message: 'Giao dịch thu chi hoặc công nợ đã được lưu.', type: 'success', important: true, device: true, tag: 'finance-updated' };
  if (/\/api\/settings/.test(path)) return { title: 'Đã lưu cài đặt', message: 'Thiết lập cửa hàng đã được cập nhật.', type: 'success', device: true, tag: 'settings-saved' };
  if (method === 'post' && /\/api\/system\/tunnel\/start$/.test(path)) return { title: 'Tunnel đang khởi động', message: 'Đang chờ Cloudflare cấp URL truy cập công khai.', type: 'info', device: false, tag: 'tunnel-starting' };
  if (method === 'post' && /\/api\/system\/tunnel\/stop$/.test(path)) return { title: 'Tunnel đã dừng', message: 'Kết nối Cloudflare Tunnel đã được dừng.', type: 'success', device: false, tag: 'tunnel-stopped' };
  if (method === 'post' && /\/api\/backup\/create$/.test(path)) return { title: 'Sao lưu hoàn tất', message: 'Bản sao lưu mới đã được tạo an toàn.', type: 'success', important: true, device: true, tag: 'backup-complete' };
  if (method === 'post' && /\/api\/backup\/restore$/.test(path)) return { title: 'Đã xếp hàng khôi phục', message: 'Bản sao lưu đã được kiểm tra và sẽ áp dụng khi backend khởi động lại.', type: 'success', important: true, device: true, tag: 'restore-queued' };
  if (method === 'delete' && /\/api\/backup\/restore\/pending$/.test(path)) return { title: 'Đã hủy khôi phục', message: 'Yêu cầu khôi phục đang chờ đã được hủy.', type: 'success', device: true, tag: 'restore-cancelled' };
  if (method === 'delete' && /\/api\/backup\/[^/]+$/.test(path)) return { title: 'Đã xóa bản sao lưu', message: 'Bản sao lưu đã được xóa khỏi máy chủ.', type: 'success', device: true, tag: 'backup-deleted' };

  return {
    title: method === 'delete' ? 'Đã xóa thành công' : method === 'post' ? 'Đã tạo thành công' : 'Đã lưu thay đổi',
    message: 'Thao tác của bạn đã được AutoTax ghi nhận.',
    type: 'success', device: true, tag: `mutation-${method}`,
  };
}
