'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner, writeAudit } = require('../middleware/auth');
const { resolvePosBranch } = require('../utils/branchAccess');

const router = express.Router();
router.use(requireAuth);

const fault = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });
const monthIsValid = (s) => /^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(String(s || ''));
const validPaymentKey = (v) => /^[A-Za-z0-9_-]{16,128}$/.test(String(v || ''));
const positiveInteger = (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0;

function paidForSlip(native, tenantId, slipId) {
  const value=native.prepare(`
    SELECT COALESCE(SUM(p.amount),0) AS paid
    FROM hrm_payroll_payments p
    LEFT JOIN hrm_payroll_payment_reallocations rel
      ON rel.user_id=p.user_id AND rel.payment_id=p.id
    WHERE p.user_id=? AND COALESCE(rel.target_slip_id,p.slip_id)=?
  `).get(tenantId,slipId);
  return Number(value.paid);
}
function assertNoOpenCorrection(native, tenantId, slipId) {
  const open=native.prepare(`
    SELECT c.id FROM hrm_payroll_payment_correction_requests c
    JOIN hrm_payroll_payments p ON p.id=c.payment_id AND p.user_id=c.user_id
    LEFT JOIN hrm_payroll_payment_reallocations rel
      ON rel.user_id=p.user_id AND rel.payment_id=p.id
    WHERE c.user_id=? AND c.status='open'
      AND COALESCE(rel.target_slip_id,p.slip_id)=? LIMIT 1
  `).get(tenantId,slipId);
  if(open)throw fault(409,'Phiếu lương có chứng từ đang chờ đối soát; chưa được ghi nhận chi tiếp');
}

router.get('/payroll/payments', requireOwner, (req, res) => {
  try {
    const month = String(req.query.month || '');
    if (!monthIsValid(month)) throw fault(400, 'Tháng phải là YYYY-MM');
    const branchId = req.query.branch_id === undefined || req.query.branch_id === ''
      ? null : resolvePosBranch(req, req.query.branch_id);
    const rows = db._native.prepare(`
      SELECT p.id, p.slip_id AS original_slip_id,
        COALESCE(rel.target_slip_id,p.slip_id) AS slip_id,
        s.staff_id, st.name AS staff_name, p.branch_id,
        p.amount, p.payment_method, p.payment_reference, p.note, p.cash_flow_id,
        p.recorded_at, p.origin, s.month, s.payable_estimate,
        rel.id AS reallocation_id,
        EXISTS(SELECT 1 FROM hrm_payroll_payment_correction_requests c
          WHERE c.user_id=p.user_id AND c.payment_id=p.id AND c.status='open') AS correction_open
      FROM hrm_payroll_payments p
      LEFT JOIN hrm_payroll_payment_reallocations rel
        ON rel.payment_id=p.id AND rel.user_id=p.user_id
      JOIN hrm_payroll_slips s
        ON s.id=COALESCE(rel.target_slip_id,p.slip_id) AND s.user_id=p.user_id
      JOIN staff st ON st.id=s.staff_id AND st.user_id=p.user_id
      WHERE p.user_id=? AND s.month=? ${branchId===null?'':'AND p.branch_id=?'}
      ORDER BY p.id DESC LIMIT 500
    `).all(...(branchId===null?[req.tenantId, month]:[req.tenantId, month, branchId]));
    res.json(rows);
  } catch(e) { fail(res,e); }
});

/**
 * Record an ALREADY COMPLETED manual salary payment. This action does not
 * initiate a bank transfer. Payroll, cash_flows, and payment_evidence commit
 * together and are tenant-scoped. No overpayment or same-ref double recording.
 */
router.post('/payroll/payments', requireOwner, (req, res) => {
  try {
    if (req.body?.confirmation !== 'CONFIRM_ALREADY_PAID') {
      throw fault(400, 'Phải xác nhận tiền đã thực sự được trả trước khi ghi sổ');
    }
    const slipId = Number(req.body?.slip_id);
    const amount = Number(req.body?.amount);
    const method = String(req.body?.payment_method || '');
    const reference = String(req.body?.payment_reference || '').trim();
    const note = String(req.body?.note || '').trim();
    const key = String(req.body?.idempotency_key || '').trim();
    if (!Number.isSafeInteger(slipId) || slipId <= 0) throw fault(400, 'Phiếu lương không hợp lệ');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) {
      throw fault(400, 'Số tiền phải là VND nguyên dương từ 1 đến 1 tỷ');
    }
    if (!['bank','cash'].includes(method)) throw fault(400, 'Chỉ hỗ trợ tiền mặt hoặc chuyển khoản đã thực hiện');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{5,119}$/.test(reference)) {
      throw fault(400, 'Mã chứng từ phải dài 6–120 ký tự (chữ, số, dấu ._:/-)');
    }
    if (note.length > 250) throw fault(400, 'Ghi chú không được dài quá 250 ký tự');
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw fault(400, 'Mã chống ghi trùng không hợp lệ');

    const payout = db._native.transaction(() => {
      const slip = db._native.prepare(`
        SELECT id, user_id, staff_id, branch_id, month, payable_estimate, gross_salary
        FROM hrm_payroll_slips WHERE id=? AND user_id=? AND status='approved'
      `).get(slipId, req.tenantId);
      if (!slip) throw fault(404, 'Không tìm thấy phiếu lương đã duyệt của doanh nghiệp');
      // Ensure the branch still belongs to this tenant (including an inactive
      // location for historical payroll). The original slip branch is immutable.
      const branch = db._native.prepare(
        'SELECT id FROM branches WHERE user_id=? AND id=?',
      ).get(req.tenantId, slip.branch_id);
      if (!branch) throw fault(409, 'Không tìm thấy chi nhánh trên phiếu lương');
      const due = Number(slip.payable_estimate);
      if (!Number.isSafeInteger(due) || due < 0) {
        throw fault(409, 'Phiếu lương thiếu số tiền đã đối soát, không thể ghi thanh toán');
      }

      const existingKey = db._native.prepare(
        'SELECT id FROM hrm_payroll_payments WHERE user_id=? AND idempotency_key=?',
      ).get(req.tenantId, key);
      if (existingKey) throw fault(409, 'Yêu cầu đã được ghi nhận trước đó');
      assertNoOpenCorrection(db._native,req.tenantId,slipId);
      const paidBefore = paidForSlip(db._native,req.tenantId,slipId);
      const remaining = due - paidBefore;
      if (remaining < amount) throw fault(409, 'Số tiền vượt mức còn phải trả trên phiếu lương');

      // Insert once into payroll first; a bank ref / cash receipt cannot be
      // reused for another payment within the same tenant and method.
      // Prevent double posting when the bank reference already exists on a
      // legacy salary expense; use /payments/link to reconcile instead.
      const existingManualFlow = db._native.prepare(`
        SELECT cf.id FROM cash_flows cf JOIN payment_evidence e
          ON e.cash_flow_id=cf.id AND e.user_id=cf.user_id
        WHERE cf.user_id=? AND cf.transaction_type='out'
          AND e.payment_method=? AND e.transaction_reference=?
        LIMIT 1
      `).get(req.tenantId,method,reference);
      if (existingManualFlow) throw fault(409,
        'Chứng từ đã tồn tại trong Sổ quỹ. Chỉ liên kết nếu thuộc danh mục lương và đúng người nhận; không ghi chi lần nữa');

      const receipt = db._native.prepare(`
        INSERT INTO hrm_payroll_payments
        (user_id,slip_id,staff_id,branch_id,amount,payment_method,
         payment_reference,idempotency_key,note,cash_flow_id,recorded_by)
        VALUES(?,?,?,?,?,?,?,?,?,0,?)
      `).run(req.tenantId, slipId, slip.staff_id, slip.branch_id, amount,
        method, reference, key, note || null, req.user.actorId);
      const paymentId = Number(receipt.lastInsertRowid);
      const internalReference = 'PAYROLL-' + paymentId;
      const flow = db._native.prepare(`
        INSERT INTO cash_flows
        (user_id,transaction_type,category,amount,payment_method,reference_id,notes,branch_id)
        VALUES(?,'out','salary',?,?,?,?,?)
      `).run(req.tenantId,amount,method,internalReference,
        'Chi lương tháng ' + slip.month + ' · nhân viên #' + slip.staff_id +
        ' · chứng từ ' + reference + (note ? ' · ' + note : ''),slip.branch_id);
      const cashFlowId = Number(flow.lastInsertRowid);
      db._native.prepare(`
        INSERT INTO payment_evidence
        (user_id,cash_flow_id,amount,payment_method,transaction_reference,paid_at,status)
        VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,'RECORDED')
      `).run(req.tenantId,cashFlowId,amount,method,reference);
      db._native.prepare(
        'UPDATE hrm_payroll_payments SET cash_flow_id=? WHERE id=? AND user_id=?',
      ).run(cashFlowId,paymentId,req.tenantId);
      return {
        id:paymentId,slip_id:slipId,staff_id:slip.staff_id,branch_id:slip.branch_id,
        amount,payment_method:method,payment_reference:reference,
        cash_flow_id:cashFlowId,total_paid:paidBefore+amount,remaining:remaining-amount,
        payment_status:remaining===amount?'paid':'partial',
      };
    }).immediate();

    writeAudit(req,{action:'hrm.payroll.payment.recorded',target:String(payout.id),
      detail:{slip_id:payout.slip_id,staff_id:payout.staff_id,branch_id:payout.branch_id,
        amount:payout.amount,payment_method:payout.payment_method,
        payment_reference:payout.payment_reference,cash_flow_id:payout.cash_flow_id}});
    return res.status(201).json({success:true,...payout,
      disclaimer:'Đã ghi nhận giao dịch do chủ xác nhận, không phải lệnh chuyển khoản ngân hàng'});
  } catch(e) {
    if (String(e.message).includes('UNIQUE constraint')) {
      return res.status(409).json({error:'Mã chứng từ hoặc yêu cầu thanh toán đã được ghi nhận'});
    }
    return fail(res,e);
  }
});


