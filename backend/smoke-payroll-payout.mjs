// Salary payout acceptance: tests real cashbook integration without external transfers.
import Database from 'better-sqlite3';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3107/api';
const sqlite=process.env.SMOKE_DB_PATH||'./autotax.db';
const unique=String(Date.now()).slice(-8);
const assert=(v,m)=>{if(!v)throw Error(m)};
async function call(path,{token,method='GET',body,expected=200}={}) {
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',
   ...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await r.json().catch(()=>({}));
  assert(r.status===expected,method+' '+path+': expected '+expected+' got '+r.status+' '+JSON.stringify(data));
  return data;
}
const owner=await call('/auth/register',{method:'POST',body:{
 phone:'09'+unique,name:'Payroll Payment Tenant',password:'PayoutSecure2026!',sector:'retail',
}});
const t=owner.token;
const first=(await call('/branches',{token:t}))[0];
const second=await call('/branches',{token:t,method:'POST',body:{name:'Second payout location'}});
const staff=await call('/staff',{token:t,method:'POST',body:{
 name:'Payroll Person',username:'payout_staff_'+unique,password:'PayoutSecure2026!',
 branch_id:first.id,role:'Thu ngân',permissions:['staff','finance'],
}});
const staffLogin=await call('/auth/staff-login',{method:'POST',body:{
 username:'payout_staff_'+unique,password:'PayoutSecure2026!',
}});
const st=staffLogin.token;
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',
 timeZone:'Asia/Ho_Chi_Minh'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const month=new Date(Date.UTC(Number(parts.year),Number(parts.month)-2,1)).toISOString().slice(0,7);
const clock=await call('/hrm/checkin',{token:t,method:'POST',body:{staff_id:staff.id}});
const native=new Database(sqlite);
native.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(month+'-10 02:00:00',month+'-10 06:00:00',clock.shift_id);
native.close();
await call('/hrm/pay-rates/'+staff.id,{token:t,method:'PUT',body:{hourly_rate:50000}});
await call('/hrm/payroll/payments?month='+month,{token:st,expected:403});
await call('/hrm/payroll/payments?month='+month,{token:t});
let row=(await call('/hrm/payroll?month='+month,{token:t})).rows.find(r=>r.staff_id===staff.id);
assert(row.status==='draft' && row.slip_id===null, 'Salary must not be payable before approval');
const approval=await call('/hrm/payroll/approve',{token:t,method:'POST',expected:201,
 body:{staff_id:staff.id,branch_id:first.id,month}});
assert(approval.payable_estimate===200000 && approval.payment_status==='unpaid','Payroll approval amount incorrect');
const before=await call('/finance/cash-flows',{token:t});
assert(before.length===0,'Approval must not create cash out');
row=(await call('/hrm/payroll?month='+month,{token:t})).rows.find(r=>r.staff_id===staff.id);
assert(row.remaining_amount===200000 && row.paid_amount===0 && row.payment_status==='unpaid',
 'Outstanding balance before payment incorrect');
const form=(amount,method,ref,key)=>({
 slip_id:row.slip_id,amount,payment_method:method,payment_reference:ref,
 idempotency_key:'payout_'+unique+'_'+key,note:'Payment confirmed by owner',
 confirmation:'CONFIRM_ALREADY_PAID',branch_id:second.id,staff_id:9999999,
});
await call('/hrm/payroll/payments',{token:st,method:'POST',expected:403,
 body:form(50000,'cash','CASH-'+unique+'-01','denied')});
await call('/hrm/payroll/payments',{token:t,method:'POST',expected:400,
 body:{...form(50000,'cash','CASH-'+unique+'-01','missingconfirm'),confirmation:undefined}});
const firstPaid=await call('/hrm/payroll/payments',{token:t,method:'POST',expected:201,
 body:form(50000,'cash','CASH-'+unique+'-01','cash')});
assert(firstPaid.cash_flow_id && firstPaid.branch_id===first.id &&
 firstPaid.total_paid===50000 && firstPaid.remaining===150000 &&
 firstPaid.payment_status==='partial','First partial salary payment incorrect');
await call('/hrm/payroll/payments',{token:t,method:'POST',expected:409,
 body:form(50000,'cash','CASH-'+unique+'-01','cash')});
await call('/hrm/payroll/payments',{token:t,method:'POST',expected:409,
 body:form(50000,'cash','CASH-'+unique+'-01','cash-newkey')});
