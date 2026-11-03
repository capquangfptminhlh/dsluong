'use strict';
const express=require('express');
const db=require('../db');
const {requireAuth,writeAudit}=require('../middleware/auth');
const {resolvePosBranch}=require('../utils/branchAccess');
const router=express.Router();
router.use(requireAuth);
const native=()=>db._native;
const error=(status,message)=>Object.assign(new Error(message),{status});
const fail=(res,e)=>res.status(e.status||500).json({error:e.message});
const isOwner=req=>req.user.actorType==='owner';
const isManager=req=>isOwner(req)||
  (req.user.actorType==='staff'&&Array.isArray(req.user.permissions)&&req.user.permissions.includes('staff'));
const positive=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const sqliteUtc=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
const localDay=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
function parseLocal(v){
  const raw=String(v||'');
  if(!/^20[2-9][0-9]-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]$/.test(raw)) {
    throw error(400,'Giờ yêu cầu phải theo YYYY-MM-DDTHH:mm (giờ Việt Nam)');
  }
  const timestamp=Date.parse(raw+':00+07:00');
  if(!Number.isFinite(timestamp)||new Date(timestamp+7*3600000).toISOString().slice(0,16)!==raw){
    throw error(400,'Ngày hoặc giờ không tồn tại');
  }
  return timestamp;
}
function validateRange(start,end){
  if(end<=start||end-start<5*60000||end-start>24*3600000)
    throw error(400,'Ca làm việc từ 5 phút đến tối đa 24 giờ, giờ ra phải sau giờ vào');
  if(end>Date.now()+60000)throw error(409,'Không được xác nhận giờ làm trong tương lai');
  if(start<Date.now()-90*86400000)throw error(409,'Chỉ hỗ trợ xin sửa công trong vòng 90 ngày');
}
function bounds(start,end){
  // Monthly approvals use UTC+7 month boundaries; both touched local months
  // must remain open to prevent an overnight shift changing approved wages.
  const months=[localDay(start).slice(0,7),localDay(end-1).slice(0,7)];
  return [...new Set(months)];
}
function assertUnlocked(tenant,staff,branch,start,end){
  for(const month of bounds(start,end)){
    const approved=native().prepare(`
      SELECT 1 FROM hrm_payroll_slips
      WHERE user_id=? AND staff_id=? AND branch_id=? AND month=?
    `).get(tenant,staff,branch,month);
    if(approved)throw error(409,'Kỳ lương '+month+' đã chốt; không thể sửa công');
  }
}
function fetchShift(tenant,staff,id) {
  return native().prepare(`
    SELECT s.id,s.staff_id,s.branch_id,s.check_in,s.check_out,s.status
    FROM shifts s JOIN staff st ON st.id=s.staff_id AND st.user_id=?
    WHERE s.id=? AND s.staff_id=?
  `).get(tenant,id,staff);
}
function assertNoOverlap(staff,start,end,except){
  const overlapping=native().prepare(`
    SELECT id FROM shifts WHERE staff_id=? AND id!=? AND check_in<?
      AND (check_out IS NULL OR check_out>?) LIMIT 1
  `).get(staff,except||-1,sqliteUtc(end),sqliteUtc(start));
  if(overlapping)throw error(409,'Khoảng giờ trùng ca làm việc hiện có; cần đối soát trước');
}
function assertNoPaidLeave(tenant,staff,start,end){
  const from=localDay(start),to=localDay(end-1);
  const leave=native().prepare(`
    SELECT id FROM hrm_leave_requests
    WHERE user_id=? AND staff_id=? AND leave_type='paid' AND status='approved'
      AND leave_date>=? AND leave_date<=? LIMIT 1
  `).get(tenant,staff,from,to);
  if(leave)throw error(409,'Ngày có phép hưởng lương đã duyệt; không thể cộng công trùng');
}
function assertReviewer(req,branch,staff){
  if(!isManager(req))throw error(403,'Không có quyền duyệt điều chỉnh công');
  if(!isOwner(req)){
    if(Number(req.user.actorId)===Number(staff))throw error(403,'Không được tự duyệt công của mình');
    if(resolvePosBranch(req,null)!==Number(branch))
      throw error(403,'Không được duyệt công của chi nhánh khác');
  }
}
function assertOriginalStillSame(record,shift){
  if(!shift)throw error(409,'Ca làm việc đã bị xóa hoặc không còn thuộc nhân viên');
  if(String(shift.check_in)!==String(record.original_check_in)||
     (shift.check_out||null)!==(record.original_check_out||null)||
     shift.status!==record.original_status||
     Number(shift.branch_id)!==Number(record.branch_id)){
    throw error(409,'Ca đã thay đổi sau khi gửi đơn; cần gửi đơn điều chỉnh mới');
  }
}
router.get('/attendance-corrections/me',(req,res)=>{
  try{
    if(req.user.actorType!=='staff')throw error(403,'Chỉ nhân viên xem đơn sửa công cá nhân');
    const rows=native().prepare(`
      SELECT id,branch_id,shift_id,correction_type,proposed_check_in,proposed_check_out,
        original_check_in,original_check_out,reason,status,requested_at,review_note,reviewed_at,applied_shift_id
      FROM hrm_attendance_corrections WHERE user_id=? AND staff_id=?
      ORDER BY id DESC LIMIT 150
    `).all(req.tenantId,req.user.actorId);
    return res.json(rows);
  }catch(e){return fail(res,e);}
});
router.post('/attendance-corrections/me',(req,res)=>{
  try{
    if(req.user.actorType!=='staff')throw error(403,'Chỉ nhân viên được tự gửi đơn điều chỉnh công');
    const staffId=Number(req.user.actorId);
    const kind=String(req.body?.correction_type||'');
    if(!['new_shift','missing_checkout','adjust_shift'].includes(kind))
      throw error(400,'Loại điều chỉnh công không hợp lệ');
    const reason=String(req.body?.reason||'').trim();
    if(reason.length<10||reason.length>500)
      throw error(400,'Lý do cần từ 10 đến 500 ký tự');
    const start=parseLocal(req.body?.proposed_check_in);
    const end=parseLocal(req.body?.proposed_check_out);
    validateRange(start,end);
    const result=native().transaction(()=>{
      let shift=null,branchId;
      if(kind==='new_shift'){
        branchId=resolvePosBranch(req,null);
      }else{
        const id=Number(req.body?.shift_id);
        if(!positive(id))throw error(400,'Phải chọn ca làm việc cần chỉnh sửa');
        shift=fetchShift(req.tenantId,staffId,id);
        if(!shift)throw error(404,'Không tìm thấy ca chấm công của nhân viên');
        if(shift.branch_id==null)throw error(409,'Ca cũ chưa có chi nhánh; cần chủ đối soát riêng');
        branchId=Number(shift.branch_id);
        if(kind==='missing_checkout'&&shift.status!=='ACTIVE')
          throw error(409,'Ca đã chấm ra; chọn sửa giờ ca nếu thông tin không chính xác');
        if(kind==='adjust_shift'&&(shift.status!=='CLOSED'||!shift.check_out))
          throw error(409,'Ca đang mở; hãy chọn quên chấm ra');
        if(kind==='missing_checkout'&&sqliteUtc(start)!==shift.check_in)
          throw error(409,'Giờ vào phải giữ đúng theo ca gốc khi xin quên chấm ra');
        if(kind==='adjust_shift'&&shift.check_out===sqliteUtc(end)&&shift.check_in===sqliteUtc(start))
          throw error(409,'Giờ đề nghị không thay đổi so với ca gốc');
      }
      assertUnlocked(req.tenantId,staffId,branchId,start,end);
      if(shift){
        const originalStart=Date.parse(shift.check_in.replace(' ','T')+'Z');
        const originalEnd=shift.check_out?Date.parse(shift.check_out.replace(' ','T')+'Z'):start;
        if(Number.isFinite(originalStart)&&Number.isFinite(originalEnd)&&originalEnd>originalStart)
          assertUnlocked(req.tenantId,staffId,branchId,originalStart,originalEnd);
      }
      // A request may remain pending while other shifts are being reviewed;
      // overlapping time/leave is rechecked atomically before approval.
      const saved=native().prepare(`
        INSERT INTO hrm_attendance_corrections
          (user_id,staff_id,branch_id,shift_id,correction_type,
           proposed_check_in,proposed_check_out,original_check_in,original_check_out,
           original_status,reason)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
      `).run(req.tenantId,staffId,branchId,shift?.id||null,kind,
        sqliteUtc(start),sqliteUtc(end),shift?.check_in||null,shift?.check_out||null,
        shift?.status||null,reason);
      return {id:Number(saved.lastInsertRowid),branch_id:branchId};
    }).immediate();
    writeAudit(req,{action:'hrm.attendance.correction.request',target:String(result.id),
      detail:{staff_id:staffId,branch_id:result.branch_id,kind,
        proposed_check_in:sqliteUtc(start),proposed_check_out:sqliteUtc(end)}});
    return res.status(201).json({success:true,status:'pending',...result});
  }catch(e){
    if(String(e.message).includes('UNIQUE constraint'))
      return res.status(409).json({error:'Ca hoặc khoảng giờ đã có yêu cầu sửa công đang chờ duyệt'});
    return fail(res,e);
  }
});
router.get('/attendance-corrections',(req,res)=>{
  try{
    if(!isManager(req))throw error(403,'Không có quyền xem yêu cầu điều chỉnh công');
    const scoped=!isOwner(req),branchId=scoped?resolvePosBranch(req,null):null;
    let requestedBranch=null;
    if(!scoped&&req.query.branch_id!==undefined&&req.query.branch_id!=='')
      requestedBranch=resolvePosBranch(req,req.query.branch_id);
    const effective=branchId||requestedBranch;
    const month=req.query.month?String(req.query.month):null;
    if(month&&!/^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(month))
      throw error(400,'Tháng không hợp lệ');
    const sql=`
      SELECT c.*,st.name AS staff_name
      FROM hrm_attendance_corrections c
      JOIN staff st ON st.id=c.staff_id AND st.user_id=c.user_id
      WHERE c.user_id=? ${effective?'AND c.branch_id=?':''}
        ${month?"AND substr(datetime(c.proposed_check_in,'+7 hours'),1,7)=?":''}
      ORDER BY (c.status='pending') DESC,c.id DESC LIMIT 250
    `;
    const args=[req.tenantId,...(effective?[effective]:[]),...(month?[month]:[])];
    return res.json(native().prepare(sql).all(...args));
  }catch(e){return fail(res,e);}
});
router.post('/attendance-corrections/:id/decision',(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!positive(id))throw error(400,'Mã đơn điều chỉnh công không hợp lệ');
    const decision=String(req.body?.decision||'');
    if(!['approved','rejected'].includes(decision))
      throw error(400,'Quyết định duyệt không hợp lệ');
    const note=String(req.body?.note||'').trim();
    if(note.length>500)throw error(400,'Ghi chú tối đa 500 ký tự');
    if(decision==='rejected'&&note.length<5)
      throw error(400,'Từ chối cần ghi rõ lý do ít nhất 5 ký tự');
    const result=native().transaction(()=>{
      const correction=native().prepare(`
        SELECT * FROM hrm_attendance_corrections WHERE id=? AND user_id=?
      `).get(id,req.tenantId);
      if(!correction)throw error(404,'Không tìm thấy đơn trong doanh nghiệp');
      assertReviewer(req,correction.branch_id,correction.staff_id);
      if(correction.status!=='pending')throw error(409,'Đơn đã xử lý, không duyệt lại');
      let appliedShift=null;
      if(decision==='approved'){
        const start=Date.parse(correction.proposed_check_in.replace(' ','T')+'Z');
        const end=Date.parse(correction.proposed_check_out.replace(' ','T')+'Z');
        validateRange(start,end);
        assertUnlocked(req.tenantId,correction.staff_id,correction.branch_id,start,end);
        if(correction.shift_id){
          const shift=fetchShift(req.tenantId,correction.staff_id,correction.shift_id);
          assertOriginalStillSame(correction,shift);
          const origStart=Date.parse(shift.check_in.replace(' ','T')+'Z');
          const origEnd=shift.check_out?Date.parse(shift.check_out.replace(' ','T')+'Z'):origStart+60000;
          assertUnlocked(req.tenantId,correction.staff_id,correction.branch_id,
            origStart,origEnd);
        }
        assertNoOverlap(correction.staff_id,start,end,correction.shift_id);
        assertNoPaidLeave(req.tenantId,correction.staff_id,start,end);
        if(correction.correction_type==='new_shift'){
          const shift=native().prepare(`
            INSERT INTO shifts(staff_id,branch_id,check_in,check_out,status)
            VALUES(?,?,?,?,'CLOSED')
          `).run(correction.staff_id,correction.branch_id,
            correction.proposed_check_in,correction.proposed_check_out);
          appliedShift=Number(shift.lastInsertRowid);
        }else{
          const upd=native().prepare(`
            UPDATE shifts SET check_in=?,check_out=?,status='CLOSED'
            WHERE id=? AND staff_id=?
          `).run(correction.proposed_check_in,correction.proposed_check_out,
            correction.shift_id,correction.staff_id);
          if(upd.changes!==1)throw error(409,'Không thể sửa ca do dữ liệu thay đổi');
          appliedShift=correction.shift_id;
        }
      }
      const saved=native().prepare(`
        UPDATE hrm_attendance_corrections
        SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,
          review_note=?,applied_shift_id=?
        WHERE id=? AND user_id=? AND status='pending'
      `).run(decision,req.user.actorId,note||null,appliedShift,id,req.tenantId);
      if(saved.changes!==1)throw error(409,'Đơn đã được xử lý');
      return {id,status:decision,staff_id:correction.staff_id,
        branch_id:correction.branch_id,applied_shift_id:appliedShift,
        from:correction.original_check_in,to:correction.original_check_out,
        proposed_check_in:correction.proposed_check_in,
        proposed_check_out:correction.proposed_check_out};
    }).immediate();
    writeAudit(req,{action:'hrm.attendance.correction.decision',target:String(id),
      detail:{...result,decision,review_note:note}});
    return res.json({success:true,...result});
  }catch(e){return fail(res,e);}
});
module.exports=router;
