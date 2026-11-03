const express = require('express');
const router = express.Router();
const db = require('../db');
const { triggerEvent } = require('./workflowRoutes');
const { requireAuth, requireWebhookSecret, requireAnyPermission, writeAudit } = require('../middleware/auth');
const { doiTonChiNhanh, chiNhanhMacDinh } = require('./branchRoutes');
const { resolvePosBranch } = require('../utils/branchAccess');

const quyenBanHang = requireAnyPermission('pos');
const quyenDonHang = requireAnyPermission('orders', 'pos');

/**
 * Nhóm ngành nghề tính thuế khoán cho doanh thu bán qua POS.
 *
 * TRƯỚC ĐÂY ghi cứng 'Doanh thu bán hàng hóa' — chuỗi này KHÔNG khớp 4 nhóm
 * mà phần tính thuế nhận diện, nên mọi đơn POS đều ra thuế 0đ và không lên
 * được sổ S2-HKD/tờ khai 01-CNKD.
 *
 * Thứ tự ưu tiên: cài đặt riêng của cửa hàng (shop_settings.tax_category)
 * -> suy ra từ ngành nghề -> mặc định nhóm phân phối hàng hóa.
 *
 * LƯU Ý: đây là suy đoán theo ngành nghề đăng ký, chủ cửa hàng nên đối chiếu
 * với cơ quan thuế và chỉnh lại qua cài đặt nếu khác.
 */
const NHOM_THUE = {
  PHAN_PHOI: 'Phân phối, cung cấp hàng hóa (1.5%)',
  DICH_VU: 'Dịch vụ, xây dựng không bao thầu NVL (7%)',
  SAN_XUAT: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa (4.5%)',
  KHAC: 'Hoạt động kinh doanh khác (3%)',
};

const NGANH_SANG_NHOM = {
  retail: NHOM_THUE.PHAN_PHOI,
  fashion: NHOM_THUE.PHAN_PHOI,
  petshop: NHOM_THUE.PHAN_PHOI,
  fnb: NHOM_THUE.SAN_XUAT,
  spa: NHOM_THUE.DICH_VU,
  clinic: NHOM_THUE.DICH_VU,
  hotel: NHOM_THUE.DICH_VU,
};

/**
 * Trừ lô theo nguyên tắc HẠN DÙNG GẦN NHẤT BÁN TRƯỚC (FEFO).
 * Chỉ áp dụng cho sản phẩm đang theo dõi lô; hàng không quản lô thì bỏ qua.
 */
function truLoTheoHanDung(userId, productId, soLuong) {
  db.all(
    `SELECT id, quantity FROM product_batches
     WHERE user_id = ? AND product_id = ? AND quantity > 0
     ORDER BY (expiry_date IS NULL), expiry_date ASC, id ASC`,
    [userId, productId],
    (err, los) => {
      if (err || !los || los.length === 0) return; // không quản lô
      let conLai = soLuong;
      for (const lo of los) {
        if (conLai <= 0) break;
        const tru = Math.min(lo.quantity, conLai);
        db.run('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?', [tru, lo.id]);
        conLai -= tru;
      }
    }
  );
}

/** Xác định chi nhánh bán hàng: client gửi lên, hoặc lấy chi nhánh mặc định */
function layChiNhanh(userId, branchId, xong) {
  if (branchId) {
    db.get('SELECT id FROM branches WHERE id = ? AND user_id = ?', [branchId, userId], (e, cn) => xong(cn ? cn.id : null));
    return;
  }
  chiNhanhMacDinh(userId).then(xong).catch(() => xong(null));
}

function layNhomThue(userId, xong) {
  db.get('SELECT value FROM shop_settings WHERE user_id = ? AND key = ?', [userId, 'tax_category'], (err, row) => {
    if (!err && row && row.value) return xong(row.value);
    db.get('SELECT sector FROM users WHERE phone = ?', [userId], (err2, u) => {
      const nhom = (!err2 && u && NGANH_SANG_NHOM[u.sector]) || NHOM_THUE.PHAN_PHOI;
      xong(nhom);
    });
  });
}
// LƯU Ý: không dùng router.use(requireAuth) ở đây vì /vietqr-webhook phải công khai cho ngân hàng gọi vào