await call('/hrm/payroll/payments',{token:t,method:'POST',expected:409,
 body:form(170000,'bank','BANK-'+unique+'-overpay','overpay')});
let mid=(await call('/hrm/payroll?month='+month,{token:t})).rows.find(r=>r.staff_id===staff.id);
assert(mid.paid_amount===50000&&mid.remaining_amount===150000&&mid.payment_status==='partial',
 'Partial salary was marked fully paid');
const secondPaid=await call('/hrm/payroll/payments',{token:t,method:'POST',expected:201,
 body:form(150000,'bank','BANK-'+unique+'-02','bank')});
assert(secondPaid.payment_status==='paid'&&secondPaid.remaining===0,'Final salary payment incorrect');
const balances=await call('/hrm/payroll?month='+month,{token:t});
const paid=balances.rows.find(r=>r.staff_id===staff.id);
assert(paid.payment_status==='paid'&&paid.remaining_amount===0&&paid.paid_amount===200000,
 'Fully paid salary reconciliation incorrect');
assert(balances.recorded_payments===200000&&balances.outstanding_approved===0,
 'Company payment totals incorrect');
const records=await call('/hrm/payroll/payments?month='+month+'&branch_id='+first.id,{token:t});
assert(records.length===2&&records.every(p=>p.branch_id===first.id&&p.cash_flow_id),
 'Payout receipts must be scoped to original approved branch');
const otherRecords=await call('/hrm/payroll/payments?month='+month+'&branch_id='+second.id,{token:t});
assert(otherRecords.length===0,'Payout ledger leaked into a different store');
const flows=await call('/finance/cash-flows',{token:t});
const wages=flows.filter(f=>f.category==='salary');
assert(wages.length===2&&wages.every(f=>f.transaction_type==='out'&&f.branch_id===first.id),
 'Salary payouts were not attributed to the correct branch in cashbook');
assert(wages.reduce((s,f)=>s+Number(f.amount),0)===200000,
 'Cashbook amount did not reconcile with payroll');
const sql=new Database(sqlite);
const evidence=sql.prepare(`
 SELECT p.cash_flow_id, e.amount, e.payment_method, e.transaction_reference
 FROM hrm_payroll_payments p JOIN payment_evidence e
 ON e.cash_flow_id=p.cash_flow_id AND e.user_id=p.user_id
 WHERE p.user_id=? AND p.slip_id=?
`).all(owner.user?.phone||'09'+unique,row.slip_id);
sql.close();
assert(evidence.length===2 && evidence.every(x=>x.cash_flow_id),
 'Each payroll payment must have exact payment evidence');
const foreign=await call('/auth/register',{method:'POST',body:{
 phone:'08'+unique,name:'Foreign Payroll Tenant',password:'PayoutSecure2026!',sector:'retail',
}});
await call('/hrm/payroll/payments',{token:foreign.token,method:'POST',expected:404,
 body:form(10000,'cash','CASH-'+unique+'-foreign','foreign')});
// A cash expense created earlier in the ledger must be LINKED, never
// duplicated when its bank reference is supplied to a new payroll payout.
const otherStaff=await call('/staff',{token:t,method:'POST',body:{
 name:'Legacy Salary Employee',username:'legacy_pay_'+unique,password:'PayoutSecure2026!',
 branch_id:first.id,role:'Thu ngân',permissions:['staff'],
}});
const oldShift=await call('/hrm/checkin',{token:t,method:'POST',body:{staff_id:otherStaff.id}});
const editDb=new Database(sqlite);
editDb.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(month+'-12 02:00:00',month+'-12 04:00:00',oldShift.shift_id);
editDb.close();
await call('/hrm/pay-rates/'+otherStaff.id,{token:t,method:'PUT',body:{hourly_rate:60000}});
const approvedLegacy=await call('/hrm/payroll/approve',{token:t,method:'POST',expected:201,
 body:{staff_id:otherStaff.id,branch_id:first.id,month}});
