const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Tự động đảm bảo các cột mở rộng cho chấm công & tính lương tồn tại
db.serialize(() => {
  db.run("ALTER TABLE shifts ADD COLUMN hours_worked REAL DEFAULT 0", () => {});
  db.run("ALTER TABLE shifts ADD COLUMN shift_type TEXT DEFAULT 'Ca tiêu chuẩn'", () => {});
  db.run("ALTER TABLE shifts ADD COLUMN note TEXT", () => {});
  db.run("ALTER TABLE staff ADD COLUMN base_salary REAL DEFAULT 0", () => {});
  db.run("ALTER TABLE staff ADD COLUMN hourly_rate REAL DEFAULT 25000", () => {});
  db.run("ALTER TABLE staff ADD COLUMN allowance REAL DEFAULT 0", () => {});
});

// Lấy danh sách ca chấm công gần đây
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  db.all(
    `SELECT s.*, st.name as staff_name, st.role as staff_role, st.hourly_rate
     FROM shifts s
     JOIN staff st ON s.staff_id = st.id
     WHERE st.user_id = ?
     ORDER BY s.id DESC LIMIT ?`,
    [req.tenantId, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// Vào ca (Check-in)
router.post('/checkin', (req, res) => {
  const { staff_id, shift_type = 'Ca sáng (07:00 - 14:30)', note = '' } = req.body;
  if (!staff_id) return res.status(400).json({ error: 'Vui lòng chọn Dược sĩ / Nhân viên' });

  db.get(
    `SELECT id, name FROM staff WHERE id = ? AND user_id = ?`,
    [staff_id, req.tenantId],
    (err, staffRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!staffRow) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

      // Kiểm tra xem nhân viên có đang trong ca chưa chốt không
      db.get(
        `SELECT id FROM shifts WHERE staff_id = ? AND (status = 'ACTIVE' OR check_out IS NULL)`,
        [staff_id],
        (err2, activeShift) => {
          if (err2) return res.status(500).json({ error: err2.message });
          if (activeShift) {
            return res.status(409).json({ error: `${staffRow.name} đang trong ca trực. Vui lòng bấm Chốt ca (Ra ca) trước!` });
          }

          const nowIso = new Date().toISOString();
          db.run(
            `INSERT INTO shifts (staff_id, check_in, shift_type, note, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
            [staff_id, nowIso, shift_type, note],
            function (err3) {
              if (err3) return res.status(500).json({ error: err3.message });
              res.json({ success: true, shift_id: this.lastID, check_in: nowIso });
            }
          );
        }
      );
    }
  );
});

// Chốt ca / Ra ca (Check-out)
router.post('/checkout', (req, res) => {
  const { shift_id, manual_hours, note } = req.body;
  if (!shift_id) return res.status(400).json({ error: 'Thiếu mã ca trực (shift_id)' });

  db.get(
    `SELECT s.*, st.user_id, st.name as staff_name, st.hourly_rate
     FROM shifts s
     JOIN staff st ON s.staff_id = st.id
     WHERE s.id = ? AND st.user_id = ?`,
    [shift_id, req.tenantId],
    (err, shift) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!shift) return res.status(404).json({ error: 'Không tìm thấy ca làm việc' });
      if (shift.status === 'COMPLETED' && shift.check_out) {
        return res.status(400).json({ error: 'Ca làm việc này đã được chốt trước đó' });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const checkInDate = new Date(shift.check_in);
      let diffHours = (now.getTime() - checkInDate.getTime()) / (1000 * 3600);
      if (isNaN(diffHours) || diffHours < 0) diffHours = 0;

      // Nếu chủ nhà thuốc nhập số giờ thực tế (manual_hours) thì ưu tiên lấy, ngược lại tự tính theo đồng hồ (tối thiểu 0.25h nếu vừa bấm test)
      let hoursWorked = manual_hours !== undefined && manual_hours !== '' && !isNaN(Number(manual_hours))
        ? Math.max(0, Number(manual_hours))
        : Math.max(0.25, Math.round(diffHours * 100) / 100);

      const finalNote = note !== undefined ? note : (shift.note || '');

      db.run(
        `UPDATE shifts SET check_out = ?, hours_worked = ?, note = ?, status = 'COMPLETED' WHERE id = ?`,
        [nowIso, hoursWorked, finalNote, shift_id],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          const shiftPay = Math.round(hoursWorked * (shift.hourly_rate || 25000));
          res.json({
            success: true,
            shift_id,
            staff_name: shift.staff_name,
            check_in: shift.check_in,
            check_out: nowIso,
            hours_worked: hoursWorked,
            shift_pay: shiftPay
          });
        }
      );
    }
  );
});

// Xóa bản ghi chấm công bị nhầm
router.delete('/:id', (req, res) => {
  db.run(
    `DELETE FROM shifts WHERE id = ? AND staff_id IN (SELECT id FROM staff WHERE user_id = ?)`,
    [req.params.id, req.tenantId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, deleted: this.changes });
    }
  );
});

// Bảng tính lương tổng hợp theo tháng (Lương cứng + Lương giờ chấm công + Phụ cấp + Hoa hồng)
router.get('/payroll', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
  const userId = req.tenantId;

  db.all(
    `SELECT id, name, phone, username, role, status,
            COALESCE(base_salary, 0) as base_salary,
            COALESCE(hourly_rate, 25000) as hourly_rate,
            COALESCE(allowance, 0) as allowance
     FROM staff WHERE user_id = ? ORDER BY id ASC`,
    [userId],
    (err, staffRows) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(
        `SELECT s.* FROM shifts s
         JOIN staff st ON s.staff_id = st.id
         WHERE st.user_id = ? AND strftime('%Y-%m', s.check_in) = ?`,
        [userId, month],
        (err2, shiftRows) => {
          if (err2) return res.status(500).json({ error: err2.message });

          db.all(
            `SELECT c.* FROM commissions c
             JOIN staff st ON c.staff_id = st.id
             WHERE st.user_id = ? AND strftime('%Y-%m', c.createdAt) = ?`,
            [userId, month],
            (err3, commRows) => {
              if (err3) return res.status(500).json({ error: err3.message });

              const shiftsByStaff = {};
              (shiftRows || []).forEach((sh) => {
                if (!shiftsByStaff[sh.staff_id]) shiftsByStaff[sh.staff_id] = [];
                shiftsByStaff[sh.staff_id].push(sh);
              });

              const commByStaff = {};
              (commRows || []).forEach((cm) => {
                commByStaff[cm.staff_id] = (commByStaff[cm.staff_id] || 0) + (Number(cm.amount) || 0);
              });

              const payroll = (staffRows || []).map((st) => {
                const myShifts = shiftsByStaff[st.id] || [];
                const completedShifts = myShifts.filter((s) => s.status === 'COMPLETED' || s.check_out);
                const activeShifts = myShifts.filter((s) => s.status === 'ACTIVE' && !s.check_out);
                const totalHours = Math.round(
                  completedShifts.reduce((sum, s) => sum + (Number(s.hours_worked) || 0), 0) * 100
                ) / 100;
                const hourlyPay = Math.round(totalHours * (Number(st.hourly_rate) || 0));
                const commissionPay = Math.round(commByStaff[st.id] || 0);
                const baseSalary = Math.round(Number(st.base_salary) || 0);
                const allowance = Math.round(Number(st.allowance) || 0);
                const totalSalary = baseSalary + hourlyPay + allowance + commissionPay;

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
                  completed_shifts: completedShifts.length,
                  active_shifts: activeShifts.length,
                  total_hours: totalHours,
                  hourly_pay: hourlyPay,
                  commission_pay: commissionPay,
                  total_salary: totalSalary
                };
              });

              res.json({
                month,
                payroll,
                summary: {
                  total_staff: payroll.length,
                  total_hours: Math.round(payroll.reduce((a, b) => a + b.total_hours, 0) * 100) / 100,
                  total_payroll: payroll.reduce((a, b) => a + b.total_salary, 0)
                }
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
