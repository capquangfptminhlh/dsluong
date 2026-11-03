// Branch HRM/payroll acceptance: isolated, additive historical timesheet checks.
import Database from 'better-sqlite3';
const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3107/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';
const assert = (v, message) => { if (!v) throw new Error(message); };
async function call(path, { token, method='GET', body, expected=200 }={}) {
  const r=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await r.json().catch(()=>({}));
  assert(r.status===expected, method+' '+path+': expected '+expected+', got '+r.status+' '+JSON.stringify(value));
  return value;
}
const unique=String(Date.now()).slice(-8);
const owner=await call('/auth/register',{method:'POST',body:{
  phone:'09'+unique, name:'Payroll multi-branch tenant',password:'PayrollBranch2026!',sector:'retail',
}});
const token=owner.token;
const branches=await call('/branches',{token});
const first=branches[0];
const other=await call('/branches',{token,method:'POST',body:{name:'Payroll location two'}});
const staffA=await call('/staff',{token,method:'POST',body:{
  name:'Worker One', username:'pay_staff_a_'+unique,password:'PayrollBranch2026!',
  role:'Thu ngân',permissions:['staff'],branch_id:first.id,
}});
const mgrA=await call('/staff',{token,method:'POST',body:{
  name:'Manager One', username:'pay_mgr_'+unique,password:'PayrollBranch2026!',
  role:'Quản lý',permissions:['staff'],branch_id:first.id,
}});
const staffB=await call('/staff',{token,method:'POST',body:{
  name:'Worker Two',username:'pay_staff_b_'+unique,password:'PayrollBranch2026!',
  role:'Thu ngân',permissions:['staff'],branch_id:other.id,
}});
const managerLogin=await call('/auth/staff-login',{method:'POST',body:{
  username:'pay_mgr_'+unique,password:'PayrollBranch2026!',
}});
const mgrToken=managerLogin.token;
await call('/hrm/payroll?month=2026-10',{token:mgrToken,expected:403});
await call('/hrm/pay-rates',{token:mgrToken,expected:403});
await call('/hrm/checkin',{token:mgrToken,method:'POST',expected:403,
  body:{staff_id:staffB.id}});
await call('/hrm/checkin',{token:mgrToken,method:'POST',expected:403,
  body:{staff_id:staffA.id,branch_id:other.id}});
const aCheckin=await call('/hrm/checkin',{token:mgrToken,method:'POST',body:{staff_id:staffA.id}});
assert(Number(aCheckin.branch_id)===first.id,'Attendance must snapshot branch one');
await call('/hrm/checkin',{token:mgrToken,method:'POST',expected:409,body:{staff_id:staffA.id}});
const bCheckin=await call('/hrm/checkin',{token,method:'POST',body:{staff_id:staffB.id}});
assert(Number(bCheckin.branch_id)===other.id,'Attendance branch two missing');
await call('/hrm/checkout',{token:mgrToken,method:'POST',expected:403,body:{shift_id:bCheckin.shift_id}});
await call('/hrm/checkout',{token:mgrToken,method:'POST',body:{shift_id:aCheckin.shift_id}});
await call('/hrm/checkout',{token,method:'POST',body:{shift_id:bCheckin.shift_id}});

const mShifts=await call('/hrm',{token:mgrToken});
assert(mShifts.some(s=>s.id===aCheckin.shift_id) && mShifts.every(s=>Number(s.branch_id)===first.id),
  'Manager leaked other branch attendance');

const db=new Database(DB_PATH);
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit',
}).formatToParts(new Date()).map((part) => [part.type, part.value]));
const thisMonth = parts.year + '-' + parts.month;
const priorDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 2, 1));
const month = priorDate.toISOString().slice(0, 7);
db.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?").run(
  month+'-10 02:00:00',month+'-10 06:00:00',aCheckin.shift_id,
);
db.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?").run(
  month+'-11 03:00:00',month+'-11 05:00:00',bCheckin.shift_id,
);
db.close();
await call('/hrm/pay-rates/'+staffA.id,{token,method:'PUT',body:{hourly_rate:50000}});
await call('/hrm/pay-rates/'+staffB.id,{token,method:'PUT',body:{
  salary_type:'monthly',monthly_salary:10000000,standard_hours:200,
}});
await call('/hrm/pay-rates/'+staffB.id,{token:mgrToken,method:'PUT',expected:403,
  body:{hourly_rate:999999}});
const allPayroll=await call('/hrm/payroll?month='+month,{token});
const firstRow=allPayroll.rows.find(r=>r.staff_id===staffA.id && r.branch_id===first.id);
const secondRow=allPayroll.rows.find(r=>r.staff_id===staffB.id && r.branch_id===other.id);
assert(firstRow && firstRow.work_seconds===14400 && firstRow.gross_salary===200000,
  'Worker One payroll must be 4 hours × 50,000 VND');