assert(approvedLegacy.payable_estimate===120000,'Legacy salary slip amount incorrect');
const oldReference='LEGACY-'+unique+'-01';
const manual=await call('/finance/cash-flows',{token:t,method:'POST',body:{
 transaction_type:'out',category:'salary',amount:60000,payment_method:'bank',
 payment_reference:oldReference,branch_id:first.id,notes:'Đã trả lương trước khi nối bảng lương',
}});
// Duplicate salary expense must be rejected even BEFORE voucher linkage.
await call('/finance/cash-flows',{token:t,method:'POST',expected:409,body:{
 transaction_type:'out',category:'salary',amount:60000,payment_method:'bank',
 payment_reference:oldReference,branch_id:first.id,
}});
const beforeLink=(await call('/finance/cash-flows',{token:t})).length;
const unlinked=await call('/hrm/payroll/payments/unlinked?month='+parts.year+'-'+parts.month,{token:t});
assert(unlinked.candidates.some(x=>x.cash_flow_id===manual.id),
 'Previously entered salary cash expense not available to link');
const fakeExisting=await call('/hrm/payroll/payments',{token:t,method:'POST',expected:409,
 body:{...form(60000,'bank',oldReference,'already-booked'),slip_id:approvedLegacy.id}});
await call('/hrm/payroll/payments/link',{token:st,method:'POST',expected:403,
 body:{slip_id:approvedLegacy.id,cash_flow_id:manual.id,confirmation:'CONFIRM_EXISTING_EXPENSE',
 idempotency_key:'link_'+unique+'_forbidden'}});
await call('/hrm/payroll/payments/link',{token:t,method:'POST',expected:400,
 body:{slip_id:approvedLegacy.id,cash_flow_id:manual.id,idempotency_key:'link_'+unique+'_missing'}});
const linked=await call('/hrm/payroll/payments/link',{token:t,method:'POST',expected:201,body:{
 slip_id:approvedLegacy.id,cash_flow_id:manual.id,confirmation:'CONFIRM_EXISTING_EXPENSE',
 idempotency_key:'link_'+unique+'_first',
}});
assert(linked.origin==='linked_cash_flow'&&linked.total_paid===60000 &&
 linked.remaining===60000 && linked.cash_flow_id===manual.id,
 'Legacy expense must be linked without double counting');
assert((await call('/finance/cash-flows',{token:t})).length===beforeLink,
 'Linking an already paid salary must not create another cashbook entry');
await call('/hrm/payroll/payments/link',{token:t,method:'POST',expected:409,body:{
 slip_id:approvedLegacy.id,cash_flow_id:manual.id,confirmation:'CONFIRM_EXISTING_EXPENSE',
 idempotency_key:'link_'+unique+'_duplicate',
}});
await call('/finance/cash-flows',{token:t,method:'POST',expected:409,body:{
 transaction_type:'out',category:'salary',amount:60000,payment_method:'bank',
 payment_reference:oldReference,branch_id:first.id,
}});
await call('/finance/cash-flows',{token:t,method:'POST',expected:409,body:{
 transaction_type:'out',category:'other',amount:60000,payment_method:'bank',
 payment_reference:oldReference,branch_id:first.id,
}});
const afterLink=(await call('/hrm/payroll?month='+month,{token:t})).rows
 .find(x=>x.staff_id===otherStaff.id&&x.branch_id===first.id);
assert(afterLink.payment_status==='partial'&&afterLink.paid_amount===60000&&
 afterLink.remaining_amount===60000,'Linked expense must update payroll outstanding');

await call('/hrm/payroll/payments/'+linked.id+'/correction-request',{token:st,
 method:'POST',expected:403,body:{reason:'Cần kiểm tra lại chứng từ trả lương'}});
const correction=await call('/hrm/payroll/payments/'+linked.id+'/correction-request',{token:t,
 method:'POST',expected:201,body:{reason:'Cần kiểm tra lại chứng từ trả lương đã nhập trước đó'}});
assert(correction.status==='open','Correction must be a review request, not an automatic cash reversal');
await call('/hrm/payroll/payments/'+linked.id+'/correction-request',{token:t,
 method:'POST',expected:409,body:{reason:'Yêu cầu xử lý đã tạo trước đó không được nhân đôi'}});
const corrections=await call('/hrm/payroll/payments/corrections',{token:t});
assert(corrections.some(x=>x.id===correction.id&&x.payment_id===linked.id),'Correction audit missing');
const linkedRows=await call('/hrm/payroll/payments?month='+month,{token:t});
assert(linkedRows.some(x=>x.id===linked.id&&x.correction_open===1&&
 x.origin==='linked_cash_flow'),'Payment correction state not visible');
