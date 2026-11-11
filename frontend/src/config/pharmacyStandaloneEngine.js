const STORAGE_KEY = 'nhanduc_gpp_standalone_v2';
const IDB_NAME = 'NhanDucGPP_IDB';
const IDB_STORE = 'state_store';
const IDB_KEY = 'db_v2';

let memoryDb = null;
let idbHydrated = false;

function openIdb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No indexedDB'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveToIdb(dbData) {
  openIdb()
    .then((idb) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dbData, IDB_KEY);
    })
    .catch(() => {});
}

function seedFromBundledKiotViet() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const baseUrl = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const jsonPath = '/kiotviet_nhanduc_7854.json';
  window
    .fetch(jsonPath)
    .then((r) => (r.ok ? r.json() : null))
    .then((kv) => {
      if (!kv || !Array.isArray(kv.products) || kv.products.length === 0) return;
      const base = memoryDb || createInitialDb();
      if ((base.products?.length || 0) < 7000) {
        base.products = kv.products;
        if (Array.isArray(kv.categories) && kv.categories.length > 0) base.categories = kv.categories;
        if (Array.isArray(kv.batches) && kv.batches.length > 0) base.batches = kv.batches;
        if (Array.isArray(kv.units) && kv.units.length > 0) base.units = kv.units;
      }
      ensureDefaultBranches(base);
      populateBranchStockIfEmpty(base);
      saveDb(base);
      window.dispatchEvent(new Event('productsUpdated'));
      window.dispatchEvent(new Event('branchesUpdated'));
    })
    .catch(() => {});
}

function hydrateFromIdb() {
  if (idbHydrated || typeof indexedDB === 'undefined') return;
  idbHydrated = true;
  openIdb()
    .then((idb) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const stored = req.result;
        if (stored && Array.isArray(stored.products) && stored.products.length >= 7000) {
          const changed = ensureDefaultBranches(stored);
          populateBranchStockIfEmpty(stored);
          memoryDb = stored;
          if (changed) saveDb(stored);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('productsUpdated'));
            window.dispatchEvent(new Event('branchesUpdated'));
          }
        } else {
          seedFromBundledKiotViet();
        }
      };
      req.onerror = () => seedFromBundledKiotViet();
    })
    .catch(() => seedFromBundledKiotViet());
}

const DEFAULT_BRANCH_DEFINITIONS = [
  {
    id: 1,
    user_id: 1,
    name: 'Nhà Thuốc Nhân Đức - Cơ sở chính',
    address: '172 Quốc lộ 50, KP4, Thị trấn Cần Giuộc, Huyện Cần Giuộc, Tỉnh Long An',
    phone: '0933324368',
    username: 'admin',
    password: '123456',
    is_default: 1,
    status: 'active'
  },
  {
    id: 2,
    user_id: 1,
    name: 'Nhà thuốc nhân Đức 2',
    address: '471 Đường 826C, ấp 2/5, xã Long Hậu, Cần Giuộc, Long an',
    phone: '0907152117',
    username: 'nhanduc2',
    password: '123456',
    is_default: 0,
    status: 'active'
  },
  {
    id: 3,
    user_id: 1,
    name: 'Nhà thuốc Minh Ánh',
    address: '16 đường số 75, KDC Tân qui đông, phường Tân phong, q7',
    phone: '0976772399',
    username: 'minhanh',
    password: '123456',
    is_default: 0,
    status: 'active'
  },
  {
    id: 4,
    user_id: 1,
    name: 'Nhà Thuốc Quỳnh Hương',
    address: 'Số 789, quốc lộ 50, ấp 3, xã cần giuộc, Tây ninh',
    phone: '0971399399',
    username: 'quynhhuong',
    password: '123456',
    is_default: 0,
    status: 'active'
  }
];

function ensureDefaultBranches(db) {
  if (!db) return false;
  if (!Array.isArray(db.branches)) db.branches = [];
  let changed = false;

  DEFAULT_BRANCH_DEFINITIONS.forEach((def) => {
    const existingIdx = db.branches.findIndex(
      (b) =>
        (b.phone && b.phone === def.phone) ||
        (b.name && b.name.toLowerCase().trim() === def.name.toLowerCase().trim()) ||
        (def.id === 2 && b.id === 2 && b.name.toLowerCase().includes('tân kim'))
    );

    if (existingIdx !== -1) {
      const existing = db.branches[existingIdx];
      if (
        existing.name !== def.name ||
        existing.address !== def.address ||
        existing.phone !== def.phone ||
        !existing.username
      ) {
        db.branches[existingIdx] = {
          ...existing,
          name: def.name,
          address: def.address,
          phone: def.phone,
          username: def.username || existing.username || `cn${existing.id}`,
          password: def.password || existing.password || '123456'
        };
        changed = true;
      }
    } else {
      const maxId = db.branches.reduce((max, b) => Math.max(max, Number(b.id) || 0), 0);
      const newId = Math.max(def.id, maxId + 1);
      db.branches.push({
        ...def,
        id: newId,
        createdAt: getTodayIso()
      });
      changed = true;
    }
  });

  return changed;
}

function getCurrentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function getTodayIso() {
  return new Date().toISOString();
}

