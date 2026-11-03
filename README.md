# AutoTax ERP

Phần mềm quản lý bán hàng & khai thuế cho hộ kinh doanh Việt Nam.
Chạy tại chỗ (local) — máy của bạn vừa là máy chủ vừa là máy dùng.

## Tính năng

**Bán hàng**
- POS cho 5 ngành: bán lẻ, F&B, spa, khách sạn, pet shop
- Chiết khấu theo đơn/theo dòng, khuyến mãi tự gợi ý, VAT
- Thanh toán nhiều hình thức trên một đơn, bán ghi nợ
- In hóa đơn khổ K80, quét mã vạch (camera hoặc máy quét USB)
- Trả hàng, chốt ca thu ngân (đối chiếu tiền mặt)

**Hàng hóa & Kho**
- Sản phẩm, biến thể, danh mục, nhập từ Excel
- Bảng giá nhiều mức (lẻ / sỉ / VIP), gán mức giá cho khách
- Đơn vị quy đổi (thùng ↔ lốc ↔ lon)
- Lô & hạn sử dụng, bán tự trừ lô sắp hết hạn trước (FEFO)
- Combo bán theo bộ, serial/IMEI, bảo hành
- In tem mã vạch
- **Nhiều chi nhánh/kho**, chuyển kho giữa chi nhánh

**Mua hàng**
- Nhà cung cấp, phiếu nhập, giá vốn bình quân gia quyền
- Đặt hàng NCC trước, khi hàng về mới cộng kho
- Trả hàng NCC, tự giảm công nợ phải trả

**Tài chính & Thuế**
- Sổ quỹ thu chi, in phiếu thu/chi
- Công nợ phải thu / phải trả
- Báo cáo: lãi lỗ theo mặt hàng, định giá tồn kho, hàng bán chạy
- Sổ bán hàng S2-HKD, tờ khai 01/CNKD

**Quản trị**
- Đăng nhập có mật khẩu, phân quyền nhân viên theo 17 module
- Nhật ký thao tác (ai làm gì, lúc nào)
- Sao lưu / khôi phục dữ liệu, tự sao lưu hằng ngày

## Cài đặt

Cần [Node.js](https://nodejs.org) 20 trở lên.

```bash
# 1. Cài thư viện
cd backend && npm install
cd ../frontend && npm install

# 2. Tạo file khóa bí mật
#    Chép secrets.example.bat -> secrets.bat rồi điền chuỗi ngẫu nhiên của bạn

# 3. Chạy migration tạo bảng
cd backend
node migrate.js
node migrate_security.js
node migrate_tenant_isolation.js
node migrate_shared_tables.js
node migrate_purchase.js
node migrate_returns_shift.js
node migrate_products_adv.js
node migrate_combo_serial.js
node migrate_branches.js
```

Khởi động: chạy `start-production.bat`, mở `http://localhost:3001`.

## Bảo mật

- `secrets.bat` chứa khóa ký token đăng nhập — **không bao giờ đưa lên GitHub**
- Cơ sở dữ liệu `backend/autotax.db` và thư mục `backend/backups/` cũng không đưa lên
- Mọi truy vấn đều lọc theo cửa hàng; server tự tính tiền, không tin số client gửi lên
- Webhook ngân hàng/sàn TMĐT bắt buộc có khóa bí mật

## Sao lưu

Phần mềm tự sao lưu mỗi ngày vào `backend/backups/`, giữ 30 bản gần nhất.
Vào **Cài đặt → Sao lưu & Khôi phục** để tải bản sao lưu về USB/Google Drive.

## Công nghệ

React 19 + Vite + Tailwind · Express 5 + SQLite