assert((await call('/finance/cash-flows',{token:t})).length===beforeLink,
 'Correction request must not move cash');
const foreignCorrections=await call('/hrm/payroll/payments/corrections',{token:foreign.token,expected:200});
assert(foreignCorrections.length===0,'Correction data from another tenant must be private');
await call('/hrm/payroll/payments/link',{token:foreign.token,method:'POST',expected:404,
 body:{slip_id:approvedLegacy.id,cash_flow_id:manual.id,
 confirmation:'CONFIRM_EXISTING_EXPENSE',idempotency_key:'link_'+unique+'_foreign'}});
await call('/hrm/payroll/payments/'+linked.id+'/correction-request',{token:foreign.token,
 method:'POST',expected:404,body:{reason:'Truy cập dữ liệu công ty khác bị ngăn chặn'}});

// Open correction blocks further payouts until a human confirms review.
await call('/hrm/payroll/payments',{token:t,method:'POST',expected:409,
 body:{...form(60000,'bank','BANK-'+unique+'-pending','pendingcorrection'),
 slip_id:approvedLegacy.id}});
const targetStaff=await call('/staff',{token:t,method:'POST',body:{
 name:'Voucher Actual Recipient',username:'receipt_actual_'+unique,password:'PayoutSecure2026!',
 branch_id:first.id,role:'Bán hàng',permissions:[],
}});
const targetClock=await call('/hrm/checkin',{token:t,method:'POST',body:{staff_id:targetStaff.id}});
const otherBranchStaff=await call('/staff',{token:t,method:'POST',body:{
 name:'Wrong Branch Candidate',username:'receipt_wrong_'+unique,password:'PayoutSecure2026!',
 branch_id:second.id,role:'Bán hàng',permissions:[],
}});
const otherClock=await call('/hrm/checkin',{token:t,method:'POST',body:{staff_id:otherBranchStaff.id}});
const shiftData=new Database(sqlite);
shiftData.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(month+'-13 02:00:00',month+'-13 04:00:00',targetClock.shift_id);
shiftData.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(month+'-14 02:00:00',month+'-14 04:00:00',otherClock.shift_id);
shiftData.close();
await call('/hrm/pay-rates/'+targetStaff.id,{token:t,method:'PUT',body:{hourly_rate:50000}});
await call('/hrm/pay-rates/'+otherBranchStaff.id,{token:t,method:'PUT',body:{hourly_rate:50000}});
const targetSlip=await call('/hrm/payroll/approve',{token:t,method:'POST',expected:201,
 body:{staff_id:targetStaff.id,branch_id:first.id,month}});
const wrongBranchSlip=await call('/hrm/payroll/approve',{token:t,method:'POST',expected:201,
 body:{staff_id:otherBranchStaff.id,branch_id:second.id,month}});
const resolvePayload={
 action:'reallocate',target_slip_id:targetSlip.id,
 evidence_reference:'RECEIPT-'+unique+'-ACTUAL',
 resolution_note:'Đã kiểm tra chứng từ nhận tiền đúng nhân viên thuộc cùng chi nhánh',
 confirmation:'CONFIRM_LEDGER_REVIEW',
};
const route='/hrm/payroll/payments/corrections/'+correction.id+'/resolve';
await call(route,{token:st,method:'POST',expected:403,body:resolvePayload});
await call(route,{token:t,method:'POST',expected:400,
 body:{...resolvePayload,confirmation:undefined}});
await call(route,{token:t,method:'POST',expected:403,
 body:{...resolvePayload,target_slip_id:wrongBranchSlip.id}});
await call(route,{token:t,method:'POST',expected:400,
 body:{...resolvePayload,target_slip_id:approvedLegacy.id}});
// Reassignment must remain within the original payroll MONTH, even if the
// same employee and branch happen to have another approved slip.
const prior2=new Date(Date.UTC(Number(parts.year),Number(parts.month)-3,1))
 .toISOString().slice(0,7);
const crossMonthClock=await call('/hrm/checkin',{token:t,method:'POST',
 body:{staff_id:targetStaff.id}});
const crossDb=new Database(sqlite);
crossDb.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(prior2+'-15 02:00:00',prior2+'-15 04:00:00',crossMonthClock.shift_id);
crossDb.close();
const crossMonthSlip=await call('/hrm/payroll/approve',{token:t,method:'POST',expected:201,
 body:{staff_id:targetStaff.id,branch_id:first.id,month:prior2}});