function createInitialDb() {
  const now = getTodayIso();
  const month = getCurrentMonthStr();

  const categories = [
    { id: 1, name: 'Thuốc Giảm Đau - Hạ Sốt - Kháng Viêm', description: 'Paracetamol, Ibuprofen, Kháng viêm NSAID', status: 'active', createdAt: now },
    { id: 2, name: 'Kháng Sinh - Kháng Khuẩn (Kê đơn)', description: 'Beta-lactam, Macrolid, Cephalosporin, Quinolon', status: 'active', createdAt: now },
    { id: 3, name: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', description: 'Kháng acid, PPI, Men vi sinh, Cầm tiêu chảy', status: 'active', createdAt: now },
    { id: 4, name: 'Thuốc Hô Hấp - Ho - Cảm Cúm', description: 'Trị cảm sổ mũi, Long đờm, Giảm ho thảo dược', status: 'active', createdAt: now },
    { id: 5, name: 'Tim Mạch - Huyết Áp - Tiểu Đường', description: 'Thuốc huyết áp, Mỡ máu, Đái tháo đường mãn tính', status: 'active', createdAt: now },
    { id: 6, name: 'Vitamin - Khoáng Chất - Thực Phẩm Chức Năng', description: 'Bổ sung đề kháng, Canxi, Omega-3, Bổ não', status: 'active', createdAt: now },
    { id: 7, name: 'Dược Mỹ Phẩm - Chăm Sóc Cá Nhân', description: 'Chăm sóc da liễu, Kem bôi da, Sữa rửa mặt y khoa', status: 'active', createdAt: now },
    { id: 8, name: 'Vật Tư Y Tế - Thiết Bị Chăm Sóc', description: 'Khẩu trang, Bông băng, Cồn y tế, Que thử đường huyết', status: 'active', createdAt: now }
  ];

  const products = [
    { id: 101, name: 'Panadol Extra Đỏ (Hộp 15 vỉ x 12 viên)', sku: 'ND-TH001', price: 252000, cost_price: 215000, stock: 120, category: 'Thuốc Giảm Đau - Hạ Sốt - Kháng Viêm', base_unit: 'Hộp', track_batch: 1 },
    { id: 102, name: 'Efferalgan 500mg Viên sủi (Hộp 4 vỉ x 4 viên)', sku: 'ND-TH002', price: 56000, cost_price: 45000, stock: 150, category: 'Thuốc Giảm Đau - Hạ Sốt - Kháng Viêm', base_unit: 'Hộp', track_batch: 1 },
    { id: 103, name: 'Hapacol 650 DHG (Hộp 10 vỉ x 10 viên)', sku: 'ND-TH003', price: 105000, cost_price: 86000, stock: 140, category: 'Thuốc Giảm Đau - Hạ Sốt - Kháng Viêm', base_unit: 'Hộp', track_batch: 1 },
    { id: 104, name: 'Celecoxib 200mg Stella (Hộp 3 vỉ x 10 viên)', sku: 'ND-TH004', price: 90000, cost_price: 68000, stock: 85, category: 'Thuốc Giảm Đau - Hạ Sốt - Kháng Viêm', base_unit: 'Hộp', track_batch: 1 },
    { id: 105, name: 'Augmentin 1g GSK (Hộp 2 vỉ x 7 viên)', sku: 'ND-KS001', price: 315000, cost_price: 278000, stock: 60, category: 'Kháng Sinh - Kháng Khuẩn (Kê đơn)', base_unit: 'Hộp', track_batch: 1 },
    { id: 106, name: 'Klamentin 625mg DHG (Hộp 2 vỉ x 7 viên)', sku: 'ND-KS002', price: 112000, cost_price: 89000, stock: 95, category: 'Kháng Sinh - Kháng Khuẩn (Kê đơn)', base_unit: 'Hộp', track_batch: 1 },
    { id: 107, name: 'Azithromycin 500mg Imexpharm (Hộp 1 vỉ x 3 viên)', sku: 'ND-KS003', price: 48000, cost_price: 36000, stock: 110, category: 'Kháng Sinh - Kháng Khuẩn (Kê đơn)', base_unit: 'Hộp', track_batch: 1 },
    { id: 108, name: 'Cefixim 200mg Traphaco (Hộp 2 vỉ x 10 viên)', sku: 'ND-KS004', price: 135000, cost_price: 102000, stock: 75, category: 'Kháng Sinh - Kháng Khuẩn (Kê đơn)', base_unit: 'Hộp', track_batch: 1 },
    { id: 109, name: 'Gaviscon Dual Action (Hộp 24 gói x 10ml)', sku: 'ND-TH005', price: 198000, cost_price: 165000, stock: 90, category: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', base_unit: 'Hộp', track_batch: 1 },
    { id: 110, name: 'Yumangel Thuốc dạ dày chữ Y (Hộp 20 gói)', sku: 'ND-TH006', price: 98000, cost_price: 82000, stock: 130, category: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', base_unit: 'Hộp', track_batch: 1 },
    { id: 111, name: 'Phosphalugel Thuốc dạ dày chữ P (Hộp 26 gói)', sku: 'ND-TH007', price: 118000, cost_price: 99000, stock: 125, category: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', base_unit: 'Hộp', track_batch: 1 },
    { id: 112, name: 'Nexium Mups 40mg AstraZeneca (Hộp 4 vỉ x 7 viên)', sku: 'ND-TH008', price: 680000, cost_price: 610000, stock: 45, category: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', base_unit: 'Hộp', track_batch: 1 },
    { id: 113, name: 'Enterogermina 2 tỷ bào tử lợi khuẩn (Hộp 20 ống)', sku: 'ND-TH009', price: 168000, cost_price: 142000, stock: 100, category: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', base_unit: 'Hộp', track_batch: 1 },
    { id: 114, name: 'Smecta Trị tiêu chảy cấp (Hộp 30 gói)', sku: 'ND-TH010', price: 126000, cost_price: 104000, stock: 80, category: 'Thuốc Tiêu Hóa - Dạ Dày - Đại Tràng', base_unit: 'Hộp', track_batch: 1 },
    { id: 115, name: 'Tiffy Dey Trị cảm cúm sổ mũi (Hộp 25 vỉ x 4 viên)', sku: 'ND-HH001', price: 175000, cost_price: 145000, stock: 160, category: 'Thuốc Hô Hấp - Ho - Cảm Cúm', base_unit: 'Hộp', track_batch: 1 },
    { id: 116, name: 'Decolgen Forte (Hộp 25 vỉ x 4 viên)', sku: 'ND-HH002', price: 185000, cost_price: 152000, stock: 140, category: 'Thuốc Hô Hấp - Ho - Cảm Cúm', base_unit: 'Hộp', track_batch: 1 },
    { id: 117, name: 'Siro Ho Prospan Đức (Chai 100ml)', sku: 'ND-HH003', price: 78000, cost_price: 63000, stock: 115, category: 'Thuốc Hô Hấp - Ho - Cảm Cúm', base_unit: 'Chai', track_batch: 1 },
    { id: 118, name: 'Acemuc 200mg Long đờm (Hộp 30 gói)', sku: 'ND-HH004', price: 89000, cost_price: 72000, stock: 95, category: 'Thuốc Hô Hấp - Ho - Cảm Cúm', base_unit: 'Hộp', track_batch: 1 },
    { id: 119, name: 'Xịt mũi Otrivin 0.1% (Chai 10ml)', sku: 'ND-HH005', price: 62000, cost_price: 49000, stock: 85, category: 'Thuốc Hô Hấp - Ho - Cảm Cúm', base_unit: 'Chai', track_batch: 1 },
    { id: 120, name: 'Amlor 5mg Pfizer Huyết áp (Hộp 3 vỉ x 10 viên)', sku: 'ND-TM001', price: 245000, cost_price: 212000, stock: 70, category: 'Tim Mạch - Huyết Áp - Tiểu Đường', base_unit: 'Hộp', track_batch: 1 },
    { id: 121, name: 'Coversyl 5mg Servier (Hộp 30 viên)', sku: 'ND-TM002', price: 238000, cost_price: 205000, stock: 65, category: 'Tim Mạch - Huyết Áp - Tiểu Đường', base_unit: 'Hộp', track_batch: 1 },
    { id: 122, name: 'Concor 5mg Merck (Hộp 3 vỉ x 10 viên)', sku: 'ND-TM003', price: 156000, cost_price: 132000, stock: 75, category: 'Tim Mạch - Huyết Áp - Tiểu Đường', base_unit: 'Hộp', track_batch: 1 },
    { id: 123, name: 'Glucophage XR 500mg Tiểu đường (Hộp 30 viên)', sku: 'ND-TM004', price: 96000, cost_price: 78000, stock: 90, category: 'Tim Mạch - Huyết Áp - Tiểu Đường', base_unit: 'Hộp', track_batch: 1 },
    { id: 124, name: 'Berocca Performance Mango (Tuýp 10 viên sủi)', sku: 'ND-VT001', price: 88000, cost_price: 71000, stock: 120, category: 'Vitamin - Khoáng Chất - Thực Phẩm Chức Năng', base_unit: 'Tuýp', track_batch: 1 },
    { id: 125, name: 'Enervon C Tăng đề kháng (Hộp 10 vỉ x 10 viên)', sku: 'ND-VT002', price: 165000, cost_price: 138000, stock: 105, category: 'Vitamin - Khoáng Chất - Thực Phẩm Chức Năng', base_unit: 'Hộp', track_batch: 1 },
    { id: 126, name: 'Calcium Corbiere Extra (Hộp 30 ống x 10ml)', sku: 'ND-VT003', price: 192000, cost_price: 162000, stock: 88, category: 'Vitamin - Khoáng Chất - Thực Phẩm Chức Năng', base_unit: 'Hộp', track_batch: 1 },
    { id: 127, name: 'Dầu cá Omega-3 Alaska 1000mg (Chai 100 viên)', sku: 'ND-VT004', price: 185000, cost_price: 135000, stock: 72, category: 'Vitamin - Khoáng Chất - Thực Phẩm Chức Năng', base_unit: 'Chai', track_batch: 1 },
    { id: 128, name: 'Ginkgo Biloba 120mg Hoạt huyết dưỡng não (Hộp 100 viên)', sku: 'ND-VT005', price: 145000, cost_price: 105000, stock: 95, category: 'Vitamin - Khoáng Chất - Thực Phẩm Chức Năng', base_unit: 'Hộp', track_batch: 1 },
    { id: 129, name: 'Kem dưỡng phục hồi La Roche-Posay Cicaplast B5+ (40ml)', sku: 'ND-MP001', price: 365000, cost_price: 295000, stock: 40, category: 'Dược Mỹ Phẩm - Chăm Sóc Cá Nhân', base_unit: 'Tuýp', track_batch: 1 },
    { id: 130, name: 'Sữa rửa mặt dịu nhẹ Cetaphil Gentle Skin Cleanser (500ml)', sku: 'ND-MP002', price: 345000, cost_price: 280000, stock: 50, category: 'Dược Mỹ Phẩm - Chăm Sóc Cá Nhân', base_unit: 'Chai', track_batch: 1 },
    { id: 131, name: 'Khẩu trang Y tế 4 lớp kháng khuẩn chuẩn Bộ Y Tế (Hộp 50 cái)', sku: 'ND-YT001', price: 35000, cost_price: 22000, stock: 250, category: 'Vật Tư Y Tế - Thiết Bị Chăm Sóc', base_unit: 'Hộp', track_batch: 1 },
    { id: 132, name: 'Nước muối sinh lý Natri Clorid 0.9% Vĩnh Phúc (Chai 500ml)', sku: 'ND-YT002', price: 10000, cost_price: 6500, stock: 300, category: 'Vật Tư Y Tế - Thiết Bị Chăm Sóc', base_unit: 'Chai', track_batch: 1 },
    { id: 133, name: 'Cồn Y tế 70 độ sát khuẩn OPC (Chai 500ml)', sku: 'ND-YT003', price: 22000, cost_price: 15000, stock: 180, category: 'Vật Tư Y Tế - Thiết Bị Chăm Sóc', base_unit: 'Chai', track_batch: 1 },
    { id: 134, name: 'Hộp que thử đường huyết Accu-Chek Instant (Hộp 25 que)', sku: 'ND-YT004', price: 265000, cost_price: 220000, stock: 45, category: 'Vật Tư Y Tế - Thiết Bị Chăm Sóc', base_unit: 'Hộp', track_batch: 1 }
  ];

  const branches = DEFAULT_BRANCH_DEFINITIONS.map((b) => ({ ...b, createdAt: now }));

  // Phân bổ tồn kho khởi tạo cho Cơ sở chính
  const branch_stock = [];
  products.forEach((p) => {
    branch_stock.push({ branch_id: 1, product_id: p.id, stock: p.stock });
    branch_stock.push({ branch_id: 2, product_id: p.id, stock: 0 });
    branch_stock.push({ branch_id: 3, product_id: p.id, stock: 0 });
    branch_stock.push({ branch_id: 4, product_id: p.id, stock: 0 });
  });

  const batches = products.slice(0, 16).map((p, idx) => ({
    id: idx + 1,
    product_id: p.id,
    product_name: p.name,
    sku: p.sku,
    batch_code: `LOT-${202601 + idx}`,
    expiry_date: idx % 3 === 0 ? '2027-09-30' : idx % 3 === 1 ? '2028-03-15' : '2027-12-20',
    quantity: p.stock,
    cost_price: p.cost_price,
    note: 'Đạt chuẩn bảo quản GPP (< 30°C)',
    createdAt: now
  }));

  const staff = [
    {
      id: 1,
      user_id: 1,
      name: 'DS. Nguyễn Thị Minh',
      phone: '0933324369',
      username: 'duocsiminh',
      role: 'Dược sĩ Đại học (Chuyên môn)',
      permissions: ['pos', 'orders', 'products', 'inventory', 'customers', 'reports'],
      status: 'active',
      sales_total: 42500000,
      base_salary: 7000000,
      hourly_rate: 35000,
      allowance: 1000000,
      createdAt: now
    },
    {
      id: 2,
      user_id: 1,
      name: 'DS. Trần Hoàng Nam',
      phone: '0933324370',
      username: 'duocsinam',
      role: 'Dược sĩ Cao đẳng (Bán thuốc)',
      permissions: ['pos', 'orders', 'products', 'customers'],
      status: 'active',
      sales_total: 28400000,
      base_salary: 6000000,
      hourly_rate: 30000,
      allowance: 500000,
      createdAt: now
    }
  ];

  const shifts = [
    {
      id: 1,
      staff_id: 1,
      staff_name: 'DS. Nguyễn Thị Minh',
      staff_role: 'Dược sĩ Đại học (Chuyên môn)',
      hourly_rate: 35000,
      check_in: `${month}-04T07:00:00.000Z`,
      check_out: `${month}-04T15:00:00.000Z`,
      hours_worked: 8,
      shift_type: 'Ca Sáng (07:00 - 15:00)',
      note: 'Trực chuyên môn Cơ sở chính 172 QL50, đã bàn giao két khớp 100%',
      status: 'COMPLETED',
      createdAt: now
    },
    {
      id: 2,
      staff_id: 2,
      staff_name: 'DS. Trần Hoàng Nam',
      staff_role: 'Dược sĩ Cao đẳng (Bán thuốc)',
      hourly_rate: 30000,
      check_in: `${month}-04T14:30:00.000Z`,
      check_out: `${month}-04T22:30:00.000Z`,
      hours_worked: 8,
      shift_type: 'Ca Chiều - Tối (14:30 - 22:30)',
      note: 'Trực ca tối Cơ sở chính 172 QL50, kiểm nhiệt độ tủ lạnh đạt 22°C',
      status: 'COMPLETED',
      createdAt: now
    }
  ];

  const commissions = [
    {
      id: 1,
      staff_id: 1,
      order_id: null,
      note: 'Thưởng tư vấn đơn Thực phẩm chức năng & Dược mỹ phẩm',
      amount: 200000,
      createdAt: now
    },
    {
      id: 2,
      staff_id: 2,
      order_id: null,
      note: 'Thưởng đạt chỉ tiêu doanh số ca tối',
      amount: 150000,
      createdAt: now
    }
  ];

  const cashier_shifts = [
    {
      id: 1,
      user_id: 1,
      actor_name: 'DS. Nguyễn Thị Minh',
      opening_cash: 1000000,
      closing_cash: 4850000,
      expected_cash: 4850000,
      difference: 0,
      cash_sales: 3850000,
      bank_sales: 1620000,
      order_count: 18,
      cash_out: 0,
      note: 'Ca sáng khớp két 100%, bàn giao đủ tiền lẻ cho ca chiều',
      status: 'closed',
      opened_at: `${month}-04T07:00:00.000Z`,
      closed_at: `${month}-04T15:00:00.000Z`
    }
  ];

  const customers = [
    { id: 1, name: 'Cô Nguyễn Thị Lan (Huyết áp định kỳ)', phone: '0908112233', total_spend: 2450000, tags: 'Bệnh nhân mãn tính', createdAt: now },
    { id: 2, name: 'Anh Lê Văn Hùng (KP4 Cần Giuộc)', phone: '0919223344', total_spend: 1280000, tags: 'Khách thân thiết', createdAt: now },
    { id: 3, name: 'Chị Phạm Thanh Thảo (Mẹ & Bé)', phone: '0938445566', total_spend: 3150000, tags: 'VIP', createdAt: now }
  ];

  const suppliers = [
    { id: 1, name: 'Công ty Cổ phần Dược Hậu Giang (DHG Pharma)', phone: '02923891433', address: '288 Bis Nguyễn Văn Cừ, Cần Thơ', tax_code: '1800156801', total_purchased: 85000000, total_debt: 0, status: 'active' },
    { id: 2, name: 'Công ty CP Dược phẩm Imexpharm', phone: '02773851941', address: 'Số 4 Đường 30/4, TP. Cao Lãnh', tax_code: '1400384433', total_purchased: 62000000, total_debt: 0, status: 'active' },
    { id: 3, name: 'Công ty TNHH Dược phẩm GSK Việt Nam', phone: '02838248711', address: 'Quận 1, TP. Hồ Chí Minh', tax_code: '0313456789', total_purchased: 112000000, total_debt: 0, status: 'active' }
  ];

  const orders = [
    {
      id: 1,
      order_code: 'HD-ND1001',
      total_amount: 450000,
      subtotal: 450000,
      discount: 0,
      paid_cash: 450000,
      paid_bank: 0,
      customer_name: 'Cô Nguyễn Thị Lan (Huyết áp định kỳ)',
      customer_phone: '0908112233',
      payment_method: 'cash',
      status: 'completed',
      branch_id: 1,
      createdAt: now,
      items: [
        { product_id: 120, product_name: 'Amlor 5mg Pfizer Huyết áp (Hộp 3 vỉ x 10 viên)', quantity: 1, price: 245000 },
        { product_id: 128, product_name: 'Ginkgo Biloba 120mg Hoạt huyết dưỡng não (Hộp 100 viên)', quantity: 1, price: 145000 },
        { product_id: 131, product_name: 'Khẩu trang Y tế 4 lớp kháng khuẩn chuẩn Bộ Y Tế (Hộp 50 cái)', quantity: 1, price: 60000 }
      ]
    },
    {
      id: 2,
      order_code: 'HD-ND1002',
      total_amount: 366000,
      subtotal: 366000,
      discount: 0,
      paid_cash: 0,
      paid_bank: 366000,
      customer_name: 'Anh Lê Văn Hùng (KP4 Cần Giuộc)',
      customer_phone: '0919223344',
      payment_method: 'bank',
      status: 'completed',
      branch_id: 1,
      createdAt: now,
      items: [
        { product_id: 109, product_name: 'Gaviscon Dual Action (Hộp 24 gói x 10ml)', quantity: 1, price: 198000 },
        { product_id: 113, product_name: 'Enterogermina 2 tỷ bào tử lợi khuẩn (Hộp 20 ống)', quantity: 1, price: 168000 }
      ]
    }
  ];

  const combos = [
    {
      id: 1,
      name: 'Đơn mẫu Cảm Cúm - Đau Họng Người Lớn (3 ngày)',
      sku: 'COMBO-CAM01',
      price: 125000,
      status: 'active',
      items: [
        { product_id: 115, product_name: 'Tiffy Dey Trị cảm cúm sổ mũi', quantity: 1 },
        { product_id: 117, product_name: 'Siro Ho Prospan Đức (Chai 100ml)', quantity: 1 },
        { product_id: 124, product_name: 'Berocca Performance Mango (Tuýp 10 viên sủi)', quantity: 1 }
      ]
    },
    {
      id: 2,
      name: 'Đơn mẫu Đau Dạ Dày - Trào Ngược Thực Quản',
      sku: 'COMBO-DD01',
      price: 285000,
      status: 'active',
      items: [
        { product_id: 109, product_name: 'Gaviscon Dual Action (Hộp 24 gói x 10ml)', quantity: 1 },
        { product_id: 110, product_name: 'Yumangel Thuốc dạ dày chữ Y (Hộp 20 gói)', quantity: 1 }
      ]
    }
  ];

  return {
    owner: {
      id: 1,
      name: 'Nhà Thuốc Nhân Đức',
      phone: '0933324368',
      taxCode: '1101982368',
      email: 'nhathuocnhanduc.longan@gmail.com',
      province: 'Tỉnh Long An',
      ward: 'Thị trấn Cần Giuộc',
      address: '172 Quốc lộ 50, KP4, Thị trấn Cần Giuộc, Huyện Cần Giuộc, Tỉnh Long An',
      sector: 'pharmacy',
      role: 'owner',
      actorType: 'owner'
    },
    categories,
    products,
    branches,
    branch_stock,
    batches,
    staff,
    shifts,
    commissions,
    cashier_shifts,
    customers,
    suppliers,
    orders,
    combos,
    transfers: [],
    returns: [],
    purchases: [],
    cash_flows: [
      { id: 1, transaction_type: 'in', category: 'Thu tiền bán thuốc POS', amount: 450000, payment_method: 'cash', notes: 'Đơn HD-ND1001', created_at: now },
      { id: 2, transaction_type: 'in', category: 'Thu chuyển khoản VietQR', amount: 366000, payment_method: 'bank', notes: 'Đơn HD-ND1002', created_at: now }
    ],
    debts: [],
    units: [
      { id: 1, product_id: 101, product_name: 'Panadol Extra Đỏ (Hộp 15 vỉ x 12 viên)', unit_name: 'Vỉ', ratio: 15, price: 18000, barcode: '89310101' },
      { id: 2, product_id: 101, product_name: 'Panadol Extra Đỏ (Hộp 15 vỉ x 12 viên)', unit_name: 'Viên', ratio: 180, price: 1600, barcode: '89310102' },
      { id: 3, product_id: 105, product_name: 'Augmentin 1g GSK (Hộp 2 vỉ x 7 viên)', unit_name: 'Vỉ', ratio: 2, price: 160000, barcode: '89310501' }
    ],
    price_levels: [
      { id: 1, name: 'Giá bán lẻ niêm yết GPP', discount_percent: 0, description: 'Áp dụng cho khách lẻ tại quầy' },
      { id: 2, name: 'Khách hàng Thân thiết / Bệnh mãn tính', discount_percent: 5, description: 'Giảm 5% cho đơn thuốc huyết áp, tiểu đường định kỳ' }
    ],
    news: [
      {
        id: 1,
        title: 'Quy chuẩn Thực hành tốt cơ sở bán lẻ thuốc (GPP) - Bộ Y Tế',
        link: 'https://dav.gov.vn',
        pubDate: now,
        snippet: 'Đảm bảo kiểm soát nhiệt độ bảo quản dưới 30°C, độ ẩm không quá 75% và theo dõi hạn dùng FEFO.',
        is_important: 1,
        is_read: 0
      }
    ],
    settings: {
      store_name: 'Nhà Thuốc Nhân Đức',
      store_phone: '0933324368',
      store_address: '172 Quốc lộ 50, KP4, Thị trấn Cần Giuộc, Huyện Cần Giuộc, Tỉnh Long An',
      gpp_license: 'GPP-LA-0933324368',
      chief_pharmacist: 'DSĐH. Nguyễn Thị Minh'
    }
  };
}

function loadDb() {
  hydrateFromIdb();
  if (memoryDb && Array.isArray(memoryDb.products) && memoryDb.products.length > 0) {
    if (ensureDefaultBranches(memoryDb)) saveDb(memoryDb);
    return memoryDb;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        memoryDb = parsed;
        if (ensureDefaultBranches(memoryDb)) saveDb(memoryDb);
        return memoryDb;
      }
    }
  } catch (e) {
    console.warn('Resetting local pharmacy DB:', e);
  }
  const initial = createInitialDb();
  ensureDefaultBranches(initial);
  memoryDb = initial;
  saveDb(initial);
  return initial;
}

function saveDb(db) {
  memoryDb = db;
  saveToIdb(db);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    // Fallback khi 7.000+ sản phẩm vượt giới hạn 5MB của localStorage:
    // Toàn bộ 7.000+ sản phẩm đã được lưu an toàn vào IndexedDB (NhanDucGPP_IDB) + memoryDb,
    // đồng thời lưu bản rút gọn vào localStorage để khởi động tức thì.
    try {
      const compactDb = {
        ...db,
        products: db.products.slice(0, 1500).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price,
          cost_price: p.cost_price,
          stock: p.stock,
          category: p.category,
          base_unit: p.base_unit || 'Hộp'
        })),
        branch_stock: (db.branch_stock || []).slice(0, 3000)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compactDb));
    } catch (_) {}
  }
}

