'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner, writeAudit } = require('../middleware/auth');
const { resolvePosBranch } = require('../utils/branchAccess');

const router = express.Router();
router.use(requireAuth);
const err = (status, message) => Object.assign(new Error(message), { status });
const reply = (res, error) => res.status(error.status || 500).json({ error: error.message });
const native = () => db._native;
const isOwner = (req) => req.user.actorType !== 'staff';
const hasHrm = (req) => isOwner(req) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('staff'));

function validMonth(value) {
  const s = String(value || '');
  if (!/^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(s)) throw err(400, 'Tháng phải theo YYYY-MM');
  return s;
}
function validDate(value) {
  const s = String(value || '');
  if (!/^20[2-9][0-9]-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(s)
    || Number.isNaN(Date.parse(s + 'T00:00:00Z'))
    || new Date(s + 'T00:00:00Z').toISOString().slice(0,10) !== s) {
    throw err(400, 'Ngày phép không hợp lệ (YYYY-MM-DD)');
  }
  return s;
}
function assertStaff(tenantId, id) {
  const staffId = Number(id);
  if (!Number.isSafeInteger(staffId) || staffId < 1) throw err(400, 'Nhân viên không hợp lệ');
  const person = native().prepare('SELECT id,name,branch_id FROM staff WHERE user_id=? AND id=?')
    .get(tenantId, staffId);
  if (!person) throw err(404, 'Nhân viên không thuộc doanh nghiệp');
  return person;
}
function assertNoApprovedPayroll(tenantId, staffId, branchId, month) {
  const slip = native().prepare(`
    SELECT id FROM hrm_payroll_slips
    WHERE user_id=? AND staff_id=? AND branch_id=? AND month=?
  `).get(tenantId, staffId, branchId, month);
  if (slip) throw err(409, 'Tháng đã chốt lương: cần quy trình điều chỉnh kỳ sau, không sửa lịch sử');
}
function hrmOnly(req,res,next) {
  if (!hasHrm(req)) return res.status(403).json({ error: 'Không có quyền duyệt nghỉ phép' });
  return next();
}
function staffOnly(req,res,next) {
  if (req.user.actorType !== 'staff') return res.status(403).json({ error: 'Đơn phép cá nhân chỉ dành cho nhân viên' });
  return next();
}

// Employees submit only for themselves. The branch is captured from the live
// staff record, never accepted from request body/JWT.
router.get('/leave/me', staffOnly, (req,res) => {
  try {
    const rows = native().prepare(`
      SELECT id,branch_id,leave_date,minutes,leave_type,status,note,decision_note,decided_at,created_at
      FROM hrm_leave_requests WHERE user_id=? AND staff_id=?
      ORDER BY leave_date DESC,id DESC LIMIT 150
    `).all(req.tenantId, req.user.actorId);
    res.json(rows);
  } catch(e) { reply(res,e); }
});
router.post('/leave/me', staffOnly, (req,res) => {
  try {
    const staffId = Number(req.user.actorId);
    const branchId = resolvePosBranch(req, null);
    const date = validDate(req.body?.leave_date);
    const type = req.body?.leave_type;
    const minutes = Number(req.body?.minutes);
    const note = String(req.body?.note || '').trim();
    if (!['paid','unpaid'].includes(type)) throw err(400, 'Chọn phép hưởng lương hoặc không hưởng lương');
    if (!Number.isSafeInteger(minutes) || minutes < 30 || minutes > 480 || minutes % 30 !== 0) {
      throw err(400, 'Phép phải từ 0,5 đến 8 giờ, bước 30 phút');
    }
    if (!note || note.length > 500) throw err(400, 'Lý do phép bắt buộc, tối đa 500 ký tự');
    const save = native().transaction(() => {
      assertNoApprovedPayroll(req.tenantId, staffId, branchId, date.slice(0,7));
      const duplicate = native().prepare(`
        SELECT id FROM hrm_leave_requests
        WHERE user_id=? AND staff_id=? AND leave_date=? AND status IN ('pending','approved')
      `).get(req.tenantId, staffId, date);
      if (duplicate) throw err(409, 'Ngày này đã có đơn phép đang chờ hoặc đã duyệt');
      return native().prepare(`
        INSERT INTO hrm_leave_requests(user_id,staff_id,branch_id,leave_date,minutes,leave_type,note)
        VALUES(?,?,?,?,?,?,?)
      `).run(req.tenantId, staffId, branchId, date, minutes, type, note);
    })();
    writeAudit(req,{action:'hrm.leave.request',target:String(save.lastInsertRowid),
      detail:{branch_id:branchId,leave_date:date,leave_type:type,minutes}});
    res.status(201).json({ id:Number(save.lastInsertRowid),status:'pending',branch_id:branchId });
  } catch(e) { reply(res,e); }
});