await call(route,{token:t,method:'POST',expected:409,
 body:{...resolvePayload,target_slip_id:crossMonthSlip.id}});
const originalCashCount=(await call('/finance/cash-flows',{token:t})).length;
const resolution=await call(route,{token:t,method:'POST',body:resolvePayload});
assert(resolution.status==='resolved'&&resolution.target_slip_id===targetSlip.id &&
 resolution.original_slip_id===approvedLegacy.id&&resolution.amount===60000,
 'Reallocation must explicitly identify both original and new payroll slips');
await call(route,{token:t,method:'POST',expected:409,body:resolvePayload});
assert((await call('/finance/cash-flows',{token:t})).length===originalCashCount,
 'Reallocation must not create, delete or reverse any cash flow');
const reassigned=(await call('/hrm/payroll?month='+month,{token:t})).rows;
const oldRow=reassigned.find(x=>x.staff_id===otherStaff.id&&x.branch_id===first.id);
const newRow=reassigned.find(x=>x.staff_id===targetStaff.id&&x.branch_id===first.id);
assert(oldRow.paid_amount===0&&oldRow.remaining_amount===120000&&oldRow.payment_status==='unpaid',
 'Wrongly linked old recipient must regain outstanding amount');
assert(newRow.paid_amount===60000&&newRow.remaining_amount===40000&&newRow.payment_status==='partial',
 'Actual recipient must carry the same recorded cash expense');
const history=await call('/hrm/payroll/payments?month='+month,{token:t});
assert(history.some(p=>p.id===linked.id&&p.slip_id===targetSlip.id &&
 p.original_slip_id===approvedLegacy.id&&p.reallocation_id),
 'Payout history must retain original slip and effective corrected allocation');
await call('/hrm/payroll/payments/'+linked.id+'/correction-request',{token:t,
 method:'POST',expected:409,body:{reason:'Không được phân bổ cùng một phiếu chi lần thứ hai'}});
const resolvedReviews=await call('/hrm/payroll/payments/corrections',{token:t});
assert(resolvedReviews.some(c=>c.id===correction.id&&c.resolution_action==='reallocate' &&
 c.resolution_reference===resolvePayload.evidence_reference&&c.target_slip_id===targetSlip.id),
 'Correction decision must retain immutable evidence and resolved target');
// A direct payment can only be marked VERIFIED; it cannot be reassigned.
const newPaymentCorrection=await call('/hrm/payroll/payments/'+firstPaid.id+'/correction-request',
 {token:t,method:'POST',expected:201,body:{reason:'Yêu cầu đối chiếu phương thức và chứng từ trước khi đóng'}});
const directRoute='/hrm/payroll/payments/corrections/'+newPaymentCorrection.id+'/resolve';
await call(directRoute,{token:t,method:'POST',expected:409,body:{
 ...resolvePayload,target_slip_id:targetSlip.id,
}});
const verified=await call(directRoute,{token:t,method:'POST',body:{
 action:'verified',resolution_note:'Đã kiểm tra giao dịch thực tế và xác nhận chứng từ là đúng',
 confirmation:'CONFIRM_LEDGER_REVIEW',
}});
assert(verified.status==='resolved'&&verified.target_slip_id===null,
 'Verified review must close alert without modifying payment allocation');
const unchanged=(await call('/hrm/payroll?month='+month,{token:t})).rows.find(r=>r.staff_id===staff.id);
assert(unchanged.paid_amount===200000&&unchanged.payment_status==='paid',
 'Verifying a direct payout must not alter its cash or balance');
assert((await call('/finance/cash-flows',{token:t})).length===originalCashCount,
 'Verified correction must not create cash movement');

const unrelatedRef='OTHER-'+unique+'-01';
await call('/finance/cash-flows',{token:t,method:'POST',body:{
 transaction_type:'out',category:'other',amount:10000,payment_method:'bank',
 payment_reference:unrelatedRef,branch_id:first.id,
}});
await call('/hrm/payroll/payments',{token:t,method:'POST',expected:409,
 body:{...form(10000,'bank',unrelatedRef,'other-expense'),slip_id:approvedLegacy.id}});
console.log('PASS: partial/full payroll, linked legacy voucher, correction review and duplicate expense reference guards');