/**
 * Find existing eligible salary expenses to reconcile to approved payroll.
 * This does NOT create new cash flows or move money; only entries with
 * documented payment evidence may be linked.
 */
router.get('/payroll/payments/unlinked', requireOwner, (req, res) => {
  try {
    const month = String(req.query.month || '');
    if (!monthIsValid(month)) throw fault(400, 'Tháng phải là YYYY-MM');
    const branch = req.query.branch_id === undefined || req.query.branch_id === ''
      ? null : resolvePosBranch(req, req.query.branch_id);
    const rows = db._native.prepare(`
      SELECT cf.id AS cash_flow_id, cf.branch_id, cf.created_at,
        cf.amount, cf.payment_method, cf.notes, e.transaction_reference AS payment_reference
      FROM cash_flows cf JOIN payment_evidence e
        ON e.cash_flow_id=cf.id AND e.user_id=cf.user_id
      WHERE cf.user_id=? AND cf.category='salary' AND cf.transaction_type='out'
        AND strftime('%Y-%m',cf.created_at,'+7 hours')=?
        ${branch===null?'':'AND cf.branch_id=?'}
        AND cf.branch_id IS NOT NULL
        AND cf.payment_method IN ('cash','bank')
        AND e.status='RECORDED' AND e.payment_method=cf.payment_method
        AND e.amount=cf.amount
        AND e.transaction_reference IS NOT NULL AND length(trim(e.transaction_reference)) BETWEEN 6 AND 120
        AND cf.amount>0 AND cf.amount=CAST(cf.amount AS INTEGER)
        AND NOT EXISTS (
          SELECT 1 FROM hrm_payroll_payments p
          WHERE p.user_id=cf.user_id AND p.cash_flow_id=cf.id
        )
      ORDER BY cf.id DESC LIMIT 150
    `).all(...(branch===null?[req.tenantId,month]:[req.tenantId,month,branch]));
    return res.json({ month, candidates:rows, note:
      'Chỉ các phiếu chi lương có bằng chứng thanh toán đủ thông tin mới được phép liên kết; không tạo giao dịch mới.' });
  } catch(e) { return fail(res,e); }
});

