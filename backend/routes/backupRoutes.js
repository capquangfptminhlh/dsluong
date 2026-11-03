const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('../sqliteCompat').verbose();
const db = require('../db');
const { requireAuth, requireSuperadmin, writeAudit } = require('../middleware/auth');

const dbPath = path.resolve(__dirname, '..', 'autotax.db');
const thuMucSaoLuu = path.resolve(__dirname, '..', 'backups');
const fileChoKhoiPhuc = path.resolve(__dirname, '..', 'restore-pending.db');

if (!fs.existsSync(thuMucSaoLuu)) fs.mkdirSync(thuMucSaoLuu, { recursive: true });

// Các endpoint này thao tác snapshot SQLite của TOÀN hệ thống, không phải dữ liệu
// riêng của một tenant. Vì vậy tenant owner tuyệt đối không được truy cập.
router.use(requireAuth, requireSuperadmin);

const upload = multer({
  dest: path.resolve(__dirname, '..', 'tmp-upload'),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function tenFileMoi() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `autotax-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.db`;
}

router.post('/create', (req, res) => {
  const ten = tenFileMoi();
  const dich = path.join(thuMucSaoLuu, ten);
  db.run(`VACUUM INTO ?`, [dich], (err) => {
    if (err) return res.status(500).json({ error: 'Không tạo được bản sao lưu: ' + err.message });
    const kt = fs.statSync(dich);
    writeAudit(req, { action: 'backup.create', target: ten, detail: { size: kt.size } });
    res.json({ success: true, name: ten, size: kt.size });
  });
});

router.get('/', (req, res) => {
  try {
    const ds = fs.readdirSync(thuMucSaoLuu)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(thuMucSaoLuu, f));
        return { name: f, size: st.size, createdAt: st.mtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(ds);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/download/:name', (req, res) => {
  const ten = path.basename(req.params.name);
  const f = path.join(thuMucSaoLuu, ten);
  if (!f.startsWith(thuMucSaoLuu) || !fs.existsSync(f)) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
  writeAudit(req, { action: 'backup.download', target: ten });
  res.download(f, ten);
});

router.delete('/:name', (req, res) => {
  const ten = path.basename(req.params.name);
  const f = path.join(thuMucSaoLuu, ten);
  if (!f.startsWith(thuMucSaoLuu) || !fs.existsSync(f)) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
  fs.unlinkSync(f);
  writeAudit(req, { action: 'backup.delete', target: ten });
  res.json({ success: true });
});

router.post('/restore', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file sao lưu' });

  const tmp = req.file.path;
  const donDep = () => { try { fs.unlinkSync(tmp); } catch (_) {} };

  const kiemTra = new sqlite3.Database(tmp, sqlite3.OPEN_READONLY, (err) => {
    if (err) { donDep(); return res.status(400).json({ error: 'File không phải CSDL hợp lệ' }); }
    kiemTra.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','products','pos_orders')`,
      [],
      (e, rows) => {
        if (e || !rows || rows.length < 3) {
          kiemTra.close(); donDep();
          return res.status(400).json({ error: 'File sao lưu không đúng định dạng của phần mềm này' });
        }
        kiemTra.get('SELECT COUNT(*) AS c FROM users', [], (e2, row) => {
          kiemTra.close();
          if (e2) { donDep(); return res.status(400).json({ error: 'Không đọc được dữ liệu trong file' }); }
          try {
            fs.copyFileSync(tmp, fileChoKhoiPhuc);
            donDep();
            writeAudit(req, { action: 'backup.restore_queued', detail: { so_tai_khoan: row.c } });
            res.json({
              success: true,
              can_khoi_dong_lai: true,
              so_tai_khoan: row.c,
              message: 'Đã nhận bản sao lưu. Hãy TẮT và MỞ LẠI phần mềm để hoàn tất khôi phục.',
            });
          } catch (e3) {
            donDep();
            res.status(500).json({ error: e3.message });
          }
        });
      }
    );
  });
});

router.delete('/restore/pending', (req, res) => {
  if (fs.existsSync(fileChoKhoiPhuc)) fs.unlinkSync(fileChoKhoiPhuc);
  res.json({ success: true });
});

router.get('/restore/status', (req, res) => {
  res.json({ dang_cho: fs.existsSync(fileChoKhoiPhuc) });
});

module.exports = router;
