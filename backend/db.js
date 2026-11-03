const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'autotax.db');
const thuMucSaoLuu = path.resolve(__dirname, 'backups');
const fileChoKhoiPhuc = path.resolve(__dirname, 'restore-pending.db');

/**
 * KHÔI PHỤC DỮ LIỆU — phải chạy TRƯỚC khi mở kết nối CSDL.
 * Windows không cho ghi đè file đang mở, nên việc khôi phục được làm theo 2 bước:
 *   1) API /api/backup/restore chỉ lưu file tải lên thành 'restore-pending.db'
 *   2) Lần khởi động kế tiếp, đoạn dưới đây mới thực sự thay thế CSDL
 * Bản cũ luôn được cất vào backups/ trước khi ghi đè, không mất dữ liệu.
 */
function thuKhoiPhuc() {
  if (!fs.existsSync(fileChoKhoiPhuc)) return;
  if (!fs.existsSync(thuMucSaoLuu)) fs.mkdirSync(thuMucSaoLuu, { recursive: true });

  // Cất bản hiện tại trước khi thay (chỉ làm một lần)
  const dau = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(dbPath, path.join(thuMucSaoLuu, `truoc-khi-khoi-phuc-${dau}.db`));
    } catch (e) {
      console.error('[KHOI PHUC] Khong cat duoc ban hien tai, DUNG lai cho an toan:', e.message);
      return; // không mạo hiểm thay khi chưa có bản lùi
    }
  }

  /**
   * Trên Windows, tiến trình cũ vừa tắt có thể còn giữ file -wal/-shm thêm
   * vài trăm mili giây. Trước đây bước xóa này ném lỗi và làm hỏng cả lượt
   * khôi phục, nên giờ thử lại nhiều lần và không để nó chặn bước chép.
   */
  const MAX = 20;
  for (let lan = 1; lan <= MAX; lan++) {
    let sachWal = true;
    for (const duoi of ['-wal', '-shm']) {
      const f = dbPath + duoi;
      if (!fs.existsSync(f)) continue;
      try { fs.unlinkSync(f); } catch (_) { sachWal = false; }
    }
    if (sachWal) {
      try {
        fs.copyFileSync(fileChoKhoiPhuc, dbPath);
        fs.unlinkSync(fileChoKhoiPhuc);
        console.log('[KHOI PHUC] Da khoi phuc CSDL tu ban sao luu. Ban cu cat trong backups/.');
        return;
      } catch (e) {
        console.error(`[KHOI PHUC] Lan ${lan}: chep loi (${e.code || e.message}), thu lai...`);
      }
    }
    // Chờ ngắn rồi thử lại (đồng bộ, vì phải xong trước khi mở CSDL)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  }
  console.error('[KHOI PHUC] KHONG khoi phuc duoc sau nhieu lan thu. CSDL cu giu nguyen, file cho van con.');
}