let branchStockMapCache = null;
let lastBranchStockRef = null;

function populateBranchStockIfEmpty(db) {
  if (!db || !Array.isArray(db.products)) return;
  if (!Array.isArray(db.branch_stock)) db.branch_stock = [];
  if (db.branch_stock.length < db.products.length) {
    const branches = Array.isArray(db.branches) && db.branches.length > 0 ? db.branches : DEFAULT_BRANCH_DEFINITIONS;
    const defaultBranch = branches.find((b) => b.is_default) || branches[0];
    const defId = defaultBranch ? Number(defaultBranch.id) : 1;
    const newBranchStock = [];
    db.products.forEach((p) => {
      newBranchStock.push({ branch_id: defId, product_id: p.id, stock: Number(p.stock) || 0 });
    });
    db.branch_stock = newBranchStock;
    branchStockMapCache = null;
  }
}

function getBranchStockValue(db, branchId, prod) {
  const bId = Number(branchId) || 1;
  if (!branchStockMapCache || lastBranchStockRef !== db.branch_stock) {
    lastBranchStockRef = db.branch_stock;
    branchStockMapCache = new Map();
    (db.branch_stock || []).forEach((bs) => {
      branchStockMapCache.set(`${Number(bs.branch_id)}_${Number(bs.product_id)}`, Number(bs.stock) || 0);
    });
  }
  const key = `${bId}_${Number(prod.id)}`;
  if (branchStockMapCache.has(key)) return branchStockMapCache.get(key);
  const defaultBranch = (db.branches || []).find((b) => b.is_default) || db.branches?.[0];
  const defId = defaultBranch ? Number(defaultBranch.id) : 1;
  return bId === defId ? Number(prod.stock) || 0 : 0;
}