/**
 * Link a legacy salary expense already posted in cashbook to an approved
 * payslip. No new cash_flows/payment_evidence rows are created.
 */
router.post('/payroll/payments/link', requireOwner, (req, res) => {
  try {
    if(req.body?.confirmation!=='CONFIRM_EXISTING_EXPENSE') {
      throw fault(400,'Cần xác nhận phiếu chi đã thực sự tồn tại trong Sổ quỹ');
    }
    const slipId=Number(req.body?.slip_id);
    const flowId=Number(req.body?.cash_flow_id);
    const key=String(req.body?.idempotency_key||'');
    if(!positiveInteger(slipId)||!positiveInteger(flowId))throw fault(400,'Mã phiếu lương/phiếu chi không hợp lệ');
    if(!validPaymentKey(key))throw fault(400,'Mã chống ghi trùng không hợp lệ');
    const result=db._native.transaction(()=>{
      const slip=db._native.prepare(`
        SELECT id,staff_id,branch_id,payable_estimate FROM hrm_payroll_slips
        WHERE id=? AND user_id=? AND status='approved'
      `).get(slipId,req.tenantId);
      if(!slip)throw fault(404,'Không tìm thấy phiếu lương đã duyệt');
      const flow=db._native.prepare(`
        SELECT cf.id,cf.branch_id,cf.amount,cf.payment_method,
          e.transaction_reference AS payment_reference
        FROM cash_flows cf JOIN payment_evidence e
          ON e.cash_flow_id=cf.id AND e.user_id=cf.user_id
        WHERE cf.id=? AND cf.user_id=? AND cf.category='salary'
          AND cf.transaction_type='out' AND cf.payment_method IN ('cash','bank')
          AND e.status='RECORDED' AND e.amount=cf.amount AND e.payment_method=cf.payment_method
      `).get(flowId,req.tenantId);
      if(!flow)throw fault(404,'Phiếu chi không hợp lệ hoặc thiếu bằng chứng thanh toán');
      if(Number(flow.branch_id)!==Number(slip.branch_id))throw fault(403,'Phiếu chi và phiếu lương khác chi nhánh');
      const amount=Number(flow.amount);
      if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000) {
        throw fault(400,'Số tiền phiếu chi không hợp lệ');
      }
      const reference=String(flow.payment_reference||'').trim();
      if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{5,119}$/.test(reference)) {
        throw fault(409,'Mã chứng từ gốc không hợp lệ. Phải đối soát trước khi liên kết');
      }
      const dup=db._native.prepare(`
        SELECT id FROM hrm_payroll_payments
        WHERE user_id=? AND (cash_flow_id=? OR idempotency_key=? OR
          (payment_method=? AND payment_reference=?)) LIMIT 1
      `).get(req.tenantId,flowId,key,flow.payment_method,reference);
      if(dup)throw fault(409,'Phiếu chi hoặc mã chứng từ đã được liên kết trước đó');
      const due=Number(slip.payable_estimate);
      if(!Number.isSafeInteger(due)||due<0)throw fault(409,'Phiếu lương chưa đủ số liệu để thanh toán');
      assertNoOpenCorrection(db._native,req.tenantId,slipId);
      const paid=paidForSlip(db._native,req.tenantId,slipId);
      if(paid+amount>due)throw fault(409,'Giá trị phiếu chi vượt số lương còn phải trả');
      const saved=db._native.prepare(`
        INSERT INTO hrm_payroll_payments
          (user_id,slip_id,staff_id,branch_id,amount,payment_method,
           payment_reference,idempotency_key,note,cash_flow_id,recorded_by,origin)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'linked_cash_flow')
      `).run(req.tenantId,slipId,slip.staff_id,slip.branch_id,amount,
        flow.payment_method,reference,key,'Đối soát phiếu chi đã có',flowId,req.user.actorId);
      return {id:Number(saved.lastInsertRowid),slip_id:slipId,cash_flow_id:flowId,
        staff_id:slip.staff_id,branch_id:slip.branch_id,amount,
        payment_method:flow.payment_method,payment_reference:reference,
        origin:'linked_cash_flow',total_paid:paid+amount,remaining:due-paid-amount,
        payment_status:paid+amount===due?'paid':'partial'};
    }).immediate();
    writeAudit(req,{action:'hrm.payroll.payment.linked',target:String(result.id),
      detail:{slip_id:result.slip_id,cash_flow_id:result.cash_flow_id,amount:result.amount,
        branch_id:result.branch_id,payment_reference:result.payment_reference}});
    return res.status(201).json({success:true,...result,
      disclaimer:'Chỉ liên kết phiếu chi đã có; không phát sinh dòng tiền mới'});
  }catch(e){
    if(String(e.message).includes('UNIQUE constraint'))return res.status(409).json({error:'Phiếu chi/chứng từ đã được đối soát'});
    return fail(res,e);
  }
});