// Checkout (Create POS order & save to transactions)
router.post('/checkout', requireAuth, quyenBanHang, (req, res) => {
  const {
    cart, customer_name, customer_phone, payment_method,
    discount = 0, promotion_id = null, vat_rate = 0,
    paid_cash, paid_bank, cho_no = false, branch_id = null,
  } = req.body;
  const userId = req.tenantId;

  if (!cart || cart.length === 0) return res.status(400).json({ error: "Cart is empty" });

  /**
   * TÍNH TIỀN — làm ở server, KHÔNG tin số client gửi lên.
   * Trước đây total_amount lấy thẳng từ client nên sửa được giá bằng công cụ trình duyệt.
   *   tiền hàng = Σ (giá × số lượng − giảm giá từng dòng)
   *   phải trả  = tiền hàng − giảm giá đơn + VAT
   */
  let subtotal = 0;
  for (const it of cart) {
    const sl = Number(it.quantity) || 0;
    const gia = Number(it.price) || 0;
    const giamDong = Number(it.discount) || 0;
    if (sl <= 0) return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
    if (gia < 0 || giamDong < 0) return res.status(400).json({ error: 'Giá và giảm giá không được âm' });
    subtotal += sl * gia - giamDong;
  }
  const giamDon = Math.max(0, Number(discount) || 0);
  if (giamDon > subtotal) return res.status(400).json({ error: 'Giảm giá lớn hơn tiền hàng' });

  const tienSauGiam = subtotal - giamDon;
  const thueSuat = Math.max(0, Number(vat_rate) || 0);
  const tienVAT = Math.round(tienSauGiam * thueSuat / 100);
  const total_amount = tienSauGiam + tienVAT;

  // Thanh toán: có thể chia tiền mặt + chuyển khoản trên cùng một đơn
  let traTienMat = Number(paid_cash);
  let traChuyenKhoan = Number(paid_bank);
  if (isNaN(traTienMat) && isNaN(traChuyenKhoan)) {
    // Tương thích cách gọi cũ: chỉ gửi payment_method
    traTienMat = payment_method === 'bank' ? 0 : total_amount;
    traChuyenKhoan = payment_method === 'bank' ? total_amount : 0;
  }
  traTienMat = Math.max(0, traTienMat || 0);
  traChuyenKhoan = Math.max(0, traChuyenKhoan || 0);

  const daTra = traTienMat + traChuyenKhoan;
  const conNo = Math.max(0, total_amount - daTra);

  if (conNo > 0 && !cho_no) {
    return res.status(400).json({ error: `Khách còn thiếu ${conNo.toLocaleString('vi-VN')}đ. Bật "bán ghi nợ" nếu muốn cho nợ.` });
  }
  if (conNo > 0 && !customer_phone) {
    return res.status(400).json({ error: 'Bán ghi nợ phải có số điện thoại khách để theo dõi công nợ' });
  }

  const hinhThuc = traChuyenKhoan > 0 && traTienMat > 0 ? 'mixed' : (traChuyenKhoan > 0 ? 'bank' : 'cash');
  const orderCode = `DH${Date.now().toString().slice(-6)}`;
  const dateStr = new Date().toISOString().split('T')[0];

  // Chặn bán hàng bằng sản phẩm của cửa hàng khác: mọi product_id trong giỏ phải thuộc cửa hàng này
  // (dòng combo không có product_id nên bỏ qua ở đây, được kiểm riêng bên dưới)
  const ids = cart.filter(i => !i.combo_id).map(i => i.id).filter(Boolean);
  const kiemTraGio = (tiepTuc) => {
    if (ids.length === 0) return kiemTraCombo(tiepTuc);
    const ph = ids.map(() => '?').join(',');
    db.all(`SELECT id FROM products WHERE id IN (${ph}) AND user_id = ?`, [...ids, userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const hopLe = new Set(rows.map(r => r.id));
      const la = ids.filter(id => !hopLe.has(id));
      if (la.length) return res.status(403).json({ error: 'Giỏ hàng chứa sản phẩm không thuộc cửa hàng của bạn' });
      kiemTraCombo(tiepTuc);
    });
  };

  // Combo trong giỏ cũng phải thuộc cửa hàng này
  const kiemTraCombo = (tiepTuc) => {
    const cbIds = cart.map(i => i.combo_id).filter(Boolean);
    if (cbIds.length === 0) return tiepTuc();
    const ph = cbIds.map(() => '?').join(',');
    db.all(`SELECT id FROM combos WHERE id IN (${ph}) AND user_id = ?`, [...cbIds, userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const hopLe = new Set(rows.map(r => r.id));
      if (cbIds.some(id => !hopLe.has(id))) {
        return res.status(403).json({ error: 'Giỏ hàng chứa combo không thuộc cửa hàng của bạn' });
      }
      tiepTuc();
    });
  };

  kiemTraGio(() => layNhomThue(userId, (nhomThue) => layChiNhanh(userId, branch_id, (chiNhanh) => db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // 1. Insert into pos_orders
    db.run(`
      INSERT INTO pos_orders
        (user_id, order_code, subtotal, discount, promotion_id, vat_rate, vat_amount,
         total_amount, paid_cash, paid_bank, debt_amount, customer_name, customer_phone, payment_method, branch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, orderCode, subtotal, giamDon, promotion_id, thueSuat, tienVAT,
        total_amount, traTienMat, traChuyenKhoan, conNo, customer_name, customer_phone, hinhThuc, chiNhanh], function(err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: err.message });
      }

      const orderId = this.lastID;

      /**
       * 2. Lưu chi tiết đơn + trừ kho.
       * Bán theo đơn vị lớn (thùng/lốc) thì trừ kho theo ĐƠN VỊ GỐC:
       *   bán 2 thùng, 1 thùng = 24 lon  ->  trừ 48 lon.
       */
      const stmt = db.prepare(`INSERT INTO pos_order_items (order_id, product_id, product_name, quantity, price, discount, unit_name, unit_ratio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      // AND user_id = ? -> không trừ nhầm kho của cửa hàng khác
      const stockStmt = db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?`);

      cart.forEach(item => {
        const tyLe = Number(item.unit_ratio) > 0 ? Number(item.unit_ratio) : 1;
        const soLuongGoc = Number(item.quantity) * tyLe;
        stmt.run(orderId, item.id || null, item.name, item.quantity, item.price,
          Number(item.discount) || 0, item.unit_name || null, tyLe);

        if (item.combo_id) {
          // Bán combo: trừ kho từng món thành phần theo số bộ đã bán
          db.all('SELECT product_id, quantity FROM combo_items WHERE combo_id = ?', [item.combo_id], (e, tp) => {
            if (e || !tp) return;
            tp.forEach((mon) => {
              const can = mon.quantity * Number(item.quantity);
              if (chiNhanh) doiTonChiNhanh(chiNhanh, mon.product_id, -can);
              else db.run('UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?', [can, mon.product_id, userId]);
              truLoTheoHanDung(userId, mon.product_id, can);
            });
          });
        } else if (item.id) {
          // Có chi nhánh -> trừ kho chi nhánh (hàm tự cập nhật lại tổng tồn sản phẩm)
          if (chiNhanh) doiTonChiNhanh(chiNhanh, item.id, -soLuongGoc);
          else stockStmt.run(soLuongGoc, item.id, userId);
          truLoTheoHanDung(userId, item.id, soLuongGoc);

          // Bán hàng có serial: đánh dấu đã bán + lập bảo hành nếu sản phẩm có
          if (Array.isArray(item.serials) && item.serials.length) {
            item.serials.forEach((sr) => {
              db.run(
                `UPDATE product_serials SET status = 'sold', order_code = ?, sold_at = CURRENT_TIMESTAMP
                 WHERE user_id = ? AND serial = ? AND status = 'in_stock'`,
                [orderCode, userId, sr]
              );
            });
            db.get('SELECT name, warranty_months FROM products WHERE id = ? AND user_id = ?', [item.id, userId], (e, sp) => {
              if (e || !sp || !sp.warranty_months) return;
              const batDau = new Date();
              const ketThuc = new Date(batDau);
              ketThuc.setMonth(ketThuc.getMonth() + sp.warranty_months);
              item.serials.forEach((sr) => {
                db.run(
                  `INSERT INTO warranties (user_id, order_code, product_id, product_name, serial, customer_name, customer_phone, months, start_date, end_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [userId, orderCode, item.id, sp.name, sr, customer_name || null, customer_phone || null,
                   sp.warranty_months, batDau.toISOString().split('T')[0], ketThuc.toISOString().split('T')[0]]
                );
              });
            });
          }
        }
      });
      stmt.finalize();
      stockStmt.finalize();

      // Đếm lượt dùng khuyến mãi
      if (promotion_id) {
        db.run('UPDATE promotions SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ? AND user_id = ?', [promotion_id, userId]);
      }

      // 3. Update or Create Customer if phone is provided
      if (customer_phone) {
        const custName = customer_name || 'Khách vãng lai';
        db.run(`
          INSERT INTO customers (user_id, name, phone, total_spend, tags)
          VALUES (?, ?, ?, ?, 'Khách vãng lai')
          ON CONFLICT(user_id, phone) DO UPDATE SET
            total_spend = total_spend + excluded.total_spend
        `, [userId, custName, customer_phone, total_amount], (err) => {
          if (err) console.error("Error updating customer:", err.message);

          // 3b. Bán ghi nợ -> tạo khoản phải thu gắn với khách và đơn hàng
          if (conNo > 0) {
            db.get('SELECT id FROM customers WHERE user_id = ? AND phone = ?', [userId, customer_phone], (e2, kh) => {
              db.run(
                `INSERT INTO debts (user_id, type, partner_name, amount, paid_amount, status, notes, order_code, customer_id)
                 VALUES (?, 'receivable', ?, ?, 0, 'unpaid', ?, ?, ?)`,
                [userId, custName, conNo, `Bán ghi nợ đơn ${orderCode}`, orderCode, kh ? kh.id : null],
                (e3) => { if (e3) console.error('Loi tao cong no:', e3.message); }
              );
              if (kh) db.run('UPDATE pos_orders SET customer_id = ? WHERE id = ?', [kh.id, orderId]);
            });
          }
        });
      }

      // 3c. Tiền khách trả ngay -> ghi vào sổ quỹ (để chốt ca đối chiếu đúng)
      if (traTienMat > 0) {
        db.run(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
           VALUES (?, 'in', 'sales', ?, 'cash', ?, ?)`,
          [userId, traTienMat, orderCode, `Bán hàng ${orderCode}`]
        );
      }
      if (traChuyenKhoan > 0) {
        db.run(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
           VALUES (?, 'in', 'sales', ?, 'bank', ?, ?)`,
          [userId, traChuyenKhoan, orderCode, `Bán hàng ${orderCode}`]
        );
      }

      /**
       * 4. Ghi vào Sổ Bán Hàng để khai thuế.
       * Dùng doanh thu CHƯA gồm VAT (tienSauGiam) — tiền VAT thu hộ không phải doanh thu.
       * Khi không đặt VAT (mặc định) thì tienSauGiam = tổng phải trả.
       */
      const desc = `Bán hàng POS - Hóa đơn ${orderCode}`;
      db.run(`
        INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [dateStr, orderCode, desc, tienSauGiam, nhomThue, userId], (err) => {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }
        
        db.run("COMMIT");
        
        // Trigger Automation Event
        triggerEvent('ORDER_CREATED', {
          order_code: orderCode,
          total_amount: Number(total_amount),
          customer_phone: customer_phone
        }, userId);

        res.json({
          success: true, order_code: orderCode, receipt_url: `/receipt/${orderId}`,
          subtotal, discount: giamDon, vat_rate: thueSuat, vat_amount: tienVAT,
          total_amount, paid_cash: traTienMat, paid_bank: traChuyenKhoan, debt_amount: conNo,
        });
      });
    });
  }))));
});

// VietQR Webhook — công khai cho ngân hàng gọi vào, nên PHẢI có khóa bí mật,
// nếu không ai cũng đánh dấu được đơn bất kỳ là "đã thanh toán".
router.post('/vietqr-webhook', requireWebhookSecret, (req, res) => {
  // Mock Casso / SePay webhook payload
  const { data, user_id } = req.body;
  if (!data || !data.length) return res.json({ success: false });
  if (!user_id) return res.status(400).json({ error: 'Thiếu user_id (cửa hàng nhận tiền)' });

  // Typical webhook contains transaction content (e.g. "CK DON HANG ORD-1234")
  const description = data[0].description;
  const match = description.match(/ORD-\d+/);
  if (match) {
    const orderCode = match[0];
    db.run('UPDATE pos_orders SET payment_method = ?, status = ? WHERE order_code = ? AND user_id = ?',
      ['bank_transfer', 'paid', orderCode, user_id], (err) => {
        if (err) console.error(err);
        console.log(`Webhook triggered: Order ${orderCode} marked as paid.`);
    });
  }
  res.json({ success: true });
});

// Check order status
router.get('/order/:orderCode', requireAuth, quyenDonHang, (req, res) => {
  db.get('SELECT status FROM pos_orders WHERE order_code = ?', [req.params.orderCode], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: row ? row.status : 'not_found' });
  });
});

// Get recent orders
router.get('/orders', requireAuth, quyenDonHang, (req, res) => {
  const userId = req.tenantId;
  let branchId = null;
  try { if (req.user.actorType === 'staff') branchId = resolvePosBranch(req, null); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  db.all(
    `SELECT * FROM pos_orders WHERE user_id = ? ${branchId === null ? '' : 'AND branch_id = ?'} ORDER BY createdAt DESC LIMIT 50`,
    branchId === null ? [userId] : [userId, branchId],
    (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Cancel an order
router.post('/:id/cancel', requireAuth, quyenDonHang, (req, res) => {
  const orderId = req.params.id;
  const userId = req.tenantId;
  const { cancel_reason } = req.body;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Check if order exists and belongs to user
    db.get('SELECT * FROM pos_orders WHERE id = ? AND user_id = ?', [orderId, userId], (err, order) => {
      if (err || !order) {
        db.run("ROLLBACK");
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.status === 'cancelled') {
        db.run("ROLLBACK");
        return res.status(400).json({ error: "Order is already cancelled" });
      }

      // Update status
      db.run('UPDATE pos_orders SET status = ?, cancel_reason = ? WHERE id = ?', ['cancelled', cancel_reason || '', orderId], (err) => {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }

        // Restore stock
        db.all('SELECT product_id, quantity, unit_ratio FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL', [orderId], (err, items) => {
          if (!err && items) {
            // Hoàn hàng về đúng chi nhánh đã bán
            const stockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?');
            items.forEach(item => {
              const sl = item.quantity * (item.unit_ratio > 0 ? item.unit_ratio : 1);
              if (order.branch_id) doiTonChiNhanh(order.branch_id, item.product_id, sl);
              else stockStmt.run(sl, item.product_id, userId);
            });
            stockStmt.finalize();
          }

          /**
           * Đảo ngược tiền đã thu để sổ quỹ và chốt ca không bị lệch,
           * đồng thời hủy khoản công nợ nếu đơn này là bán ghi nợ.
           */
          if (order.paid_cash > 0) {
            db.run(
              `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
               VALUES (?, 'out', 'refund', ?, 'cash', ?, ?)`,
              [userId, order.paid_cash, order.order_code, `Hoàn tiền hủy đơn ${order.order_code}`]
            );
          }
          if (order.paid_bank > 0) {
            db.run(
              `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
               VALUES (?, 'out', 'refund', ?, 'bank', ?, ?)`,
              [userId, order.paid_bank, order.order_code, `Hoàn tiền hủy đơn ${order.order_code}`]
            );
          }
          if (order.debt_amount > 0) {
            db.run(`DELETE FROM debts WHERE user_id = ? AND order_code = ? AND paid_amount = 0`,
              [userId, order.order_code]);
          }
          // Trừ lại doanh thu trong sổ thuế
          db.run(
            `INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
             SELECT date, ?, ?, -amount, category, user_id FROM transactions
             WHERE user_id = ? AND voucherNumber = ? LIMIT 1`,
            [`HUY-${order.order_code}`, `Hủy đơn ${order.order_code}`, userId, order.order_code]
          );
          // Trả lại tiền đã cộng cho khách
          if (order.customer_phone) {
            db.run('UPDATE customers SET total_spend = MAX(0, total_spend - ?) WHERE user_id = ? AND phone = ?',
              [order.total_amount, userId, order.customer_phone]);
          }

          // Deduct revenue from reports
          const dateStr = order.createdAt.split(' ')[0]; // Assuming YYYY-MM-DD format is first part of datetime string, might need adjustment if it's different format but SQLite DATETIME DEFAULT CURRENT_TIMESTAMP is YYYY-MM-DD HH:MM:SS
          
          db.run(`UPDATE reports SET totalOrders = totalOrders - 1, totalRevenue = totalRevenue - ? WHERE user_id = ? AND date = date(?)`, 
            [order.total_amount, userId, order.createdAt], (err) => {

            db.run("COMMIT");
            writeAudit(req, { action: 'order.cancel', target: order.order_code, detail: { reason: cancel_reason || '' } });
            res.json({ message: "Order cancelled successfully" });
          });
        });
      });
    });
  });
});

// Get all orders for the current user
router.get('/', requireAuth, quyenDonHang, (req, res) => {
  const userId = req.tenantId;

  let branchId = null;
  try { if (req.user.actorType === 'staff') branchId = resolvePosBranch(req, null); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }

  db.all(
    `SELECT * FROM pos_orders WHERE user_id = ? ${branchId === null ? '' : 'AND branch_id = ?'} ORDER BY createdAt DESC`,
    branchId === null ? [userId] : [userId, branchId],
    (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // We can also fetch all items in one go and group them, or just return orders and fetch items per order.
    // For simplicity, let's fetch all items for these orders and attach them.
    if (orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    
    db.all(`SELECT * FROM pos_order_items WHERE order_id IN (${placeholders})`, orderIds, (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const itemsByOrderId = {};
      items.forEach(item => {
        if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
        itemsByOrderId[item.order_id].push(item);
      });

      const enrichedOrders = orders.map(order => ({
        ...order,
        items: itemsByOrderId[order.id] || []
      }));

      res.json(enrichedOrders);
    });
  });
});

module.exports = router;
