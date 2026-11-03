const express = require('express');
const router = express.Router();
const db = require('../db');

// Register user (Lead Capture)
router.post('/register', (req, res) => {
  const { name, phone, accessCode, sector = 'retail' } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Vui lòng nhập Tên và Số điện thoại!' });
  }

  // Validate Vietnamese phone number format
  const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;
  if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
    return res.status(400).json({ error: 'Số điện thoại không hợp lệ. Vui lòng nhập đúng số điện thoại Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09).' });
  }

  // Không cần mã truy cập nữa - ai cũng vào được, admin phân biệt qua số điện thoại
  // (Admin 0979164124 sẽ thấy menu quản trị riêng)


  db.get('SELECT id FROM users WHERE phone = ?', [phone], (err, row) => {
    const isNewUser = !row;
    const query = `
      INSERT INTO users (name, phone, sector)
      VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET name = excluded.name, sector = excluded.sector
    `;
  
    db.run(query, [name, phone, sector], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      if (isNewUser) {
        // Seed initial data for "Wow" effect based on sector
        let seedProducts = '';
        if (sector === 'spa') {
          seedProducts = `
            INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url) VALUES 
            (?, 'Massage Body Đá Nóng', 'SP-001-${phone}', 350000, 100000, 999, '1.2', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=200'),
            (?, 'Chăm sóc da chuyên sâu', 'SP-002-${phone}', 500000, 150000, 999, '1.2', 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=200'),
            (?, 'Gội đầu dưỡng sinh', 'SP-003-${phone}', 150000, 50000, 999, '1.2', 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=200')
          `;
        } else if (sector === 'fnb') {
          seedProducts = `
            INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url) VALUES 
            (?, 'Cà Phê Sữa Đá', 'SP-001-${phone}', 25000, 10000, 50, '1.1', 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200'),
            (?, 'Trà Đào Cam Sả', 'SP-002-${phone}', 35000, 15000, 40, '1.1', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=200'),
            (?, 'Bánh Mì Chả Lụa', 'SP-003-${phone}', 20000, 12000, 20, '1.1', 'https://images.unsplash.com/photo-1627993431652-32a76fdf245b?w=200')
          `;
        } else if (sector === 'fashion') {
          seedProducts = `
            INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url) VALUES 
            (?, 'Áo thun Cotton Basic', 'SP-001-${phone}', 150000, 80000, 30, '1.1', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200'),
            (?, 'Quần Jeans Ống Suông', 'SP-002-${phone}', 350000, 200000, 20, '1.1', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=200'),
            (?, 'Áo Khoác Bomber', 'SP-003-${phone}', 450000, 250000, 15, '1.1', 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200')
          `;
        } else {
          // Default: retail
          seedProducts = `
            INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url) VALUES 
            (?, 'Nước mắm Nam Ngư', 'SP-001-${phone}', 45000, 35000, 100, '1.1', 'https://images.unsplash.com/photo-1621217642646-60809b4db700?w=200'),
            (?, 'Mì Hảo Hảo Tôm Chua Cay', 'SP-002-${phone}', 120000, 100000, 50, '1.1', 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=200'),
            (?, 'Dầu ăn Neptune', 'SP-003-${phone}', 55000, 48000, 30, '1.1', 'https://images.unsplash.com/photo-1474128670149-708298146faa?w=200')
          `;
        }
        
        db.run(seedProducts, [phone, phone, phone], (err) => {
          if (!err) {
            // Seed 1 order
            const orderCode = 'HD' + Date.now().toString().slice(-6);
            db.run(`INSERT INTO pos_orders (user_id, order_code, total_amount, discount, final_amount, payment_method, status, customer_name, customer_phone)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [phone, orderCode, 60000, 0, 60000, 'cash', 'completed', 'Khách vãng lai', ''], function(err) {
               if(!err) {
                  db.run(`INSERT INTO reports (user_id, date, totalOrders, totalRevenue) VALUES (?, date('now'), 1, 60000)
                          ON CONFLICT(user_id, date) DO UPDATE SET totalOrders = totalOrders + 1, totalRevenue = totalRevenue + 60000`, [phone]);
               }
            });
          }
        });
      }

      res.json({ id: this.lastID, name, phone, sector, message: 'Registration successful', isNew: isNewUser });
    });
  });
});

// Verify if user is still active
router.post('/verify', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  db.get('SELECT id FROM users WHERE phone = ?', [phone], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'User not found or banned' });
    res.json({ status: 'active' });
  });
});

// Admin: Get all users
router.get('/users', (req, res) => {
  db.all('SELECT * FROM users ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin: Delete user
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User deleted' });
  });
});

const excel = require('exceljs');

// Admin: Export users to Excel
router.get('/users/export', (req, res) => {
  db.all('SELECT * FROM users ORDER BY createdAt DESC', [], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const workbook = new excel.Workbook();
    const sheet = workbook.addWorksheet('Leads Data');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Tên cửa hàng', key: 'name', width: 30 },
      { header: 'Số Zalo', key: 'phone', width: 20 },
      { header: 'Ngày đăng ký', key: 'createdAt', width: 25 },
    ];

    sheet.getRow(1).font = { bold: true };

    rows.forEach(r => sheet.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Leads-Export.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  });
});

// User: Get profile
router.get('/profile', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  });
});

// User: Update profile
router.put('/profile', (req, res) => {
  const { phone, name, taxCode, oldTaxCode, email, province, ward, address, taxDepartment } = req.body;
  
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const query = `
    UPDATE users 
    SET name = ?, taxCode = ?, oldTaxCode = ?, email = ?, province = ?, ward = ?, address = ?, taxDepartment = ?
    WHERE phone = ?
  `;

  db.run(query, [name, taxCode, oldTaxCode, email, province, ward, address, taxDepartment, phone], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profile updated successfully' });
  });
});

// Admin Registration (SaaS)
router.post('/register', (req, res) => {
  const { phone, password, shopName } = req.body;
  if (!phone || !password || !shopName) return res.status(400).json({ error: 'Thiếu thông tin' });
  
  db.run("BEGIN TRANSACTION");

  db.run('INSERT INTO users (phone, role, status) VALUES (?, ?, ?)', [phone, 'admin', 'active'], function(err) {
    if (err) {
      db.run("ROLLBACK");
      return res.status(500).json({ error: 'Số điện thoại đã tồn tại' });
    }
    
    // Create initial settings for the shop
    const defaultSettings = [
      ['shop_name', shopName],
      ['bank_account', ''],
      ['bank_name', ''],
      ['bank_account_name', '']
    ];
    
    const stmt = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
    defaultSettings.forEach(s => stmt.run(s[0], s[1], s[1]));
    stmt.finalize();

    db.run("COMMIT");
    res.json({ success: true, message: 'Đăng ký thành công', user: { phone, role: 'admin' } });
  });
});

module.exports = router;
