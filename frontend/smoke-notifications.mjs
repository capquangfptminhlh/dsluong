globalThis.window = { location: { origin: 'http://localhost', pathname: '/app/pos' } };

const { mutationNotification, tunnelStatusNotification } = await import('./src/utils/uiEvents.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const order = mutationNotification({
  config: { method: 'post', url: '/api/pos/checkout' },
  data: { order_code: 'AT-DEMO-001', total_amount: 1250000 },
});
assert(order?.title === 'Tạo đơn thành công', 'Checkout phải có thông báo tạo đơn riêng');
assert(order?.message.includes('AT-DEMO-001'), 'Thông báo checkout phải có mã đơn');
assert(order?.message.includes('1.250.000đ'), 'Thông báo checkout phải có số tiền');
assert(order?.important === true && order?.device === true, 'Checkout phải là notification quan trọng trên điện thoại');

const ping = mutationNotification({ config: { method: 'post', url: '/api/system/ping' }, data: {} });
assert(ping === null, 'System ping không được tạo toast');

const product = mutationNotification({ config: { method: 'patch', url: '/api/products/12' }, data: {} });
assert(product?.type === 'success' && /sản phẩm/i.test(product?.title || ''), 'Cập nhật sản phẩm phải có feedback rõ ràng');

const finance = mutationNotification({ config: { method: 'post', url: '/api/transactions' }, data: {} });
assert(finance?.device === true, 'Thao tác tài chính quan trọng phải hỗ trợ notification điện thoại');

const tunnelStarting = mutationNotification({ config: { method: 'post', url: '/api/system/tunnel/start' }, data: { message: 'Cloudflare Tunnel đang khởi động.' } });
assert(tunnelStarting?.title === 'Tunnel đang khởi động', 'Tunnel start 202 không được báo hoàn tất thành công');
assert(tunnelStarting?.type === 'info', 'Tunnel start phải là trạng thái đang xử lý');

const tunnelStopped = mutationNotification({ config: { method: 'post', url: '/api/system/tunnel/stop' }, data: { message: 'Cloudflare Tunnel đã dừng.' } });
assert(tunnelStopped?.title === 'Tunnel đã dừng', 'Tunnel stop phải báo đúng lifecycle');

const tunnelRuntimeError = tunnelStatusNotification({
  config: { method: 'get', url: '/api/system/tunnel' },
  data: { isRunning: false, url: null, lastError: 'cloudflared dừng với mã 1' },
});
assert(tunnelRuntimeError?.type === 'error', 'Tunnel chết sau 202 phải phát notification lỗi');
assert(tunnelRuntimeError?.message === 'cloudflared dừng với mã 1', 'Phải hiển thị đúng lastError do backend trả về');

const healthyTunnel = tunnelStatusNotification({
  config: { method: 'get', url: '/api/system/tunnel' },
  data: { isRunning: true, url: 'https://demo.trycloudflare.com', lastError: null },
});
assert(healthyTunnel === null, 'Tunnel đang chạy bình thường không được phát lỗi giả');

const backupCreated = mutationNotification({ config: { method: 'post', url: '/api/backup/create' }, data: {} });
assert(backupCreated?.title === 'Sao lưu hoàn tất', 'Tạo backup phải báo sao lưu hoàn tất');

const restoreQueued = mutationNotification({ config: { method: 'post', url: '/api/backup/restore' }, data: {} });
assert(restoreQueued?.title === 'Đã xếp hàng khôi phục', 'Upload restore không được báo sao lưu hoàn tất');

const restoreCancelled = mutationNotification({ config: { method: 'delete', url: '/api/backup/restore/pending' }, data: {} });
assert(restoreCancelled?.title === 'Đã hủy khôi phục', 'Hủy restore phải có thông báo riêng');

const backupDeleted = mutationNotification({ config: { method: 'delete', url: '/api/backup/autotax-20260813.db' }, data: {} });
assert(backupDeleted?.title === 'Đã xóa bản sao lưu', 'Xóa backup phải báo đúng hành động');

console.log('NOTIFICATION SMOKE PASSED: checkout + silent ping + product + finance + tunnel lifecycle/runtime error + backup lifecycle mappings');