try {
  thuKhoiPhuc();
} catch (e) {
  console.error('[KHOI PHUC] Loi khi khoi phuc:', e.message);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Bật WAL mode để xử lý hàng ngàn User cùng lúc mà không bị khóa Database
    db.run('PRAGMA journal_mode = WAL;');

    db.run(`
      CREATE TABLE IF NOT EXISTS product_mapping (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        category TEXT NOT NULL,
        user_id TEXT DEFAULT 'default_user',
        UNIQUE(user_id, keyword)
      )
    `, (err) => {
      if (err) {
        console.error('Error creating product_mapping table:', err.message);
      } else {
        console.log('Table product_mapping ready.');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fileName TEXT NOT NULL,
        totalRevenue REAL NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT DEFAULT 'default_user'
      )
    `, (err) => {
      if (err) {
        console.error('Error creating reports table:', err.message);
      } else {
        console.log('Table reports ready.');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        taxCode TEXT,
        oldTaxCode TEXT,
        email TEXT,
        province TEXT,
        ward TEXT,
        address TEXT,
        taxDepartment TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating users table:', err.message);
      } else {
        console.log('Table users ready.');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        voucherNumber TEXT,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        user_id TEXT DEFAULT 'default_user',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating transactions table:', err.message);
      } else {
        console.log('Table transactions ready.');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        name TEXT NOT NULL,
        sku TEXT,
        price REAL NOT NULL DEFAULT 0,
        cost_price REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        category TEXT,
        image_url TEXT,
        description TEXT,
        attributes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, sku)
      )
    `, (err) => {
      if (err) console.error('Error creating products table:', err.message);
      else console.log('Table products ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        sku TEXT,
        price REAL,
        cost_price REAL,
        stock INTEGER DEFAULT 0,
        image_url TEXT,
        attributes_json TEXT,
        UNIQUE(product_id, sku),
        FOREIGN KEY(product_id) REFERENCES products(id)
      )
    `, (err) => {
      if (err) console.error('Error creating product_variants table:', err.message);
      else console.log('Table product_variants ready.');
    });

    // NEW ERP MODULES
    db.run(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        trigger_event TEXT,
        condition_json TEXT,
        action_type TEXT,
        action_payload TEXT,
        is_active INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table workflows ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS loyalty_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        points INTEGER,
        reason TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table loyalty_logs ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS customer_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        name TEXT,
        min_points INTEGER,
        discount_percent REAL,
        color TEXT
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table customer_tiers ready.');
    });

    // OMNICHANNEL & INVENTORY FINAL SPRINT
    db.run(`CREATE TABLE IF NOT EXISTS omnichannel_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        platform TEXT NOT NULL,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) console.error(err);
        else console.log("Table omnichannel_channels ready.");
      });

    // Danh mục sản phẩm — tách theo từng cửa hàng
    db.run(`CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        parent_id INTEGER,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )`, (err) => {
        if (err) console.error(err);
        else console.log("Table product_categories ready.");
      });

    // --- NHẬP HÀNG & NHÀ CUNG CẤP ---
    db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        tax_code TEXT,
        note TEXT,
        total_purchased REAL DEFAULT 0,
        total_debt REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, phone)
      )`, (err) => { if (err) console.error(err); else console.log("Table suppliers ready."); });

    db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        supplier_id INTEGER,
        supplier_name TEXT,
        total_amount REAL NOT NULL DEFAULT 0,
        paid_amount REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'received',
        note TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, code)
      )`, (err) => { if (err) console.error(err); else console.log("Table purchase_orders ready."); });

    db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        po_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT,
        quantity INTEGER NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0
      )`, (err) => { if (err) console.error(err); else console.log("Table purchase_order_items ready."); });

    // --- TRẢ HÀNG & CHỐT CA ---
    db.run(`CREATE TABLE IF NOT EXISTS returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        order_id INTEGER,
        order_code TEXT,
        total_refund REAL NOT NULL DEFAULT 0,
        reason TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, code)
      )`, (err) => { if (err) console.error(err); else console.log("Table returns ready."); });

    db.run(`CREATE TABLE IF NOT EXISTS return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL DEFAULT 0
      )`, (err) => { if (err) console.error(err); else console.log("Table return_items ready."); });

    db.run(`CREATE TABLE IF NOT EXISTS cashier_shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        actor_name TEXT,
        opening_cash REAL NOT NULL DEFAULT 0,
        closing_cash REAL,
        expected_cash REAL,
        difference REAL,
        cash_sales REAL DEFAULT 0,
        cash_out REAL DEFAULT 0,
        note TEXT,
        status TEXT DEFAULT 'open',
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME
      )`, (err) => { if (err) console.error(err); else console.log("Table cashier_shifts ready."); });

      // --- FINANCE (PHASE 2) ---
      db.run(`CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        type TEXT NOT NULL, -- 'receivable' (phải thu), 'payable' (phải trả)
        partner_name TEXT NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'unpaid', -- 'unpaid', 'partial', 'paid'
        due_date DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) console.error(err);
        else console.log("Table debts ready.");
      });

      db.run(`CREATE TABLE IF NOT EXISTS cash_flows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        transaction_type TEXT NOT NULL, -- 'in' (thu), 'out' (chi)
        category TEXT NOT NULL, -- 'sales', 'expense', 'salary', 'debt_collection'
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL, -- 'cash', 'bank'
        reference_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) console.error(err);
        else console.log("Table cash_flows ready.");
      });

    db.run(`
      CREATE TABLE IF NOT EXISTS omnichannel_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER,
        external_order_id TEXT,
        total_amount REAL,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table omnichannel_orders ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        total_difference REAL,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table inventory_checks ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        from_branch TEXT,
        to_branch TEXT,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table inventory_transfers ready.');
    });

    // FINAL BOSS TABLES: BOM, HRM, PROMOTIONS
    db.run(`
      CREATE TABLE IF NOT EXISTS product_bom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        material_product_id INTEGER,
        quantity REAL,
        FOREIGN KEY(product_id) REFERENCES products(id),
        FOREIGN KEY(material_product_id) REFERENCES products(id)
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table product_bom ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER,
        check_in DATETIME DEFAULT CURRENT_TIMESTAMP,
        check_out DATETIME,
        status TEXT DEFAULT 'ACTIVE'
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table shifts ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS commissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER,
        order_id INTEGER,
        amount REAL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table commissions ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        min_order_value REAL,
        discount_percent REAL,
        discount_amount REAL,
        status TEXT DEFAULT 'ACTIVE'
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table promotions ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        value TEXT
      )
    `, (err) => {
      if (err) console.error(err.message); else console.log('Table system_settings ready.');
      
      // Không seed kênh bán hàng chung nữa — mỗi cửa hàng tự thêm kênh của mình
      // (trước đây seed không kèm user_id nên mọi cửa hàng nhìn thấy chung một danh sách)
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS pos_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        order_code TEXT NOT NULL,
        total_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        customer_name TEXT,
        customer_phone TEXT,
        payment_method TEXT DEFAULT 'cash',
        status TEXT DEFAULT 'completed',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, order_code)
      )
    `, (err) => {
      if (err) console.error('Error creating pos_orders table:', err.message);
      else console.log('Table pos_orders ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS pos_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY(order_id) REFERENCES pos_orders(id)
      )
    `, (err) => {
      if (err) console.error('Error creating pos_order_items table:', err.message);
      else console.log('Table pos_order_items ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT,
        total_spend REAL DEFAULT 0,
        tags TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, phone)
      )
    `, (err) => {
      if (err) console.error('Error creating customers table:', err.message);
      else console.log('Table customers ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        product_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'IN' or 'OUT'
        quantity INTEGER NOT NULL,
        note TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating inventory_logs table:', err.message);
      else console.log('Table inventory_logs ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'Thu ngân',
        sales_total REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, phone)
      )
    `, (err) => {
      if (err) console.error('Error creating staff table:', err.message);
      else console.log('Table staff ready.');
    });
    db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        name TEXT NOT NULL,
        type TEXT DEFAULT 'Phòng',
        capacity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'available',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating rooms table:', err.message);
      else console.log('Table rooms ready.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default_user',
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        service_id INTEGER,
        service_name TEXT NOT NULL,
        room_id INTEGER,
        staff_id INTEGER,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating appointments table:', err.message);
      else console.log('Table appointments ready.');
    });
    db.run(`
      CREATE TABLE IF NOT EXISTS gemini_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_value TEXT NOT NULL,
        provider TEXT DEFAULT 'gemini',
        model_name TEXT DEFAULT 'gemini-2.5-flash',
        usage_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        status TEXT DEFAULT 'ok',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT DEFAULT 'default_user',
        UNIQUE(user_id, key_value)
      )
    `, (err) => {
      if (err) console.error('Error creating gemini_keys table:', err.message);
      else {
        console.log('Table gemini_keys ready.');
        // Run migrations for existing DBs
        db.run("ALTER TABLE gemini_keys ADD COLUMN provider TEXT DEFAULT 'gemini'", () => {});
        db.run("ALTER TABLE gemini_keys ADD COLUMN model_name TEXT DEFAULT 'gemini-2.5-flash'", () => {});
      }
    });
  }
});

module.exports = db;
