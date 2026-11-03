# Nâng cấp Bảo mật AutoTax — Hướng dẫn áp dụng

Bộ này vá 4 lỗ hổng nghiêm trọng đã phát hiện:

1. **Không có xác thực thật** → thêm mật khẩu (bcrypt) + token đăng nhập (JWT).
2. **IDOR** (client tự khai `x-user-id`/`user_id` → đọc dữ liệu cửa hàng khác) → danh tính lấy từ token đã ký.
3. **Lộ toàn bộ khách hàng** (`/api/auth/users` ai cũng gọi được) → chỉ superadmin.
4. **Rò tenant** (`debts`, `cash_flows`, `system_settings` dùng chung) → tách theo cửa hàng + audit log.

Tất cả file trong bộ này đã được chạy thử thật: bcrypt/JWT round-trip OK, migration chạy sạch trên chính file `autotax.db` của bạn.

---

## Bước 1 — Cài 2 thư viện

```bash
cd backend
npm install bcryptjs jsonwebtoken
```
> Dùng `bcryptjs` (thuần JavaScript) chứ không phải `bcrypt`, vì `bcrypt` cần biên dịch native — sẽ gãy khi bạn đóng gói kèm `.exe` trên Windows. `bcryptjs` không có vấn đề đó.

## Bước 2 — Chạy migration (nâng cấp DB, không mất dữ liệu)

Chép `migrate_security.js` vào thư mục `backend/` rồi:
```bash
cd backend
node migrate_security.js
```
Chạy lại nhiều lần cũng an toàn (tự bỏ qua cột/bảng đã có). Nên **sao lưu `autotax.db`** trước cho chắc.

## Bước 3 — Đặt file vào đúng chỗ

```
backend/
├── middleware/
│   └── auth.js            ← MỚI
├── routes/
│   ├── authRoutes.js      ← THAY THẾ bản cũ
│   └── staffRoutes.js     ← THAY THẾ bản cũ (dùng làm khuôn mẫu)
└── migrate_security.js    ← MỚI (chạy 1 lần)
```

## Bước 4 — Đặt JWT secret (quan trọng)

Đừng để secret mặc định khi lên production. Đặt biến môi trường trước khi chạy server:
```bat
set JWT_SECRET=chuoi-bi-mat-that-dai-va-ngau-nhien-cua-ban
set SUPERADMIN_PHONE=0979164124
node server.js
```
(hoặc thêm vào file `.bat` khởi động của bạn).

---

## Bước 5 — Vá từng route còn lại theo KHUÔN (phần việc chính)

Đây là bước lặp đi lặp lại. Trong **mọi** file route, tìm và thay:

```js
// ❌ CŨ — client tự khai, ai cũng giả mạo được
const userId = req.headers['x-user-id'] || 'default_user';
const user_id = req.query.user_id || 'default_user';

// ✅ MỚI — lấy từ token đã ký, không thể giả mạo
const userId = req.tenantId;
```

Và ở đầu mỗi file route, thêm:
```js
const { requireAuth, requireOwner, requirePermission, writeAudit } = require('../middleware/auth');
router.use(requireAuth);              // mọi route trong file cần đăng nhập
```

Gắn quyền theo module cho các route đọc dữ liệu nhạy cảm:
```js
router.get('/revenue', requirePermission('reports'), (req, res) => { ... });
```

Ghi audit ở các hành động nhạy cảm (hủy đơn, sửa giá, xóa hàng):
```js
writeAudit(req, { action: 'order.void', target: orderCode, detail: { reason } });
writeAudit(req, { action: 'product.price_change', target: productId, detail: { old: 100000, new: 90000 } });
```

### Thứ tự nên vá (ưu tiên chỗ dính tiền/dữ liệu):
1. `transactionRoutes.js` — sổ thuế (dùng `req.query.user_id`)
2. `posRoutes.js` — checkout (dùng `x-user-id`)
3. `financeRoutes.js` — **thêm `user_id = req.tenantId` vào MỌI query debts/cash_flows** (trước đây không lọc gì cả)
4. `productRoutes.js`, `inventoryRoutes.js`, `customerRoutes.js`
5. `reportRoutes.js`, `loyaltyRoutes.js`, còn lại

> `staffRoutes.js` trong bộ này đã vá sẵn — đọc nó để nắm khuôn, rồi nhân bản cách làm sang các file trên.

## Bước 6 — Sửa `system_settings` (đang dùng chung mọi cửa hàng)

`settingsRoutes.js` hiện đọc/ghi bảng `system_settings` không kèm cửa hàng → tài khoản ngân hàng của cửa hàng A hiện ra ở cửa hàng B. Chuyển sang bảng `shop_settings` (migration đã tạo):
```js
router.get('/:key', requireAuth, (req, res) => {
  db.get('SELECT value FROM shop_settings WHERE user_id = ? AND key = ?',
    [req.tenantId, req.params.key], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ value: row ? row.value : '' });
    });
});
router.post('/', requireAuth, requireOwner, (req, res) => {
  const { key, value } = req.body;
  db.run(`INSERT INTO shop_settings (user_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT(user_id, key) DO UPDATE SET value = ?`,
    [req.tenantId, key, value, value], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});
```

## Bước 7 — Frontend gửi token

Sau khi đăng nhập, lưu `token` (trong bộ nhớ/React state) và đính vào mọi request:
```js
axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
// Bỏ hẳn việc gửi header 'x-user-id' — không còn tác dụng và không nên tin nữa.
```
Menu admin: thay vì so sánh số điện thoại ở frontend, đọc `role` từ phản hồi đăng nhập (`role === 'superadmin'`).

---

## Sau khi xong — kiểm tra nhanh

- [ ] Gọi `GET /api/auth/users` khi CHƯA đăng nhập → phải trả **401**, không trả danh sách.
- [ ] Đăng nhập cửa hàng A, đổi `user_id` trong URL sang B → không còn thấy dữ liệu B.
- [ ] Đăng nhập sai mật khẩu 6 lần → bị chặn **429** (5 phút).
- [ ] Hủy một đơn → có dòng trong `GET /api/staff/audit-log`.
- [ ] Nhân viên không có quyền `reports` gọi `/api/reports/...` → **403**.

## Lưu ý còn lại (không chặn ra mắt nhưng nên làm)
- Link WAN công khai: cân nhắc đổi URL định kỳ + cảnh báo khi có thiết bị lạ.
- Nếu thật sự đi hướng SaaS cloud nhiều nghìn cửa hàng: cân nhắc chuyển `sqlite3` → PostgreSQL (SQLite serialize ghi, sẽ nghẽn khi đông).
- Backup tự động file `.db` hằng đêm.