router.get('/leave',hrmOnly,(req,res) => {
  try {
    const month = req.query.month ? validMonth(req.query.month) : null;
    let branchId = null;
    if (!isOwner(req)) branchId = resolvePosBranch(req,req.query.branch_id);
    else if (req.query.branch_id !== undefined && req.query.branch_id !== '') {
      branchId = resolvePosBranch(req,req.query.branch_id);
    }
    const conditions = ['l.user_id=?']; const args=[req.tenantId];
    if(branchId!==null){conditions.push('l.branch_id=?');args.push(branchId);}
    if(month){conditions.push("substr(l.leave_date,1,7)=?");args.push(month);}
    const rows = native().prepare(`
      SELECT l.*, st.name AS staff_name FROM hrm_leave_requests l
      JOIN staff st ON st.id=l.staff_id AND st.user_id=l.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.leave_date DESC,l.id DESC LIMIT 250
    `).all(...args);
    res.json(rows);
  } catch(e){reply(res,e);}
});
router.post('/leave/:id/decision',hrmOnly,(req,res)=>{
  try {
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)throw err(400,'Mã đơn phép không hợp lệ');
    const decision=String(req.body?.decision||'');
    if(!['approved','rejected'].includes(decision))throw err(400,'Quyết định không hợp lệ');
    const note=String(req.body?.note||'').trim();
    if(note.length>500)throw err(400,'Ghi chú quá dài');
    const result=native().transaction(()=>{
      const leave=native().prepare('SELECT * FROM hrm_leave_requests WHERE id=? AND user_id=?')
        .get(id,req.tenantId);
      if(!leave)throw err(404,'Không tìm thấy đơn phép');
      if(!isOwner(req)) {
        const ownBranch=resolvePosBranch(req,null);
        if(Number(leave.branch_id)!==ownBranch)throw err(403,'Không được duyệt phép chi nhánh khác');
        if(Number(req.user.actorId)===Number(leave.staff_id))throw err(403,'Không thể tự duyệt đơn phép của mình');
      }
      if(leave.status!=='pending')throw err(409,'Đơn đã được xử lý, không duyệt lặp');
      assertNoApprovedPayroll(req.tenantId,leave.staff_id,leave.branch_id,leave.leave_date.slice(0,7));
      if(decision==='approved'&&leave.leave_type==='paid'){
        // Paid leave is deliberately conservative: a day with recorded work
        // requires a manual HR correction instead of double-crediting wages.
        const localDayStart=Date.parse(leave.leave_date+'T00:00:00+07:00');
        const from=new Date(localDayStart).toISOString().slice(0,19).replace('T',' ');
        const to=new Date(localDayStart+86400000).toISOString().slice(0,19).replace('T',' ');
        const recorded=native().prepare(`
          SELECT 1 FROM shifts s
          WHERE s.staff_id=? AND s.check_in<? AND
            (s.check_out IS NULL OR s.check_out>?) LIMIT 1
        `).get(leave.staff_id,to,from);
        if(recorded)throw err(409,'Ngày này có giờ chấm công; cần đối soát tránh cộng lương hai lần');
      }
      const changed=native().prepare(`
        UPDATE hrm_leave_requests
        SET status=?,decision_note=?,decided_by=?,decided_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=? AND status='pending'
      `).run(decision,note||null,req.user.actorId,id,req.tenantId);
      if(changed.changes!==1)throw err(409,'Đơn phép đã được xử lý');
      return leave;
    }).immediate();
    writeAudit(req,{action:'hrm.leave.'+decision,target:String(id),
      detail:{branch_id:result.branch_id,staff_id:result.staff_id,leave_date:result.leave_date}});
    res.json({success:true,id,status:decision});
  } catch(e) {
    if(String(e.message).includes('UNIQUE constraint'))return res.status(409).json({error:'Đã có đơn phép được duyệt cùng ngày'});
    reply(res,e);
  }
});