assert(secondRow && secondRow.work_seconds===7200 && secondRow.gross_salary===100000 &&
  secondRow.salary_type==='monthly' && secondRow.standard_hours===200,
  'Worker Two monthly payroll must be 10m × 2 / 200 hours');
const onlyFirst=await call('/hrm/payroll?month='+month+'&branch_id='+first.id,{token});
assert(onlyFirst.rows.every(r=>r.branch_id===first.id),'Owner branch filter leaked other location');
await call('/hrm/payroll/approve',{token:mgrToken,method:'POST',expected:403,
  body:{month,staff_id:staffA.id,branch_id:first.id}});
const approval=await call('/hrm/payroll/approve',{token,method:'POST',expected:201,
  body:{month,staff_id:staffA.id,branch_id:first.id}});
assert(approval.gross_salary===200000 && approval.payment_status==='unpaid',
  'Owner approval must snapshot payroll but not pay it');
await call('/hrm/payroll/approve',{token,method:'POST',expected:409,
  body:{month,staff_id:staffA.id,branch_id:first.id}});
const bApproval=await call('/hrm/payroll/approve',{token,method:'POST',expected:201,
  body:{month,staff_id:staffB.id,branch_id:other.id}});
assert(bApproval.gross_salary===100000 && bApproval.payment_status==='unpaid',
  'Prorated monthly salary must be approved without marking paid');
await call('/hrm/pay-rates/'+staffB.id,{token,method:'PUT',body:{
  salary_type:'monthly',monthly_salary:18000000,standard_hours:180,
}});
await call('/hrm/pay-rates/'+staffA.id,{token,method:'PUT',body:{hourly_rate:75000}});
const afterRate=await call('/hrm/payroll?month='+month,{token});
const approved=afterRate.rows.find(r=>r.staff_id===staffA.id && r.branch_id===first.id);
assert(approved.status==='approved' && approved.gross_salary===200000 && approved.hourly_rate===50000,
  'Approving must freeze original wage snapshot despite rate changes');
const bApproved=afterRate.rows.find(r=>r.staff_id===staffB.id && r.branch_id===other.id);
assert(bApproved.status==='approved' && bApproved.gross_salary===100000 &&
  bApproved.monthly_salary===10000000 && bApproved.standard_hours===200,
  'Monthly contract and wage basis must remain frozen after change');
await call('/staff/'+staffA.id,{token,method:'PUT',body:{branch_id:other.id}});
const newAttendance=await call('/hrm',{token:mgrToken});
assert(newAttendance.some(r=>r.id===aCheckin.shift_id && r.branch_id===first.id),
  'Historical attendance branch must survive staff reassignment');
const afterMove=await call('/hrm/payroll?month='+month,{token});
assert(afterMove.rows.some(r=>r.staff_id===staffA.id && r.branch_id===first.id &&
  r.gross_salary===200000),'Reassignment cannot reattribute approved wages');
await call('/hrm/payroll/approve',{token,method:'POST',expected:409,
  body:{month:thisMonth,staff_id:staffB.id,branch_id:other.id}});
const staffSelfLogin=await call('/auth/staff-login',{method:'POST',body:{
  username:'pay_staff_a_'+unique,password:'PayrollBranch2026!',
}});
const otherSelfLogin=await call('/auth/staff-login',{method:'POST',body:{
  username:'pay_staff_b_'+unique,password:'PayrollBranch2026!',
}});
await call('/hrm/me',{token,expected:403});
const myBefore=await call('/hrm/me',{token:staffSelfLogin.token});
assert(myBefore.history.some(x=>x.id===aCheckin.shift_id && x.branch_id===first.id),
  'Employee must see their own past attendance from previous branch');
const selfIn=await call('/hrm/me/checkin',{token:staffSelfLogin.token,method:'POST',body:{
  staff_id:staffB.id,branch_id:first.id,
}});
assert(selfIn.branch_id===other.id,'Self check-in must ignore forged staff_id / branch_id');
await call('/hrm/me/checkin',{token:staffSelfLogin.token,method:'POST',expected:409,body:{}});
const otherHistory=await call('/hrm/me',{token:otherSelfLogin.token});
assert(otherHistory.history.every(x=>x.staff_id===staffB.id),
  'Employee self history must not expose other employees');
await call('/hrm/me/checkout',{token:staffSelfLogin.token,method:'POST',body:{}});
const closedSelf=await call('/hrm/me',{token:staffSelfLogin.token});
assert(closedSelf.active===null && closedSelf.history.some(x=>x.id===selfIn.shift_id &&
  x.branch_id===other.id && x.status==='CLOSED'),
  'Self-checkout must close only the employee’s own active shift');
console.log('PASS: per-branch timekeeping, employee self-attendance, rate privacy and payroll approval');
