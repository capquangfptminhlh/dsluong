'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner, writeAudit } = require('../middleware/auth');
const { resolvePosBranch } = require('../utils/branchAccess');

const router = express.Router();
router.use(requireAuth);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });

function monthBounds(input) {
  const value = String(input || '');
  if (!/^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(value)) throw httpError(400, 'Tháng không hợp lệ (YYYY-MM)');
  const [year, month] = value.split('-').map(Number);
  const start = Date.UTC(year, month - 1, 1, -7);
  const end = Date.UTC(year, month, 1, -7);
  return { start, end, month: value };
}
function isoUtc(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function currentVnMonth() {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',
  }).formatToParts(new Date()).map((x)=>[x.type,x.value]));
  return parts.year+'-'+parts.month;
}
function rateForMonth(native,tenantId,staffId,month) {
  return native.prepare(`
    SELECT effective_month,salary_type,hourly_rate,monthly_salary,standard_hours
    FROM hrm_pay_rate_periods
    WHERE user_id=? AND staff_id=? AND effective_month<=?
    ORDER BY effective_month DESC LIMIT 1
  `).get(tenantId,staffId,month);
}
function staffInTenant(tenantId, staffId) {
  if (!Number.isInteger(staffId) || staffId < 1) throw httpError(400, 'Nhân viên không hợp lệ');
  const person = db._native.prepare('SELECT id, name, branch_id FROM staff WHERE id=? AND user_id=?').get(staffId, tenantId);
  if (!person) throw httpError(404, 'Không tìm thấy nhân viên');
  return person;
}
function selectBranch(req, input) {
  return resolvePosBranch(req, input);
}
function hoursInPeriod(tenantId, staffId, branchId, bounds) {
  const shifts = db._native.prepare(`
    SELECT s.id, s.check_in, s.check_out, s.status
    FROM shifts s JOIN staff st ON st.id=s.staff_id
    WHERE st.user_id=? AND s.staff_id=? AND s.branch_id=?
      AND s.check_in<? AND (s.check_out IS NULL OR s.check_out>?)
    ORDER BY s.check_in, s.id
  `).all(tenantId, staffId, branchId, isoUtc(bounds.end), isoUtc(bounds.start));
  let seconds = 0;
  let openShifts = 0;
  let invalidShifts = 0;
  for (const shift of shifts) {
    if (shift.status !== 'CLOSED' || !shift.check_out) { openShifts += 1; continue; }
    const from = Date.parse(String(shift.check_in).replace(' ', 'T') + 'Z');
    const until = Date.parse(String(shift.check_out).replace(' ', 'T') + 'Z');
    if (!Number.isFinite(from) || !Number.isFinite(until) ||
      until <= from || until - from > 24 * 60 * 60 * 1000) {
      invalidShifts += 1; continue;
    }
    const overlap = Math.max(0, Math.min(until, bounds.end) - Math.max(from, bounds.start));
    seconds += Math.floor(overlap / 1000);
  }
  const legacyMissing = db._native.prepare(`
    SELECT COUNT(*) AS count FROM shifts s JOIN staff st ON st.id=s.staff_id
    WHERE st.user_id=? AND s.staff_id=? AND s.branch_id IS NULL AND s.check_in<?
      AND (s.check_out IS NULL OR s.check_out>?)
  `).get(tenantId, staffId, isoUtc(bounds.end), isoUtc(bounds.start));
  return { work_seconds: seconds, open_shifts: openShifts, invalid_shifts: invalidShifts,
    unassigned_shifts: Number(legacyMissing.count) };
}
function payrollExtras(tenantId, staffId, branchId, bounds) {
  const native = db._native;
  const [year, monthNumber] = bounds.month.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0,10);
  const leaves = native.prepare(`
    SELECT leave_date,minutes,leave_type,status FROM hrm_leave_requests
    WHERE user_id=? AND staff_id=? AND branch_id=?
      AND leave_date>=? AND leave_date<?
  `).all(tenantId,staffId,branchId,bounds.month+'-01',nextMonth);
  let paidLeaveMinutes=0, unpaidLeaveMinutes=0, pendingLeaveRequests=0;
  let leaveAttendanceConflicts=0;
  for(const leave of leaves) {
    if(leave.status==='pending') { pendingLeaveRequests++; continue; }
    if(leave.status!=='approved')continue;
    if(leave.leave_type==='unpaid'){unpaidLeaveMinutes+=Number(leave.minutes);continue;}
    paidLeaveMinutes+=Number(leave.minutes);
    const day=Date.parse(leave.leave_date+'T00:00:00+07:00');
    const from=new Date(day).toISOString().slice(0,19).replace('T',' ');
    const to=new Date(day+86400000).toISOString().slice(0,19).replace('T',' ');
    const overlap=native.prepare(`
      SELECT 1 FROM shifts WHERE staff_id=? AND check_in<?
        AND (check_out IS NULL OR check_out>?) LIMIT 1
    `).get(staffId,to,from);
    if(overlap)leaveAttendanceConflicts++;
  }
  const values=native.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN category='allowance' THEN amount ELSE 0 END),0) AS allowance_amount,
      COALESCE(SUM(CASE WHEN category='overtime' THEN amount ELSE 0 END),0) AS overtime_amount,
      COALESCE(SUM(CASE WHEN category='deduction' THEN amount ELSE 0 END),0) AS deduction_amount
    FROM hrm_payroll_adjustments
    WHERE user_id=? AND staff_id=? AND branch_id=? AND month=? AND status='active'
  `).get(tenantId,staffId,branchId,bounds.month);
  return {
    paid_leave_minutes:paidLeaveMinutes,unpaid_leave_minutes:unpaidLeaveMinutes,
    pending_leave_requests:pendingLeaveRequests,leave_attendance_conflicts:leaveAttendanceConflicts,
    allowance_amount:Number(values.allowance_amount),overtime_amount:Number(values.overtime_amount),
    deduction_amount:Number(values.deduction_amount),
  };
}
function calculate(req, month, branchFilter) {
  const bounds = monthBounds(month);
  const native = db._native;
  const staff = native.prepare('SELECT id, name, branch_id FROM staff WHERE user_id=? ORDER BY name, id').all(req.tenantId);
  const candidates = new Map();
  const add = (staffId, branchId) => {
    if (branchId == null) return;
    if (branchFilter != null && Number(branchId) !== branchFilter) return;
    const person = staff.find((x) => x.id === staffId);
    if (person) candidates.set(staffId + ':' + branchId, { person, branch_id: Number(branchId) });
  };
  for (const s of staff) add(s.id, s.branch_id);
  const shiftBranches = native.prepare(`
    SELECT DISTINCT s.staff_id, s.branch_id
    FROM shifts s JOIN staff st ON st.id=s.staff_id
    WHERE st.user_id=? AND s.branch_id IS NOT NULL AND s.check_in<?
      AND (s.check_out IS NULL OR s.check_out>?)
  `).all(req.tenantId, isoUtc(bounds.end), isoUtc(bounds.start));
  for (const s of shiftBranches) add(s.staff_id, s.branch_id);
  // Requests for missing whole shifts still block closing that payroll month.
  // Both proposed and original time windows are considered so changing a shift
  // across a month boundary cannot silently bypass the approval gate.
  const pendingCorrectionBranches=native.prepare(`
    SELECT DISTINCT c.staff_id,c.branch_id
    FROM hrm_attendance_corrections c JOIN staff st
      ON st.id=c.staff_id AND st.user_id=c.user_id
    WHERE c.user_id=? AND c.status='pending'
      AND ((c.proposed_check_in<? AND c.proposed_check_out>?)
        OR (c.original_check_in<? AND
          COALESCE(c.original_check_out,c.proposed_check_out)>?))
  `).all(req.tenantId,isoUtc(bounds.end),isoUtc(bounds.start),
    isoUtc(bounds.end),isoUtc(bounds.start));
  for(const c of pendingCorrectionBranches)add(c.staff_id,c.branch_id);
  const slips = native.prepare(
    'SELECT * FROM hrm_payroll_slips WHERE user_id=? AND month=?',
  ).all(req.tenantId, bounds.month);
  const recorded = native.prepare(`
    SELECT COALESCE(rel.target_slip_id,p.slip_id) AS slip_id,
      COALESCE(SUM(p.amount),0) AS paid
    FROM hrm_payroll_payments p
    LEFT JOIN hrm_payroll_payment_reallocations rel
      ON rel.payment_id=p.id AND rel.user_id=p.user_id
    JOIN hrm_payroll_slips s
      ON s.id=COALESCE(rel.target_slip_id,p.slip_id) AND s.user_id=p.user_id
    WHERE p.user_id=? AND s.month=?
    GROUP BY COALESCE(rel.target_slip_id,p.slip_id)
  `).all(req.tenantId, bounds.month);
  const paidBySlip = new Map(recorded.map((row) => [Number(row.slip_id),Number(row.paid)]));
  for (const slip of slips) add(slip.staff_id, slip.branch_id);
  const rows = [...candidates.values()].map(({ person, branch_id }) => {
    const rate = rateForMonth(native,req.tenantId,person.id,bounds.month);
    const time = hoursInPeriod(req.tenantId, person.id, branch_id, bounds);
    const salaryType = rate?.salary_type === 'monthly' ? 'monthly' : 'hourly';
    const hourlyRate = Number(rate?.hourly_rate || 0);
    const monthlySalary = Number(rate?.monthly_salary || 0);
    const standardHours = Number(rate?.standard_hours || 208);
    const standardSeconds = standardHours * 3600;
    const extras = payrollExtras(req.tenantId,person.id,branch_id,bounds);
    const attendanceCorrectionsPending=Number(native.prepare(`
      SELECT COUNT(*) AS n FROM hrm_attendance_corrections
      WHERE user_id=? AND staff_id=? AND branch_id=? AND status='pending'
        AND ((proposed_check_in<? AND proposed_check_out>?)
          OR (original_check_in<? AND COALESCE(original_check_out,proposed_check_out)>?))
    `).get(req.tenantId,person.id,branch_id,
      isoUtc(bounds.end),isoUtc(bounds.start),isoUtc(bounds.end),isoUtc(bounds.start)).n);
    const creditedSeconds = time.work_seconds + extras.paid_leave_minutes * 60;
    const baseSalary = salaryType === 'monthly'
      ? Math.round(monthlySalary * Math.min(creditedSeconds, standardSeconds) / standardSeconds)
      : Math.round(creditedSeconds * hourlyRate / 3600);
    const draftGross = baseSalary + extras.allowance_amount + extras.overtime_amount;
    const draftPayable = Math.max(0,draftGross-extras.deduction_amount);
    const approved = slips.find((x) => x.staff_id === person.id && x.branch_id === branch_id);
    const snapshot = (col,fallback) => approved && approved[col]!==null &&
      approved[col]!==undefined ? Number(approved[col]) : fallback;
    const approvedDue = approved ? snapshot('payable_estimate',Number(approved.gross_salary)) : null;
    const paidAmount = approved ? (paidBySlip.get(Number(approved.id)) || 0) : 0;
    const remainingAmount = approved ? Math.max(0, approvedDue-paidAmount) : null;
    const paymentStatus = approved
      ? remainingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'
      : 'not_approved';
    const unresolvedCorrections=approved ? Number(native.prepare(`
      SELECT COUNT(*) AS n
      FROM hrm_payroll_payment_correction_requests c
      JOIN hrm_payroll_payments p
        ON p.id=c.payment_id AND p.user_id=c.user_id
      LEFT JOIN hrm_payroll_payment_reallocations rel
        ON rel.payment_id=p.id AND rel.user_id=p.user_id
      WHERE c.user_id=? AND c.status='open'
        AND COALESCE(rel.target_slip_id,p.slip_id)=?
    `).get(req.tenantId,approved.id).n) : 0;
    return {
      staff_id: person.id, staff_name: person.name, branch_id, month: bounds.month,
      rate_effective_month: approved ? (approved.rate_effective_month || null) : (rate?.effective_month || null),
      salary_type: approved ? approved.salary_type : salaryType,
      hourly_rate: approved ? Number(approved.hourly_rate) : hourlyRate,
      monthly_salary: approved ? Number(approved.monthly_salary) : monthlySalary,
      standard_hours: approved ? Number(approved.standard_hours) : standardHours,
      overtime_seconds: salaryType === 'monthly' ? Math.max(0, time.work_seconds - standardSeconds) : 0,
      work_seconds: approved ? Number(approved.work_seconds) : time.work_seconds,
      paid_leave_minutes: snapshot('paid_leave_minutes',extras.paid_leave_minutes),
      unpaid_leave_minutes: extras.unpaid_leave_minutes,
      pending_leave_requests: extras.pending_leave_requests,
      pending_attendance_corrections: attendanceCorrectionsPending,
      leave_attendance_conflicts: extras.leave_attendance_conflicts,
      base_salary: snapshot('base_salary', approved ? Number(approved.gross_salary) : baseSalary),
      allowance_amount: snapshot('allowance_amount',extras.allowance_amount),
      overtime_amount: snapshot('overtime_amount',extras.overtime_amount),
      deduction_amount: snapshot('deduction_amount',extras.deduction_amount),
      gross_salary: approved ? Number(approved.gross_salary) : draftGross,
      payable_estimate: snapshot('payable_estimate',approved ? Number(approved.gross_salary) : draftPayable),
      excess_deductions: !approved && extras.deduction_amount > draftGross,
      status: approved ? 'approved' : 'draft',
      slip_id: approved?.id || null,
      payment_status: paymentStatus,
      payment_corrections_open: unresolvedCorrections,
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      approved_at: approved?.approved_at || null,
      open_shifts: time.open_shifts, invalid_shifts: time.invalid_shifts,
      unassigned_shifts: time.unassigned_shifts,
      // Approved snapshots stay immutable even if later rate/attendance changes.
      has_changed_since_approval: Boolean(approved && (time.work_seconds !== Number(approved.work_seconds))),
    };
  });
  return rows;
}
router.get('/pay-rates', requireOwner, (req, res) => {
  try {
    const month=req.query.month ? monthBounds(req.query.month).month : currentVnMonth();
    const rows=db._native.prepare(`
      SELECT st.id AS staff_id,st.name AS staff_name,st.branch_id,
        COALESCE(r.hourly_rate,0) AS hourly_rate,
        COALESCE(r.salary_type,'hourly') AS salary_type,
        COALESCE(r.monthly_salary,0) AS monthly_salary,
        COALESCE(r.standard_hours,208) AS standard_hours,
        r.effective_month AS rate_effective_month
      FROM staff st
      LEFT JOIN hrm_pay_rate_periods r ON r.user_id=st.user_id
        AND r.staff_id=st.id AND r.effective_month=(
          SELECT MAX(h.effective_month) FROM hrm_pay_rate_periods h
          WHERE h.user_id=st.user_id AND h.staff_id=st.id AND h.effective_month<=?
        )
      WHERE st.user_id=? ORDER BY st.name,st.id
    `).all(month,req.tenantId);
    return res.json(rows);
  }catch(e){return fail(res,e);}
});
router.get('/pay-rates/:staffId/history', requireOwner, (req,res)=>{
  try{
    const id=Number(req.params.staffId);
    staffInTenant(req.tenantId,id);
    const rows=db._native.prepare(`
      SELECT effective_month,salary_type,hourly_rate,monthly_salary,standard_hours,
        updated_at,updated_by
      FROM hrm_pay_rate_periods WHERE user_id=? AND staff_id=?
      ORDER BY effective_month DESC
    `).all(req.tenantId,id);
    return res.json({staff_id:id,rows,policy:
      'Các kỳ lương đã chốt giữ nguyên ảnh chụp. Lịch sử trước khi nâng cấp chỉ có mức lương nền đã lưu tại thời điểm chuyển đổi.'});
  }catch(e){return fail(res,e);}
});
router.put('/pay-rates/:staffId', requireOwner, (req, res) => {
  try {
    const id = Number(req.params.staffId);
    staffInTenant(req.tenantId, id);
    const native=db._native;
    const updated=native.transaction(()=>{
      const existing=Number(native.prepare(`
        SELECT COUNT(*) AS n FROM hrm_pay_rate_periods WHERE user_id=? AND staff_id=?
      `).get(req.tenantId,id).n);
      // First configuration retains the old ability to settle prior months.
      // Subsequent legacy clients default to the current Vietnam month only.
      const effectMonth=monthBounds(
        req.body?.effective_month || (existing===0?'2020-01':currentVnMonth())
      ).month;
      const prior=rateForMonth(native,req.tenantId,id,effectMonth);
      const salaryType=String(req.body?.salary_type ?? prior?.salary_type ?? 'hourly');
      const hourlyRate=Number(req.body?.hourly_rate ?? prior?.hourly_rate ?? 0);
      const monthlySalary=Number(req.body?.monthly_salary ?? prior?.monthly_salary ?? 0);
      const standardHours=Number(req.body?.standard_hours ?? prior?.standard_hours ?? 208);
      if(!['hourly','monthly'].includes(salaryType))throw httpError(400,'Hình thức lương không hợp lệ');
      if(!Number.isSafeInteger(hourlyRate)||hourlyRate<0||hourlyRate>10000000)
        throw httpError(400,'Đơn giá lương giờ không hợp lệ');
      if(!Number.isSafeInteger(monthlySalary)||monthlySalary<0||monthlySalary>1000000000)
        throw httpError(400,'Lương tháng không hợp lệ');
      if(!Number.isInteger(standardHours)||standardHours<1||standardHours>300)
        throw httpError(400,'Giờ công chuẩn tháng phải từ 1 đến 300');
      const locked=native.prepare(`
        SELECT id FROM hrm_payroll_slips WHERE user_id=? AND staff_id=? AND month=?
        LIMIT 1
      `).get(req.tenantId,id,effectMonth);
      if(locked)throw httpError(409,'Kỳ lương đã chốt; không thể đổi hợp đồng có hiệu lực tại tháng này');
      native.prepare(`
        INSERT INTO hrm_pay_rate_periods
          (user_id,staff_id,effective_month,salary_type,hourly_rate,
           monthly_salary,standard_hours,updated_by)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id,staff_id,effective_month) DO UPDATE SET
          salary_type=excluded.salary_type,hourly_rate=excluded.hourly_rate,
          monthly_salary=excluded.monthly_salary,standard_hours=excluded.standard_hours,
          updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
      `).run(req.tenantId,id,effectMonth,salaryType,hourlyRate,
        monthlySalary,standardHours,req.user.actorId);
      // Keep the legacy compatibility cache for any older read-only routes.
      const applicable=rateForMonth(native,req.tenantId,id,currentVnMonth());
      if(applicable)native.prepare(`
        INSERT INTO hrm_pay_rates
          (user_id,staff_id,hourly_rate,salary_type,monthly_salary,standard_hours)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(user_id,staff_id) DO UPDATE SET
          hourly_rate=excluded.hourly_rate,salary_type=excluded.salary_type,
          monthly_salary=excluded.monthly_salary,standard_hours=excluded.standard_hours,
          updated_at=CURRENT_TIMESTAMP
      `).run(req.tenantId,id,applicable.hourly_rate,applicable.salary_type,
        applicable.monthly_salary,applicable.standard_hours);
      return {staff_id:id,effective_month:effectMonth,salary_type:salaryType,
        hourly_rate:hourlyRate,monthly_salary:monthlySalary,standard_hours:standardHours};
    }).immediate();
    writeAudit(req,{action:'hrm.rate.period.update',target:String(id),detail:updated});
    return res.json({success:true,...updated});
  }catch(e){return fail(res,e);}
});
router.get('/payroll', requireOwner, (req, res) => {
  try {
    const month = monthBounds(req.query.month).month;
    const branchId = req.query.branch_id === undefined || req.query.branch_id === ''
      ? null : selectBranch(req, req.query.branch_id);
    const rows = calculate(req, month, branchId);
    return res.json({
      month, branch_id: branchId, rows,
      estimated_gross: rows.reduce((sum, x) => sum + x.gross_salary, 0),
      estimated_payable_before_statutory: rows.reduce((sum, x) => sum + x.payable_estimate, 0),
      recorded_payments: rows.reduce((sum, x) => sum + x.paid_amount, 0),
      outstanding_approved: rows.reduce((sum, x) => sum + (x.remaining_amount || 0), 0),
      policy: 'Lương giờ hoặc lương tháng quy đổi theo công; phép hưởng lương phải được duyệt và không trùng ca. Thưởng/phụ cấp, tăng ca và khấu trừ theo số tiền chủ nhập; đây chưa phải lương ròng đã trừ BHXH/TNCN. Không tự thanh toán.',
    });
  } catch (e) { return fail(res, e); }
});
router.post('/payroll/approve', requireOwner, (req, res) => {
  try {
    const bounds = monthBounds(req.body?.month);
    // Never approve incomplete current/future months.
    const vnParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const currentVnMonth = vnParts.year + '-' + vnParts.month;
    if (bounds.month >= currentVnMonth) throw httpError(409, 'Chỉ được duyệt tháng đã kết thúc');
    const branchId = selectBranch(req, req.body?.branch_id);
    const staffId = Number(req.body?.staff_id);
    const employee = staffInTenant(req.tenantId, staffId);
    const row = calculate(req, bounds.month, branchId)
      .find((item) => item.staff_id === employee.id && item.branch_id === branchId);
    if (!row) throw httpError(404, 'Không có dữ liệu lương của nhân viên tại chi nhánh này');
    if (row.status === 'approved') throw httpError(409, 'Bảng lương đã được duyệt, không thể duyệt lặp');
    if ((row.salary_type === 'hourly' && row.hourly_rate <= 0) ||
        (row.salary_type === 'monthly' && row.monthly_salary <= 0)) {
      throw httpError(409, 'Chưa thiết lập mức lương hợp lệ');
    }
    if (row.open_shifts || row.invalid_shifts || row.unassigned_shifts ||
        row.pending_leave_requests || row.pending_attendance_corrections ||
        row.leave_attendance_conflicts) {
      throw httpError(409, 'Còn ca/đơn phép hoặc yêu cầu sửa công đang chờ đối soát; không thể chốt lương');
    }
    if (row.excess_deductions) throw httpError(409, 'Khoản khấu trừ vượt tổng lương; cần đối soát');
    if (row.work_seconds + row.paid_leave_minutes*60 === 0) {
      throw httpError(409, 'Không có công hoặc phép hưởng lương hợp lệ để duyệt');
    }
    const result = db._native.prepare(`
      INSERT INTO hrm_payroll_slips
      (user_id,staff_id,branch_id,month,work_seconds,hourly_rate,gross_salary,approved_by,
       salary_type,monthly_salary,standard_hours,base_salary,paid_leave_minutes,
       allowance_amount,overtime_amount,deduction_amount,payable_estimate,rate_effective_month)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(req.tenantId, staffId, branchId, bounds.month, row.work_seconds,
      row.hourly_rate, row.gross_salary, req.user.actorId,
      row.salary_type, row.monthly_salary, row.standard_hours, row.base_salary,
      row.paid_leave_minutes,row.allowance_amount,row.overtime_amount,
      row.deduction_amount,row.payable_estimate,row.rate_effective_month);
    writeAudit(req, { action: 'hrm.payroll.approve', target: String(result.lastInsertRowid),
      detail: { month: bounds.month, staff_id: staffId, branch_id: branchId,
        work_seconds: row.work_seconds, hourly_rate: row.hourly_rate,
        salary_type: row.salary_type, monthly_salary: row.monthly_salary,
        standard_hours: row.standard_hours, gross_salary: row.gross_salary,
        paid_leave_minutes:row.paid_leave_minutes,allowance_amount:row.allowance_amount,
        overtime_amount:row.overtime_amount,deduction_amount:row.deduction_amount,
        payable_estimate:row.payable_estimate,rate_effective_month:row.rate_effective_month } });
    return res.status(201).json({ success: true, id: Number(result.lastInsertRowid),
      staff_id: staffId, branch_id: branchId, month: bounds.month,
      gross_salary: row.gross_salary, payable_estimate:row.payable_estimate,
      status: 'approved', payment_status: 'unpaid' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Bảng lương đã được duyệt' });
    }
    return fail(res, e);
  }
});

module.exports = router;