// Adjustments are explicit manual amounts: no auto overtime rates or statutory
// deductions are inferred. They must be entered by the owner before approval.
router.get('/adjustments',requireOwner,(req,res)=>{
  try{
    const month=validMonth(req.query.month);
    const branchId=req.query.branch_id===undefined||req.query.branch_id===''?null:resolvePosBranch(req,req.query.branch_id);
    const rows=native().prepare(`
      SELECT a.*, st.name AS staff_name FROM hrm_payroll_adjustments a
      JOIN staff st ON st.id=a.staff_id AND st.user_id=a.user_id
      WHERE a.user_id=? AND a.month=? ${branchId===null?'':'AND a.branch_id=?'}
      ORDER BY a.id DESC LIMIT 300
    `).all(...(branchId===null?[req.tenantId,month]:[req.tenantId,month,branchId]));
    res.json(rows);
  }catch(e){reply(res,e);}
});
router.post('/adjustments',requireOwner,(req,res)=>{
  try {
    const month=validMonth(req.body?.month);
    const staff=assertStaff(req.tenantId,req.body?.staff_id);
    const branchId=resolvePosBranch(req,req.body?.branch_id);
    const category=String(req.body?.category||'');
    const amount=Number(req.body?.amount);
    const note=String(req.body?.note||'').trim();
    const key=String(req.body?.idempotency_key||'');
    if(!['allowance','overtime','deduction'].includes(category))throw err(400,'Loại điều chỉnh không hợp lệ');
    if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw err(400,'Số tiền điều chỉnh phải là VND nguyên dương');
    if(note.length<4||note.length>240)throw err(400,'Cần ghi lý do điều chỉnh từ 4 đến 240 ký tự');
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw err(400,'Mã chống gửi trùng không hợp lệ');
    const item=native().transaction(()=>{
      assertNoApprovedPayroll(req.tenantId,staff.id,branchId,month);
      return native().prepare(`
        INSERT INTO hrm_payroll_adjustments
        (user_id,staff_id,branch_id,month,category,amount,note,idempotency_key,created_by)
        VALUES(?,?,?,?,?,?,?,?,?)
      `).run(req.tenantId,staff.id,branchId,month,category,amount,note,key,req.user.actorId);
    }).immediate();
    writeAudit(req,{action:'hrm.adjustment.create',target:String(item.lastInsertRowid),
      detail:{staff_id:staff.id,branch_id:branchId,month,category,amount}});
    res.status(201).json({id:Number(item.lastInsertRowid),status:'active',amount,category});
  }catch(e){
    if(String(e.message).includes('UNIQUE constraint'))return res.status(409).json({error:'Khoản điều chỉnh đã được gửi trước đó'});
    reply(res,e);
  }
});
router.post('/adjustments/:id/void',requireOwner,(req,res)=>{
  try {
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)throw err(400,'Mã khoản điều chỉnh không hợp lệ');
    const item=native().transaction(()=>{
      const item=native().prepare('SELECT * FROM hrm_payroll_adjustments WHERE user_id=? AND id=?')
        .get(req.tenantId,id);
      if(!item)throw err(404,'Không tìm thấy điều chỉnh');
      if(item.status!=='active')throw err(409,'Khoản điều chỉnh đã bị hủy');
      assertNoApprovedPayroll(req.tenantId,item.staff_id,item.branch_id,item.month);
      const updated=native().prepare(`
        UPDATE hrm_payroll_adjustments
        SET status='void',voided_at=CURRENT_TIMESTAMP,voided_by=?
        WHERE id=? AND user_id=? AND status='active'
      `).run(req.user.actorId,id,req.tenantId);
      if(updated.changes!==1)throw err(409,'Không thể hủy khoản điều chỉnh đã thay đổi');
      return item;
    }).immediate();
    writeAudit(req,{action:'hrm.adjustment.void',target:String(id),
      detail:{staff_id:item.staff_id,branch_id:item.branch_id,month:item.month,amount:item.amount}});
    res.json({success:true,id,status:'void'});
  }catch(e){reply(res,e);}
});

module.exports=router;