function syncProductTotalStock(db, productId) {
  const rows = (db.branch_stock || []).filter((bs) => Number(bs.product_id) === Number(productId));
  if (rows.length === 0) return;
  const total = rows.reduce((sum, bs) => sum + (Number(bs.stock) || 0), 0);
  const prod = db.products.find((p) => Number(p.id) === Number(productId));
  if (prod) prod.stock = total;
}

function adjustBranchStock(db, branchId, productId, delta) {
  const bId = Number(branchId) || 1;
  const pId = Number(productId);
  const prod = db.products.find((p) => Number(p.id) === pId);
  let row = db.branch_stock.find((bs) => Number(bs.branch_id) === bId && Number(bs.product_id) === pId);
  if (!row) {
    const current = prod ? getBranchStockValue(db, bId, prod) : 0;
    row = { branch_id: bId, product_id: pId, stock: current };
    db.branch_stock.push(row);
  }
  row.stock = Math.max(0, (Number(row.stock) || 0) + Number(delta));
  syncProductTotalStock(db, pId);
}

export function handleStandaloneApiRequest(method, rawUrl, rawBody) {
  const db = loadDb();
  const urlObj = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const path = urlObj.pathname.replace(/^\/dsluong/, '');
  const query = Object.fromEntries(urlObj.searchParams.entries());
  const m = (method || 'GET').toUpperCase();

  let body = {};
  if (rawBody) {
    if (typeof rawBody === 'string') {
      try { body = JSON.parse(rawBody); } catch { body = {}; }
    } else if (typeof rawBody === 'object') {
      body = rawBody;
    }
  }

  const ok = (data, status = 200) => ({ status, data });

  // 1. AUTHENTICATION
  if (path === '/api/auth/login' && m === 'POST') {
    const loginId = String(body.phone || body.username || '').trim();
    const pass = String(body.password || '').trim();
    const requestedBranchId = body.branch_id ? Number(body.branch_id) : null;
    const requestedBranch = requestedBranchId
      ? db.branches.find((b) => Number(b.id) === requestedBranchId)
      : null;

    // 1a. Kiểm tra đăng nhập trực tiếp bằng Tài khoản / SĐT riêng của Chi nhánh
    const matchedBranch = db.branches.find(
      (b) =>
        (b.username && b.username.toLowerCase() === loginId.toLowerCase()) ||
        (`cn${b.id}` === loginId.toLowerCase()) ||
        (b.phone && b.phone === loginId && loginId !== '0933324368')
    );
    if (matchedBranch && (pass === (matchedBranch.password || '123456') || pass === '123456')) {
      return ok({
        token: `nd-gpp-branch-${matchedBranch.id}-${Date.now()}`,
        user: {
          ...db.owner,
          name: matchedBranch.name,
          phone: matchedBranch.phone || db.owner.phone,
          address: matchedBranch.address || db.owner.address,
          branch_id: matchedBranch.id,
          branch_name: matchedBranch.name
        },
        branch: matchedBranch
      });
    }

    // 1b. Kiểm tra đăng nhập nhân viên Dược sĩ
    const matchedStaff = db.staff.find(
      (s) => (s.username === loginId || s.phone === loginId) && s.status !== 'locked'
    );
    if (matchedStaff && pass === '123456') {
      const targetBranch = requestedBranch || db.branches.find((b) => b.is_default) || db.branches[0];
      const userObj = {
        id: db.owner.id,
        staffId: matchedStaff.id,
        name: `${matchedStaff.name} (${targetBranch ? targetBranch.name : db.owner.name})`,
        phone: matchedStaff.phone || db.owner.phone,
        address: targetBranch ? targetBranch.address : db.owner.address,
        sector: 'pharmacy',
        role: matchedStaff.role,
        actorType: 'staff',
        branch_id: targetBranch ? targetBranch.id : 1,
        branch_name: targetBranch ? targetBranch.name : db.owner.name,
        permissions: matchedStaff.permissions || ['pos', 'orders', 'products', 'customers']
      };
      return ok({ token: `nd-gpp-staff-${matchedStaff.id}-${Date.now()}`, user: userObj, branch: targetBranch });
    }

    // 1c. Đăng nhập Chủ Nhà Thuốc Nhân Đức (hoặc SĐT bất kỳ chi nhánh nào với mật khẩu 123456)
    const anyBranchByPhone = db.branches.find((b) => b.phone === loginId);
    if (
      (loginId === '0933324368' || loginId === '0979164124' || loginId === 'admin' || loginId === 'nhanduc' || anyBranchByPhone) &&
      pass === '123456'
    ) {
      const targetBranch = requestedBranch || anyBranchByPhone || db.branches.find((b) => b.is_default) || db.branches[0];
      return ok({
        token: `nd-gpp-owner-${Date.now()}`,
        user: {
          ...db.owner,
          branch_id: targetBranch ? targetBranch.id : 1,
          branch_name: targetBranch ? targetBranch.name : db.owner.name
        },
        branch: targetBranch
      });
    }
    return ok({ error: 'Số điện thoại/tài khoản hoặc mật khẩu không đúng (Mặc định: 0933324368 / 123456)' }, 401);
  }

  if (path === '/api/auth/profile') {
    if (m === 'PUT') {
      db.owner = { ...db.owner, ...body };
      populateBranchStockIfEmpty(db);
    saveDb(db);
    }
    return ok({ user: db.owner, ...db.owner });
  }

  if (path === '/api/auth/register' && m === 'POST') {
    return ok({ token: `nd-gpp-owner-${Date.now()}`, user: db.owner });
  }

  // 2. BRANCHES & MULTI-BRANCH INVENTORY
  if (path === '/api/branches' && m === 'GET') {
    const bsMap = new Map();
    (db.branch_stock || []).forEach((bs) => {
      bsMap.set(`${bs.branch_id}_${bs.product_id}`, Number(bs.stock) || 0);
    });
    const defaultBranch = db.branches.find((b) => b.is_default) || db.branches[0];
    const defId = defaultBranch ? Number(defaultBranch.id) : 1;

    const rows = db.branches.map((b) => {
      const bId = Number(b.id);
      let so_mat_hang = 0;
      let tong_ton = 0;
      let gia_tri_ton = 0;
      db.products.forEach((p) => {
        const key = `${bId}_${p.id}`;
        const st = bsMap.has(key) ? bsMap.get(key) : bId === defId ? Number(p.stock) || 0 : 0;
        if (st > 0) {
          so_mat_hang++;
          tong_ton += st;
          gia_tri_ton += st * (Number(p.cost_price) || 0);
        }
      });
      return {
        ...b,
        username: b.username || `cn${b.id}`,
        password: b.password || '123456',
        so_mat_hang,
        tong_ton,
        gia_tri_ton: Math.round(gia_tri_ton)
      };
    });
    return ok(rows);
  }

  if (path === '/api/branches' && m === 'POST') {
    const newId = db.branches.reduce((max, b) => Math.max(max, Number(b.id) || 0), 0) + 1;
    const newBranch = {
      id: newId,
      user_id: 1,
      name: (body.name || `Chi nhánh ${newId}`).trim(),
      address: body.address || 'Cần Giuộc, Long An',
      phone: (body.phone || '0933324368').trim(),
      username: (body.username || body.phone || `cn${newId}`).trim(),
      password: (body.password || '123456').trim(),
      is_default: db.branches.length === 0 ? 1 : 0,
      status: 'active',
      createdAt: getTodayIso()
    };
    db.branches.push(newBranch);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: newId, branch: newBranch });
  }

  const branchInventoryMatch = path.match(/^\/api\/branches\/(\d+)\/ton-kho$/);
  if (branchInventoryMatch && m === 'GET') {
    const bId = Number(branchInventoryMatch[1]);
    const list = db.products.map((p) => ({
      ...p,
      stock: getBranchStockValue(db, bId, p)
    }));
    return ok(list);
  }

  if (path === '/api/branches/ton-kho/tong-hop' && m === 'GET') {
    const map = {};
    (db.branch_stock || []).forEach((x) => {
      map[`${x.product_id}_${x.branch_id}`] = x.stock;
    });
    const defaultBranch = db.branches.find((b) => b.is_default) || db.branches[0];
    const defId = defaultBranch ? Number(defaultBranch.id) : 1;
    return ok({
      branches: db.branches.map((b) => ({ id: b.id, name: b.name })),
      products: db.products.slice(0, 300).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        ton: db.branches.reduce((acc, b) => {
          const key = `${p.id}_${b.id}`;
          acc[b.id] = map[key] !== undefined ? map[key] : Number(b.id) === defId ? Number(p.stock) || 0 : 0;
          return acc;
        }, {})
      }))
    });
  }

  if (path === '/api/branches/chuyen-kho' && m === 'POST') {
    const fromId = Number(body.from_branch_id);
    const toId = Number(body.to_branch_id);
    const items = Array.isArray(body.items) ? body.items : [];
    const fromB = db.branches.find((b) => Number(b.id) === fromId);
    const toB = db.branches.find((b) => Number(b.id) === toId);
    if (!fromB || !toB) return ok({ error: 'Không tìm thấy chi nhánh' }, 404);

    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const p = db.products.find((x) => Number(x.id) === Number(it.product_id));
      const avail = p ? getBranchStockValue(db, fromId, p) : 0;
      if (avail < qty) {
        return ok({ error: `"${p ? p.name : 'Thuốc'}" tại ${fromB.name} chỉ còn ${avail}, không đủ để chuyển ${qty}` }, 400);
      }
    }

    items.forEach((it) => {
      const qty = Number(it.quantity) || 0;
      adjustBranchStock(db, fromId, it.product_id, -qty);
      adjustBranchStock(db, toId, it.product_id, qty);
    });

    const code = `CK${Date.now().toString().slice(-6)}`;
    const tr = {
      id: db.transfers.length + 1,
      code,
      from_branch: fromB.name,
      to_branch: toB.name,
      from_branch_id: fromId,
      to_branch_id: toId,
      total_items: items.length,
      note: body.note || '',
      status: 'DONE',
      createdAt: getTodayIso(),
      items
    };
    db.transfers.unshift(tr);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: tr.id, code });
  }

  if (path === '/api/branches/chuyen-kho/lich-su' && m === 'GET') {
    return ok(db.transfers || []);
  }

  const branchDefaultMatch = path.match(/^\/api\/branches\/(\d+)\/mac-dinh$/);
  if (branchDefaultMatch && m === 'POST') {
    const id = Number(branchDefaultMatch[1]);
    db.branches.forEach((b) => { b.is_default = Number(b.id) === id ? 1 : 0; });
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true });
  }

  const branchDeleteMatch = path.match(/^\/api\/branches\/(\d+)$/);
  if (branchDeleteMatch && m === 'DELETE') {
    const id = Number(branchDeleteMatch[1]);
    const b = db.branches.find((x) => Number(x.id) === id);
    if (b && b.is_default) return ok({ error: 'Không thể xóa cơ sở chính mặc định' }, 400);
    db.branches = db.branches.filter((x) => Number(x.id) !== id);
    db.branch_stock = db.branch_stock.filter((x) => Number(x.branch_id) !== id);
    db.products.forEach((p) => syncProductTotalStock(db, p.id));
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true });
  }

  // 3. PRODUCTS & CATEGORIES & BATCHES
  if (path === '/api/products' && m === 'GET') {
    const activeBranchId = Number(query.branch_id || (typeof localStorage !== 'undefined' && localStorage.getItem('active_branch_id')) || 0);
    if (activeBranchId > 0) {
      const list = db.products.map((p) => ({
        ...p,
        stock: getBranchStockValue(db, activeBranchId, p)
      }));
      return ok(list);
    }
    return ok(db.products);
  }

  if (path === '/api/products/sync-kiotviet') {
    seedFromBundledKiotViet();
    return ok({
      success: true,
      message: 'Đang kích hoạt nạp toàn bộ 7.854 sản phẩm KiotViet vào cơ sở dữ liệu...'
    });
  }

  if ((path === '/api/products/import-json' || path === '/api/products/import') && m === 'POST') {
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return ok({ error: 'Không tìm thấy dữ liệu sản phẩm trong file Excel' }, 400);
    }

    const mode = body.mode || 'merge';
    if (mode === 'replace') {
      db.products = [];
      db.branch_stock = [];
    }

    const existingCatNames = new Set((db.categories || []).map((c) => (c.name || '').toLowerCase().trim()));
    const skuIndexMap = new Map();
    db.products.forEach((p, idx) => {
      if (p.sku) skuIndexMap.set(String(p.sku).toLowerCase().trim(), idx);
    });

    let maxId = db.products.reduce((max, p) => Math.max(max, Number(p.id) || 0), 100);
    let addedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const name = String(item.name || '').trim();
      if (!name) continue;

      const catName = String(item.category || 'Hàng hóa KiotViet').trim();
      if (catName && !existingCatNames.has(catName.toLowerCase())) {
        existingCatNames.add(catName.toLowerCase());
        db.categories.push({
          id: db.categories.length + 1,
          name: catName,
          description: 'Danh mục nhập từ KiotViet / Sapo',
          status: 'active',
          createdAt: getTodayIso()
        });
      }

      const sku = String(item.sku || '').trim() || `KV-${maxId + 1}`;
      const skuKey = sku.toLowerCase();
      const price = Math.max(0, Number(item.price) || 0);
      const costPrice = Math.max(0, Number(item.cost_price) || 0);
      const stock = Math.max(0, Math.round(Number(item.stock) || 0));
      const baseUnit = String(item.base_unit || 'Hộp').trim();
      const imageUrl = String(item.image_url || '').trim();
      const variants = Array.isArray(item.variants) ? item.variants : [];

      if (skuIndexMap.has(skuKey)) {
        const existingIdx = skuIndexMap.get(skuKey);
        const existing = db.products[existingIdx];
        db.products[existingIdx] = {
          ...existing,
          name,
          price: price || existing.price,
          cost_price: costPrice || existing.cost_price,
          stock,
          category: catName || existing.category,
          base_unit: baseUnit || existing.base_unit || 'Hộp',
          image_url: imageUrl || existing.image_url || '',
          variants: variants.length > 0 ? variants : existing.variants
        };
        updatedCount++;
      } else {
        maxId++;
        const newProd = {
          id: maxId,
          name,
          sku,
          price,
          cost_price: costPrice,
          stock,
          category: catName,
          base_unit: baseUnit,
          track_batch: 1
        };
        if (imageUrl) newProd.image_url = imageUrl;
        if (variants.length > 0) newProd.variants = variants;
        skuIndexMap.set(skuKey, db.products.length);
        db.products.push(newProd);
        addedCount++;
      }
    }

    if (Array.isArray(body.batches) && body.batches.length > 0) {
      db.batches = body.batches;
    }
    if (Array.isArray(body.units) && body.units.length > 0) {
      db.units = body.units;
    }

    populateBranchStockIfEmpty(db);
    saveDb(db);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('productsUpdated'));
    }

    const totalImported = addedCount + updatedCount;
    return ok({
      success: true,
      count: totalImported,
      added: addedCount,
      updated: updatedCount,
      total: db.products.length,
      message: `Đã nhập thành công ${totalImported.toLocaleString('vi-VN')} sản phẩm từ KiotViet/Sapo (Thêm mới: ${addedCount.toLocaleString('vi-VN')}, Cập nhật: ${updatedCount.toLocaleString('vi-VN')})! Tổng kho hiện có: ${db.products.length.toLocaleString('vi-VN')} sản phẩm.`
    });
  }

  if ((path === '/api/products' || path === '/api/products/with-variants') && m === 'POST') {
    const newId = db.products.reduce((max, p) => Math.max(max, Number(p.id) || 0), 100) + 1;
    const variants = Array.isArray(body.variants) ? body.variants : [];
    const firstVar = variants[0] || {};
    const initStock = variants.length > 0
      ? variants.reduce((s, v) => s + (Number(v.stock) || 0), 0)
      : Number(body.stock) || 0;
    const newProd = {
      id: newId,
      name: body.name || 'Thuốc mới',
      sku: body.sku || firstVar.sku || `ND-TH${newId}`,
      price: Number(body.price ?? firstVar.price) || 0,
      cost_price: Number(body.cost_price ?? firstVar.cost_price) || 0,
      stock: initStock,
      category: body.category || 'Thuốc Giảm Đau - Hạ Sốt - Kháng Viêm',
      base_unit: body.base_unit || body.unit || 'Hộp',
      track_batch: 1,
      image_url: body.image_url || '',
      variants: variants.map((v, idx) => ({
        id: newId * 100 + idx + 1,
        product_id: newId,
        sku: v.sku || `ND-TH${newId}-${idx + 1}`,
        price: Number(v.price) || 0,
        cost_price: Number(v.cost_price) || 0,
        stock: Number(v.stock) || 0,
        image_url: v.image_url || body.image_url || '',
        attributes: v.attributes || { 'Phiên bản': 'Mặc định' }
      }))
    };
    db.products.unshift(newProd);
    const defaultBranch = db.branches.find((b) => b.is_default) || db.branches[0];
    if (defaultBranch) {
      db.branch_stock.push({
        branch_id: defaultBranch.id,
        product_id: newId,
        stock: initStock
      });
    }
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: newId, product: newProd });
  }

  if (path === '/api/products/bulk-delete' && m === 'POST') {
    const ids = new Set((body.ids || []).map((x) => Number(x)));
    const before = db.products.length;
    db.products = db.products.filter((p) => !ids.has(Number(p.id)));
    db.branch_stock = (db.branch_stock || []).filter((bs) => !ids.has(Number(bs.product_id)));
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, deleted: before - db.products.length });
  }

  if (path === '/api/products/clear-all/confirm' && m === 'DELETE') {
    const count = db.products.length;
    db.products = [];
    db.branch_stock = [];
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, deleted: count });
  }

  if (path === '/api/products/bulk-update-price' && m === 'POST') {
    const ids = new Set((body.ids || []).map((x) => Number(x)));
    const type = body.type;
    const numVal = Number(body.value) || 0;
    let updated = 0;
    db.products.forEach((p) => {
      if (!ids.has(Number(p.id))) return;
      let newPrice = Number(p.price) || 0;
      if (type === 'percent_add') newPrice = Math.round(newPrice * (1 + numVal / 100));
      else if (type === 'percent_sub') newPrice = Math.max(0, Math.round(newPrice * (1 - numVal / 100)));
      else if (type === 'fixed_add') newPrice = newPrice + numVal;
      else if (type === 'fixed_sub') newPrice = Math.max(0, newPrice - numVal);
      else if (type === 'set_exact') newPrice = Math.max(0, numVal);
      p.price = newPrice;
      if (Array.isArray(p.variants)) {
        p.variants.forEach((v) => { v.price = newPrice; });
      }
      updated++;
    });
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, count: updated });
  }

  const variantMatch = path.match(/^\/api\/products\/variants\/(\d+)$/);
  if (variantMatch && m === 'PUT') {
    const vId = Number(variantMatch[1]);
    db.products.forEach((p) => {
      if (Array.isArray(p.variants)) {
        const idx = p.variants.findIndex((v) => Number(v.id) === vId);
        if (idx !== -1) {
          p.variants[idx] = { ...p.variants[idx], ...body };
        }
      }
    });
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true });
  }

  const prodMatch = path.match(/^\/api\/products\/(\d+)$/);
  if (prodMatch && m === 'PUT') {
    const id = Number(prodMatch[1]);
    const idx = db.products.findIndex((p) => Number(p.id) === id);
    if (idx !== -1) {
      db.products[idx] = { ...db.products[idx], ...body };
      populateBranchStockIfEmpty(db);
    saveDb(db);
    }
    return ok({ success: true });
  }
  if (prodMatch && m === 'DELETE') {
    const id = Number(prodMatch[1]);
    db.products = db.products.filter((p) => Number(p.id) !== id);
    db.branch_stock = db.branch_stock.filter((bs) => Number(bs.product_id) !== id);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true });
  }

  // 3B. STOCKTAKE / INVENTORY CHECK (/api/stocktake)
  if (path === '/api/stocktake/danh-sach/hang' && m === 'GET') {
    const bId = Number(query.branch_id || 1);
    const items = db.products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      cost_price: Number(p.cost_price) || 0,
      system_qty: getBranchStockValue(db, bId, p)
    }));
    return ok({ items });
  }

  if (path === '/api/stocktake' && m === 'GET') {
    return ok(db.stocktakes || []);
  }

  if (path === '/api/stocktake' && m === 'POST') {
    if (!Array.isArray(db.stocktakes)) db.stocktakes = [];
    const bId = Number(body.branch_id || 1);
    const branchObj = db.branches.find((b) => Number(b.id) === bId) || db.branches[0];
    const items = Array.isArray(body.items) ? body.items : [];
    const detailItems = [];
    let totalDiffValue = 0;

    items.forEach((it, idx) => {
      const prod = db.products.find((p) => Number(p.id) === Number(it.product_id));
      if (!prod) return;
      const sysQty = getBranchStockValue(db, bId, prod);
      const actQty = Math.max(0, Number(it.actual_qty) || 0);
      const diff = actQty - sysQty;
      if (diff !== 0) {
        adjustBranchStock(db, bId, prod.id, diff);
        totalDiffValue += diff * (Number(prod.cost_price) || 0);
        detailItems.push({
          id: idx + 1,
          product_id: prod.id,
          product_name: prod.name,
          sku: prod.sku,
          system_qty: sysQty,
          actual_qty: actQty,
          diff
        });
      }
    });

    const code = `KK-${Date.now().toString().slice(-6)}`;
    const record = {
      id: db.stocktakes.length + 1,
      code,
      branch_id: bId,
      branch_name: branchObj ? branchObj.name : 'Cơ sở chính',
      note: body.note || '',
      total_items: detailItems.length,
      total_difference: Math.round(totalDiffValue),
      createdAt: getTodayIso(),
      items: detailItems
    };
    db.stocktakes.unshift(record);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({
      success: true,
      id: record.id,
      code,
      so_mat_hang_da_dem: items.length,
      so_mat_hang_lech: detailItems.length
    });
  }

  const stocktakeDetailMatch = path.match(/^\/api\/stocktake\/(\d+)$/);
  if (stocktakeDetailMatch && m === 'GET') {
    const id = Number(stocktakeDetailMatch[1]);
    const found = (db.stocktakes || []).find((s) => Number(s.id) === id);
    return ok(found || { items: [] });
  }

  if (path === '/api/categories' && m === 'GET') {
    return ok(
      db.categories.map((c) => ({
        ...c,
        product_count: db.products.filter((p) => p.category === c.name).length
      }))
    );
  }
  if (path === '/api/categories' && m === 'POST') {
    const newId = db.categories.length + 1;
    const cat = { id: newId, name: body.name, description: body.description || '', status: 'active', createdAt: getTodayIso() };
    db.categories.push(cat);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: newId });
  }

  if (path.startsWith('/api/batches')) {
    if (m === 'GET') return ok(db.batches || []);
    if (m === 'POST') {
      const prod = db.products.find((p) => Number(p.id) === Number(body.product_id));
      const newBatch = {
        id: (db.batches.length || 0) + 1,
        product_id: Number(body.product_id),
        product_name: prod ? prod.name : 'Thuốc GPP',
        sku: prod ? prod.sku : '',
        batch_code: body.batch_code || `LOT-${Date.now().toString().slice(-5)}`,
        expiry_date: body.expiry_date || '2028-12-31',
        quantity: Number(body.quantity) || 0,
        cost_price: Number(body.cost_price) || (prod ? prod.cost_price : 0),
        note: body.note || '',
        createdAt: getTodayIso()
      };
      db.batches.unshift(newBatch);
      const activeBranchId = Number((typeof localStorage !== 'undefined' && localStorage.getItem('active_branch_id')) || 1);
      adjustBranchStock(db, activeBranchId, newBatch.product_id, newBatch.quantity);
      populateBranchStockIfEmpty(db);
    saveDb(db);
      return ok({ success: true, id: newBatch.id });
    }
  }

  // 4. POS CHECKOUT & ORDERS
  if (path === '/api/pos/checkout' && m === 'POST') {
    const items = Array.isArray(body.items) ? body.items : [];
    const activeBranchId = Number(body.branch_id || (typeof localStorage !== 'undefined' && localStorage.getItem('active_branch_id')) || 1);
    const total = Number(body.total_amount || body.total) || items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const orderCode = `HD-ND${1000 + db.orders.length + 1}`;
    const newOrder = {
      id: db.orders.length + 1,
      order_code: orderCode,
      total_amount: total,
      subtotal: Number(body.subtotal) || total,
      discount: Number(body.discount) || 0,
      paid_cash: body.payment_method === 'bank' ? 0 : total,
      paid_bank: body.payment_method === 'bank' ? total : 0,
      customer_name: body.customer_name || 'Khách lẻ mua thuốc',
      customer_phone: body.customer_phone || '',
      payment_method: body.payment_method || 'cash',
      status: 'completed',
      branch_id: activeBranchId,
      createdAt: getTodayIso(),
      items
    };
    items.forEach((it) => {
      adjustBranchStock(db, activeBranchId, it.product_id || it.id, -(Number(it.quantity) || 1));
    });
    db.orders.unshift(newOrder);
    db.cash_flows.unshift({
      id: db.cash_flows.length + 1,
      transaction_type: 'in',
      category: 'Thu tiền bán thuốc POS',
      amount: total,
      payment_method: newOrder.payment_method,
      notes: `Đơn thuốc ${orderCode}`,
      created_at: newOrder.createdAt
    });
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, order_id: newOrder.id, order_code: orderCode, order: newOrder });
  }

  if ((path === '/api/pos/orders' || path === '/api/orders') && m === 'GET') {
    return ok(db.orders || []);
  }

  // 5. PHARMACIST SHIFT OPEN / CLOSE (/api/shifts)
  if (path === '/api/shifts/current' && m === 'GET') {
    const openShift = db.cashier_shifts.find((s) => s.status === 'open');
    if (!openShift) return ok(null);
    const ordersSince = db.orders.filter((o) => o.createdAt >= openShift.opened_at && o.status !== 'cancelled');
    const cash_sales = ordersSince.filter((o) => o.payment_method === 'cash').reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const bank_sales = ordersSince.filter((o) => o.payment_method !== 'cash').reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const expected_now = (Number(openShift.opening_cash) || 0) + cash_sales;
    return ok({
      ...openShift,
      cash_sales,
      bank_sales,
      total_revenue: cash_sales + bank_sales,
      order_count: ordersSince.length,
      cash_out: 0,
      expected_now
    });
  }

  if (path === '/api/shifts' && m === 'GET') {
    return ok(db.cashier_shifts || []);
  }

  if (path === '/api/shifts/open' && m === 'POST') {
    const existing = db.cashier_shifts.find((s) => s.status === 'open');
    if (existing) return ok({ error: 'Đang có ca trực mở, vui lòng chốt ca trước' }, 409);
    const newShift = {
      id: db.cashier_shifts.length + 1,
      user_id: 1,
      actor_name: body.pharmacist_name || 'DS. Nguyễn Thị Minh',
      opening_cash: Number(body.opening_cash) || 0,
      closing_cash: null,
      expected_cash: null,
      difference: null,
      cash_sales: 0,
      bank_sales: 0,
      order_count: 0,
      cash_out: 0,
      note: body.note || '',
      status: 'open',
      opened_at: getTodayIso(),
      closed_at: null
    };
    db.cashier_shifts.unshift(newShift);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: newShift.id });
  }

  if (path === '/api/shifts/close' && m === 'POST') {
    const openShift = db.cashier_shifts.find((s) => s.status === 'open');
    if (!openShift) return ok({ error: 'Không có ca trực nào đang mở' }, 404);
    const ordersSince = db.orders.filter((o) => o.createdAt >= openShift.opened_at && o.status !== 'cancelled');
    const cash_sales = ordersSince.filter((o) => o.payment_method === 'cash').reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const bank_sales = ordersSince.filter((o) => o.payment_method !== 'cash').reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const expected = (Number(openShift.opening_cash) || 0) + cash_sales;
    const closing = Number(body.closing_cash) || 0;
    const difference = closing - expected;

    openShift.closing_cash = closing;
    openShift.expected_cash = expected;
    openShift.difference = difference;
    openShift.cash_sales = cash_sales;
    openShift.bank_sales = bank_sales;
    openShift.order_count = ordersSince.length;
    openShift.note = body.note || openShift.note;
    openShift.status = 'closed';
    openShift.closed_at = getTodayIso();
    populateBranchStockIfEmpty(db);
    saveDb(db);

    return ok({
      success: true,
      expected_cash: expected,
      closing_cash: closing,
      difference,
      cash_sales,
      bank_sales,
      order_count: ordersSince.length,
      cash_out: 0
    });
  }

  // 6. STAFF & COMMISSIONS (/api/staff)
  if (path === '/api/staff' && m === 'GET') {
    return ok(db.staff || []);
  }

  if (path === '/api/staff' && m === 'POST') {
    const newId = db.staff.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0) + 1;
    const st = {
      id: newId,
      user_id: 1,
      name: body.name || 'Dược sĩ mới',
      phone: body.phone || '',
      username: body.username || `duocsi${newId}`,
      role: body.role || 'Dược sĩ bán thuốc',
      permissions: Array.isArray(body.permissions) ? body.permissions : ['pos', 'orders', 'products', 'customers'],
      status: 'active',
      sales_total: 0,
      base_salary: Number(body.base_salary) || 0,
      hourly_rate: Number(body.hourly_rate) || 30000,
      allowance: Number(body.allowance) || 0,
      createdAt: getTodayIso()
    };
    db.staff.push(st);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: newId });
  }

  const staffUpdateMatch = path.match(/^\/api\/staff\/(\d+)$/);
  if (staffUpdateMatch && m === 'PUT') {
    const id = Number(staffUpdateMatch[1]);
    const idx = db.staff.findIndex((s) => Number(s.id) === id);
    if (idx !== -1) {
      db.staff[idx] = {
        ...db.staff[idx],
        ...body,
        base_salary: body.base_salary !== undefined ? Number(body.base_salary) : db.staff[idx].base_salary,
        hourly_rate: body.hourly_rate !== undefined ? Number(body.hourly_rate) : db.staff[idx].hourly_rate,
        allowance: body.allowance !== undefined ? Number(body.allowance) : db.staff[idx].allowance
      };
      populateBranchStockIfEmpty(db);
    saveDb(db);
    }
    return ok({ success: true });
  }

  const staffLockMatch = path.match(/^\/api\/staff\/(\d+)\/lock$/);
  if (staffLockMatch && m === 'POST') {
    const id = Number(staffLockMatch[1]);
    const st = db.staff.find((s) => Number(s.id) === id);
    if (st) {
      st.status = body.locked ? 'locked' : 'active';
      populateBranchStockIfEmpty(db);
    saveDb(db);
    }
    return ok({ success: true, status: st ? st.status : 'active' });
  }

  if (path === '/api/staff/commissions' && m === 'GET') {
    const rows = db.staff.map((s) => {
      const myComms = db.commissions.filter((c) => Number(c.staff_id) === Number(s.id));
      return {
        staff_id: s.id,
        staff_name: s.name,
        role: s.role,
        sales_total: s.sales_total || 0,
        so_lan: myComms.length,
        tong_hoa_hong: myComms.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
      };
    });
    return ok(rows);
  }

  if (path === '/api/staff/commissions' && m === 'POST') {
    const newComm = {
      id: db.commissions.length + 1,
      staff_id: Number(body.staff_id),
      order_id: body.order_id || null,
      note: body.note || body.order_id || 'Thưởng tư vấn đơn thuốc',
      amount: Math.round(Number(body.amount) || 0),
      createdAt: getTodayIso()
    };
    db.commissions.push(newComm);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: newComm.id });
  }

  if (path === '/api/staff/audit-log') {
    return ok([
      { id: 1, actor_type: 'owner', actor_name: 'Nhà Thuốc Nhân Đức', action: 'shift.open', target: 'Quầy chính 172 QL50', created_at: getTodayIso() }
    ]);
  }

  // 7. HRM ATTENDANCE & PAYROLL (/api/hrm)
  if (path === '/api/hrm' && m === 'GET') {
    const rows = db.shifts.map((sh) => {
      const st = db.staff.find((x) => Number(x.id) === Number(sh.staff_id)) || {};
      return {
        ...sh,
        staff_name: st.name || sh.staff_name || 'Dược sĩ',
        staff_role: st.role || sh.staff_role || 'Dược sĩ',
        hourly_rate: Number(st.hourly_rate) || 30000
      };
    });
    return ok(rows);
  }

  if (path === '/api/hrm/checkin' && m === 'POST') {
    const staffId = Number(body.staff_id);
    const st = db.staff.find((x) => Number(x.id) === staffId);
    if (!st) return ok({ error: 'Không tìm thấy Dược sĩ / Nhân viên' }, 404);
    const active = db.shifts.find((s) => Number(s.staff_id) === staffId && (s.status === 'ACTIVE' || !s.check_out));
    if (active) return ok({ error: `${st.name} đang trong ca trực. Vui lòng bấm Chốt ca trước!` }, 409);

    const newShift = {
      id: db.shifts.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0) + 1,
      staff_id: staffId,
      staff_name: st.name,
      staff_role: st.role,
      hourly_rate: st.hourly_rate,
      check_in: getTodayIso(),
      check_out: null,
      hours_worked: 0,
      shift_type: body.shift_type || 'Ca Sáng (07:00 - 14:30)',
      note: body.note || '',
      status: 'ACTIVE',
      createdAt: getTodayIso()
    };
    db.shifts.unshift(newShift);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, shift_id: newShift.id, check_in: newShift.check_in });
  }

  if (path === '/api/hrm/checkout' && m === 'POST') {
    const shiftId = Number(body.shift_id);
    const sh = db.shifts.find((s) => Number(s.id) === shiftId);
    if (!sh) return ok({ error: 'Không tìm thấy ca trực' }, 404);
    const nowIso = getTodayIso();
    const diffHours = Math.max(0.25, (Date.now() - new Date(sh.check_in).getTime()) / 3600000);
    const hoursWorked = body.manual_hours !== undefined && body.manual_hours !== '' && !isNaN(Number(body.manual_hours))
      ? Math.max(0, Number(body.manual_hours))
      : Math.round(diffHours * 100) / 100;

    sh.check_out = nowIso;
    sh.hours_worked = hoursWorked;
    if (body.note !== undefined) sh.note = body.note;
    sh.status = 'COMPLETED';
    populateBranchStockIfEmpty(db);
    saveDb(db);

    const st = db.staff.find((x) => Number(x.id) === Number(sh.staff_id)) || {};
    const shiftPay = Math.round(hoursWorked * (Number(st.hourly_rate) || 30000));
    return ok({
      success: true,
      shift_id: sh.id,
      staff_name: st.name || sh.staff_name,
      check_in: sh.check_in,
      check_out: nowIso,
      hours_worked: hoursWorked,
      shift_pay: shiftPay
    });
  }

  const hrmDeleteMatch = path.match(/^\/api\/hrm\/(\d+)$/);
  if (hrmDeleteMatch && m === 'DELETE') {
    const id = Number(hrmDeleteMatch[1]);
    db.shifts = db.shifts.filter((s) => Number(s.id) !== id);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true });
  }

  if (path === '/api/hrm/payroll' && m === 'GET') {
    const month = query.month || getCurrentMonthStr();
    const payroll = db.staff.map((st) => {
      const myShifts = db.shifts.filter(
        (s) => Number(s.staff_id) === Number(st.id) && (!s.check_in || s.check_in.slice(0, 7) === month)
      );
      const completed = myShifts.filter((s) => s.status === 'COMPLETED' || s.check_out);
      const active = myShifts.filter((s) => s.status === 'ACTIVE' && !s.check_out);
      const totalHours = Math.round(completed.reduce((sum, s) => sum + (Number(s.hours_worked) || 0), 0) * 100) / 100;
      const hourlyPay = Math.round(totalHours * (Number(st.hourly_rate) || 0));
      const commPay = db.commissions
        .filter((c) => Number(c.staff_id) === Number(st.id) && (!c.createdAt || c.createdAt.slice(0, 7) === month))
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const baseSalary = Math.round(Number(st.base_salary) || 0);
      const allowance = Math.round(Number(st.allowance) || 0);
      const totalSalary = baseSalary + hourlyPay + allowance + commPay;

      return {
        staff_id: st.id,
        name: st.name,
        phone: st.phone,
        username: st.username,
        role: st.role,
        status: st.status,
        base_salary: baseSalary,
        hourly_rate: Number(st.hourly_rate) || 0,
        allowance,
        completed_shifts: completed.length,
        active_shifts: active.length,
        total_hours: totalHours,
        hourly_pay: hourlyPay,
        commission_pay: commPay,
        total_salary: totalSalary
      };
    });

    return ok({
      month,
      payroll,
      summary: {
        total_staff: payroll.length,
        total_hours: Math.round(payroll.reduce((a, b) => a + b.total_hours, 0) * 100) / 100,
        total_payroll: payroll.reduce((a, b) => a + b.total_salary, 0)
      }
    });
  }

  // 8. OTHER MODULES (CUSTOMERS, SUPPLIERS, FINANCE, COMBOS, UNITS, NEWS, SETTINGS)
  if (path === '/api/customers' && m === 'GET') return ok(db.customers || []);
  if (path === '/api/customers' && m === 'POST') {
    const c = { id: db.customers.length + 1, ...body, total_spend: 0, createdAt: getTodayIso() };
    db.customers.unshift(c);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: c.id, customer: c });
  }
  if (path === '/api/customers/rfm') return ok(db.customers || []);

  if (path === '/api/suppliers' && m === 'GET') return ok(db.suppliers || []);
  if (path === '/api/suppliers' && m === 'POST') {
    const s = { id: db.suppliers.length + 1, ...body, total_purchased: 0, total_debt: 0, status: 'active' };
    db.suppliers.unshift(s);
    populateBranchStockIfEmpty(db);
    saveDb(db);
    return ok({ success: true, id: s.id });
  }

  if (path === '/api/pd/combos' || path === '/api/combos') {
    if (m === 'GET') return ok(db.combos || []);
    if (m === 'POST') {
      const c = { id: db.combos.length + 1, ...body, status: 'active' };
      db.combos.push(c);
      populateBranchStockIfEmpty(db);
    saveDb(db);
      return ok({ success: true, id: c.id });
    }
  }

  if (path === '/api/pricing/units') {
    if (m === 'GET') return ok(db.units || []);
    if (m === 'POST') {
      const u = { id: db.units.length + 1, ...body };
      db.units.push(u);
      populateBranchStockIfEmpty(db);
    saveDb(db);
      return ok({ success: true, id: u.id });
    }
  }
  if (path === '/api/pricing/levels') return ok(db.price_levels || []);
  if (path === '/api/finance/cashflows' || path === '/api/finance') return ok(db.cash_flows || []);
  if (path === '/api/finance/debts') return ok(db.debts || []);
  if (path === '/api/returns') return ok(db.returns || []);
  if (path === '/api/purchases') return ok(db.purchases || []);
  if (path === '/api/news') return ok(db.news || []);
  if (path === '/api/news/read') return ok({ success: true });
  if (path === '/api/settings') {
    if (m === 'POST' || m === 'PUT') {
      db.settings = { ...db.settings, ...body };
      populateBranchStockIfEmpty(db);
    saveDb(db);
    }
    return ok(db.settings || {});
  }

  return ok([]);
}