/**
 * Errors after posting money require evidence-backed human correction. Raise
 * an append-only review request, never silently delete or counter-post money.
 */
router.post('/payroll/payments/:id/correction-request', requireOwner, (req, res) => {
  try{
    const id=Number(req.params.id);
    const reason=String(req.body?.reason||'').trim();
    if(!positiveInteger(id))throw fault(400,'Mã thanh toán không hợp lệ');
    if(reason.length<12||reason.length>500)throw fault(400,'Lý do điều chỉnh phải từ 12 đến 500 ký tự');
    const result=db._native.transaction(()=>{
      const payment=db._native.prepare(`
        SELECT id,slip_id,cash_flow_id,amount,branch_id FROM hrm_payroll_payments
        WHERE id=? AND user_id=?
      `).get(id,req.tenantId);
      if(!payment)throw fault(404,'Không tìm thấy thanh toán của doanh nghiệp');
      const allocated=db._native.prepare(
        'SELECT id FROM hrm_payroll_payment_reallocations WHERE user_id=? AND payment_id=?'
      ).get(req.tenantId,id);
      if(allocated)throw fault(409,'Thanh toán đã được phân bổ lại trước đó; không cho sửa liên tiếp');
      const saved=db._native.prepare(`
        INSERT INTO hrm_payroll_payment_correction_requests
          (user_id,payment_id,reason,requested_by) VALUES(?,?,?,?)
      `).run(req.tenantId,id,reason,req.user.actorId);
      return {id:Number(saved.lastInsertRowid),payment_id:id,
        slip_id:payment.slip_id,cash_flow_id:payment.cash_flow_id,amount:payment.amount};
    }).immediate();
    writeAudit(req,{action:'hrm.payroll.payment.correction_requested',target:String(result.payment_id),
      detail:{request_id:result.id,reason,cash_flow_id:result.cash_flow_id}});
    return res.status(201).json({success:true,...result,status:'open',
      note:'Đã ghi yêu cầu đối soát. Chưa đảo bút toán, chưa đổi số dư lương, chưa hoàn/chuyển tiền'});
  }catch(e){
    if(String(e.message).includes('UNIQUE constraint'))return res.status(409).json({error:'Thanh toán đã có yêu cầu đối soát đang mở'});
    return fail(res,e);
  }
});

router.get('/payroll/payments/corrections', requireOwner, (req,res)=>{
  try{
    const rows=db._native.prepare(`
      SELECT c.id,c.payment_id,c.reason,c.status,c.created_at,
        c.requested_by,c.resolution_note,c.resolution_action,c.resolution_reference,
        c.resolved_at,c.resolved_by,
        p.slip_id AS original_slip_id,
        rel.target_slip_id,
        COALESCE(rel.target_slip_id,p.slip_id) AS slip_id,
        p.branch_id,p.amount,p.payment_reference,p.origin
      FROM hrm_payroll_payment_correction_requests c
      JOIN hrm_payroll_payments p ON p.id=c.payment_id AND p.user_id=c.user_id
      LEFT JOIN hrm_payroll_payment_reallocations rel ON rel.user_id=p.user_id
        AND rel.payment_id=p.id
      WHERE c.user_id=? ORDER BY c.id DESC LIMIT 200
    `).all(req.tenantId);
    return res.json(rows);
  }catch(e){return fail(res,e);}
});

/**
 * Human-reviewed resolution. "verified" closes an incorrect alert without
 * changing any ledger allocation. "reallocate" only reassigns an ALREADY
 * LINKED legacy salary voucher to another approved slip in the SAME branch.
 * The original payment and its cash_flow/payment_evidence remain untouched;
 * an immutable reallocation event is the sole source of the new association.
 * There is deliberately no path to reverse/pretend-refund cash here.
 */