export function initPharmacyStandaloneEngine(axiosInstance) {
  if (typeof window === 'undefined') return;

  // Khởi tạo DB ngay khi mở ứng dụng
  loadDb();

  // 1. Intercept window.fetch cho mọi lệnh gọi /api/
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const urlStr = typeof input === 'string' ? input : (input?.url || '');
    if (urlStr.includes('/api/')) {
      const method = init.method || (typeof input === 'object' && input.method) || 'GET';
      const result = handleStandaloneApiRequest(method, urlStr, init.body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(input, init);
  };

  // 2. Intercept axios adapter cho mọi lệnh gọi /api/
  const defaultAdapter = axiosInstance.defaults.adapter;
  axiosInstance.defaults.adapter = async (config) => {
    const urlStr = config.url || '';
    if (urlStr.includes('/api/')) {
      const result = handleStandaloneApiRequest(config.method, urlStr, config.data);
      if (result.status >= 400) {
        const err = new Error(result.data?.error || 'Request failed');
        err.config = config;
        err.response = {
          data: result.data,
          status: result.status,
          statusText: String(result.status),
          headers: {},
          config
        };
        return Promise.reject(err);
      }
      return {
        data: result.data,
        status: result.status,
        statusText: 'OK',
        headers: {},
        config
      };
    }
    if (typeof defaultAdapter === 'function') {
      return defaultAdapter(config);
    }
    return Promise.reject(new Error('No adapter available'));
  };
}