router.post('/payroll/payments/corrections/:id/resolve', requireOwner, (req,res)=>{
  try{
    const requestId=Number(req.params.id);
    const action=String(req.body?.action||'').trim();
    const note=String(req.body?.resolution_note||'').trim();
    const proof=String(req.body?.evidence_reference||'').trim();
    if(!positiveInteger(requestId))throw fault(400,'Mã yêu cầu đối soát không hợp lệ');
    if(!['verified','reallocate'].includes(action))throw fault(400,'Hình thức xử lý không hợp lệ');
    if(req.body?.confirmation!=='CONFIRM_LEDGER_REVIEW')
      throw fault(400,'Cần xác nhận đã kiểm tra chứng từ gốc và người nhận');
    if(note.length<12||note.length>500)
      throw fault(400,'Kết luận đối soát phải từ 12 đến 500 ký tự');
    if(action==='reallocate'&&!/^[A-Za-z0-9][A-Za-z0-9._:/-]{5,119}$/.test(proof))
      throw fault(400,'Cần mã bằng chứng xác minh người nhận (6–120 ký tự)');
    const result=db._native.transaction(()=>{
      const record=db._native.prepare(`
        SELECT c.id,c.status,c.payment_id,c.reason,
          p.slip_id AS original_slip_id,p.staff_id,p.branch_id,p.amount,
          p.origin,p.cash_flow_id,p.payment_reference,
          original.month AS original_month
        FROM hrm_payroll_payment_correction_requests c
        JOIN hrm_payroll_payments p ON p.id=c.payment_id AND p.user_id=c.user_id
        JOIN hrm_payroll_slips original ON original.id=p.slip_id AND original.user_id=p.user_id
        WHERE c.user_id=? AND c.id=?
      `).get(req.tenantId,requestId);
      if(!record)throw fault(404,'Không tìm thấy yêu cầu của doanh nghiệp');
      if(record.status!=='open')throw fault(409,'Yêu cầu đã được xử lý; không xử lý trùng');
      let targetSlipId=null;
      if(action==='reallocate'){
        if(record.origin!=='linked_cash_flow')
          throw fault(409,'Chỉ được sửa liên kết phiếu chi cũ; giao dịch trả lương trực tiếp cần kế toán kiểm tra và chứng từ hoàn/chi ngoài hệ thống');
        const already=db._native.prepare(`
          SELECT id FROM hrm_payroll_payment_reallocations
          WHERE user_id=? AND payment_id=?
        `).get(req.tenantId,record.payment_id);
        if(already)throw fault(409,'Chứng từ đã phân bổ lại một lần');
        targetSlipId=Number(req.body?.target_slip_id);
        if(!positiveInteger(targetSlipId)||targetSlipId===record.original_slip_id)
          throw fault(400,'Chọn phiếu lương đích khác phiếu gốc');
        const target=db._native.prepare(`
          SELECT id,staff_id,branch_id,payable_estimate,month
          FROM hrm_payroll_slips WHERE user_id=? AND id=? AND status='approved'
        `).get(req.tenantId,targetSlipId);
        if(!target)throw fault(404,'Phiếu lương nhận không thuộc doanh nghiệp hoặc chưa duyệt');
        if(Number(target.branch_id)!==Number(record.branch_id))
          throw fault(403,'Không được phân bổ chứng từ sang chi nhánh khác');
        if(target.month!==record.original_month)
          throw fault(409,'Không phân bổ chứng từ sang kỳ lương khác. Cần đối chiếu tháng lương trên chứng từ');
        if(Number(target.staff_id)===Number(record.staff_id))
          throw fault(409,'Chứng từ đang gắn với đúng nhân viên; không cần chuyển nhân viên');
        const due=Number(target.payable_estimate);
        if(!Number.isSafeInteger(due)||due<0)
          throw fault(409,'Phiếu lương nhận chưa đủ thông tin số tiền phải trả');
        assertNoOpenCorrection(db._native,req.tenantId,targetSlipId);
        const paid=paidForSlip(db._native,req.tenantId,targetSlipId);
        if(paid+Number(record.amount)>due)
          throw fault(409,'Phân bổ làm phiếu lương nhận bị vượt số tiền còn phải trả');
        db._native.prepare(`
          INSERT INTO hrm_payroll_payment_reallocations
          (user_id,payment_id,correction_request_id,original_slip_id,target_slip_id,
           branch_id,amount,evidence_reference,note,resolved_by)
          VALUES(?,?,?,?,?,?,?,?,?,?)
        `).run(req.tenantId,record.payment_id,record.id,record.original_slip_id,
          targetSlipId,record.branch_id,record.amount,proof,note,req.user.actorId);
      }
      const changed=db._native.prepare(`
        UPDATE hrm_payroll_payment_correction_requests
        SET status='resolved',resolution_action=?,resolution_reference=?,
          resolution_note=?,resolved_by=?,resolved_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=? AND status='open'
      `).run(action,action==='reallocate'?proof:null,note,req.user.actorId,record.id,req.tenantId);
      if(changed.changes!==1)throw fault(409,'Yêu cầu đối soát đã được xử lý');
      return {request_id:record.id,payment_id:record.payment_id,
        original_slip_id:record.original_slip_id,target_slip_id:targetSlipId,
        cash_flow_id:record.cash_flow_id,branch_id:record.branch_id,
        amount:record.amount,action,status:'resolved'};
    }).immediate();
    writeAudit(req,{action:'hrm.payroll.payment.correction_resolved',target:String(result.payment_id),
      detail:{request_id:result.request_id,action:result.action,
        original_slip_id:result.original_slip_id,target_slip_id:result.target_slip_id,
        cash_flow_id:result.cash_flow_id,amount:result.amount,branch_id:result.branch_id,
        evidence_reference:action==='reallocate'?proof:null}});
    return res.json({success:true,...result,
      note:action==='reallocate'
        ? 'Chỉ đổi liên kết phiếu lương qua nhật ký bất biến; tiền và phiếu chi gốc không đổi'
        : 'Đã xác minh chứng từ đúng; số dư và giao dịch tiền không thay đổi'});
  }catch(e){
    if(String(e.message).includes('UNIQUE constraint'))
      return res.status(409).json({error:'Chứng từ đã được đối soát hoặc phân bổ trước đó'});
    return fail(res,e);
  }
});

module.exports = router;
