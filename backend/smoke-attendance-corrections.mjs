// Acceptance regression: branch-scoped attendance corrections with payroll immutability.
import Database from 'better-sqlite3';

const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3107/api';
const dbPath=process.env.SMOKE_DB_PATH||'./autotax.db';
const unique=String(Date.now()).slice(-8);
const assert=(value,msg)=>{if(!value)throw Error(msg);};
async function call(path,{token,method='GET',body,expected=200}={}){
  const response=await fetch(base+path,{method,headers:{
    'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  assert(response.status===expected,method+' '+path+' expected '+expected+
    ' got '+response.status+' '+JSON.stringify(data));
  return data;
}
const localParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',
}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const prior=new Date(Date.UTC(Number(localParts.year),Number(localParts.month)-2,1))
  .toISOString().slice(0,7);
const localTime=(day,time)=>prior+'-'+day+'T'+time;
const utcTime=(day,time)=>new Date(localTime(day,time)+':00+07:00')
  .toISOString().slice(0,19).replace('T',' ');
const owner=await call('/auth/register',{method:'POST',body:{
  phone:'09'+unique,name:'HRM Correction Owner',password:'HrCorrections2026!',sector:'retail',
}});
const t=owner.token,first=(await call('/branches',{token:t}))[0];
const second=await call('/branches',{token:t,method:'POST',body:{name:'Second correction branch'}});
async function addPerson(name,branch,permissions=[]){
  return call('/staff',{token:t,method:'POST',body:{
    name,username:name+'_'+unique,password:'HrCorrections2026!',role:'Quản lý',
    branch_id:branch.id,permissions,
  }});
}
const person=await addPerson('correction_worker',first);
const manager=await addPerson('correction_manager',first,['staff']);
const other=await addPerson('correction_other',second);
async function login(name){return (await call('/auth/staff-login',{method:'POST',body:{
 username:name+'_'+unique,password:'HrCorrections2026!',
}})).token;}
const workerT=await login('correction_worker');
const managerT=await login('correction_manager');
const otherT=await login('correction_other');
const form=(kind,day,start,end,shift_id)=>({
 correction_type:kind,proposed_check_in:localTime(day,start),
 proposed_check_out:localTime(day,end),
 shift_id,staff_id:other.id,branch_id:second.id,
 reason:'Đề nghị xác minh lại giờ công thực tế theo sổ giao ca',
});
await call('/hrm/attendance-corrections/me',{token:t,expected:403});
await call('/hrm/attendance-corrections',{token:workerT,expected:403});
await call('/hrm/attendance-corrections/me',{token:managerT});
await call('/hrm/pay-rates/'+person.id,{token:t,method:'PUT',body:{hourly_rate:50000}});
const created=await call('/hrm/attendance-corrections/me',{
 token:workerT,method:'POST',expected:201,
 body:form('new_shift','20','09:00','17:00',999999),
});
assert(created.branch_id===first.id,'Client supplied branch must be ignored');
await call('/hrm/attendance-corrections/me',{token:workerT,method:'POST',expected:409,
 body:form('new_shift','20','09:00','17:00')});
const pending=(await call('/hrm/payroll?month='+prior,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
assert(pending.pending_attendance_corrections===1,'Pending shift must block salary close');
await call('/hrm/payroll/approve',{token:t,method:'POST',expected:409,
 body:{month:prior,staff_id:person.id,branch_id:first.id}});
const allFirst=await call('/hrm/attendance-corrections',{token:managerT});
assert(allFirst.some(x=>x.id===created.id),'Manager should see same-branch correction');
await call('/hrm/attendance-corrections/'+created.id+'/decision',{
 token:workerT,method:'POST',expected:403,body:{decision:'approved'},
});
const foreign=await call('/hrm/attendance-corrections/me',{
 token:otherT,method:'POST',expected:201,
 body:form('new_shift','19','09:00','13:00'),
});
await call('/hrm/attendance-corrections/'+foreign.id+'/decision',{
 token:managerT,method:'POST',expected:403,body:{decision:'approved'},
});
assert((await call('/hrm/attendance-corrections',{token:managerT}))
 .every(x=>x.branch_id===first.id),'Manager list leaked foreign-branch request');
await call('/hrm/attendance-corrections/'+created.id+'/decision',{
 token:managerT,method:'POST',expected:200,body:{decision:'approved',note:'Đã xem sổ giao ca'},
});
await call('/hrm/attendance-corrections/'+created.id+'/decision',{
 token:managerT,method:'POST',expected:409,body:{decision:'approved'},
});
const hours=(await call('/hrm/payroll?month='+prior,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
assert(hours.work_seconds===28800&&hours.gross_salary===400000,
 'Created missing whole shift must count 8 hours at 50k/hour');
const correctionRow=(await call('/hrm/attendance-corrections/me',{token:workerT}))
 .find(x=>x.id===created.id);
assert(correctionRow?.applied_shift_id&&correctionRow.status==='approved',
 'Request history must retain applied shift ID');

// Create and review overlapping request: it is never allowed to double-count hours.
const overlap=await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:201,body:form('new_shift','20','12:00','15:00')});
await call('/hrm/attendance-corrections/'+overlap.id+'/decision',{
 token:managerT,method:'POST',expected:409,body:{decision:'approved'},
});
await call('/hrm/attendance-corrections/'+overlap.id+'/decision',{
 token:managerT,method:'POST',expected:400,body:{decision:'rejected',note:'no'},
});
await call('/hrm/attendance-corrections/'+overlap.id+'/decision',{
 token:managerT,method:'POST',body:{decision:'rejected',note:'Trùng ca đã chấm công'},
});

// Quên chấm ra on a real open shift, with original start unchanged.
const inShift=await call('/hrm/me/checkin',{token:workerT,method:'POST'});
const raw=new Database(dbPath);
raw.prepare("UPDATE shifts SET check_in=?,check_out=NULL,status='ACTIVE' WHERE id=?")
 .run(utcTime('21','09:00'),inShift.shift_id);
raw.close();
const forged=await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:404,body:form('missing_checkout','21','09:00','13:00',999999999)});
const missing=await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:201,
 body:form('missing_checkout','21','09:00','13:00',inShift.shift_id)});
await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:409,
 body:form('missing_checkout','21','10:00','13:00',inShift.shift_id)});
await call('/hrm/attendance-corrections/'+missing.id+'/decision',{
 token:managerT,method:'POST',body:{decision:'approved'},
});
const db2=new Database(dbPath);
const closed=db2.prepare('SELECT status,check_in,check_out FROM shifts WHERE id=?')
 .get(inShift.shift_id);
db2.close();
assert(closed.status==='CLOSED'&&closed.check_in===utcTime('21','09:00')&&
 closed.check_out===utcTime('21','13:00'),'Missing checkout approval must close shift with reviewed time');
const changed=await call('/hrm/attendance-corrections/me',{
 token:workerT,method:'POST',expected:201,
 body:form('adjust_shift','20','09:00','16:00',correctionRow.applied_shift_id),
});
const old=(await call('/hrm/payroll?month='+prior,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
assert(old.pending_attendance_corrections===1,'Adjusted closed shift must freeze salary close');
await call('/hrm/attendance-corrections/'+changed.id+'/decision',{
 token:managerT,method:'POST',body:{decision:'approved',note:'Đã so sánh sổ giao ca'},
});
const after=(await call('/hrm/payroll?month='+prior,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
assert(after.work_seconds===39600&&after.gross_salary===550000&&
 after.pending_attendance_corrections===0,
 'Reviewed clock adjustment must calculate 7+4=11 hours and clear pending flag');
// An employee with manager permissions cannot approve own hours.
const self=await call('/hrm/attendance-corrections/me',{token:managerT,
 method:'POST',expected:201,body:form('new_shift','22','09:00','12:00')});
await call('/hrm/attendance-corrections/'+self.id+'/decision',{
 token:managerT,method:'POST',expected:403,body:{decision:'approved'},
});
await call('/hrm/attendance-corrections/'+self.id+'/decision',{
 token:t,method:'POST',body:{decision:'rejected',note:'Không có chứng từ xác minh'},
});
await call('/hrm/attendance-corrections/'+foreign.id+'/decision',{
 token:t,method:'POST',body:{decision:'rejected',note:'Không đủ bằng chứng ca làm'},
});
// A reviewer must reject a stale correction if checkout changed after submission.
const stale=await call('/hrm/attendance-corrections/me',{token:workerT,method:'POST',
 expected:201,body:form('adjust_shift','21','09:00','12:00',inShift.shift_id)});
const staleDb=new Database(dbPath);
staleDb.prepare('UPDATE shifts SET check_out=? WHERE id=?')
 .run(utcTime('21','14:00'),inShift.shift_id);
staleDb.close();
await call('/hrm/attendance-corrections/'+stale.id+'/decision',{
 token:managerT,method:'POST',expected:409,body:{decision:'approved'}});
const rollbackDb=new Database(dbPath);
rollbackDb.prepare('UPDATE shifts SET check_out=? WHERE id=?')
 .run(utcTime('21','13:00'),inShift.shift_id);
rollbackDb.close();
await call('/hrm/attendance-corrections/'+stale.id+'/decision',{
 token:managerT,method:'POST',
 body:{decision:'rejected',note:'Bản chấm công gốc thay đổi sau khi gửi yêu cầu'},
});
// Overnight requests must block BOTH payroll months, not just the start month.
const [y,m]=prior.split('-').map(Number);
const nextMonth=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);
const lastDay=new Date(Date.UTC(y,m,0)).toISOString().slice(8,10);
const overnight=await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:201,body:{
 correction_type:'new_shift',
 proposed_check_in:prior+'-'+lastDay+'T23:00',
 proposed_check_out:nextMonth+'-01T02:00',
 reason:'Quên ghi ca xuyên tháng, đề nghị kiểm tra sổ giao ca',
 branch_id:second.id,staff_id:other.id,
}});
const left=(await call('/hrm/payroll?month='+prior,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
const right=(await call('/hrm/payroll?month='+nextMonth,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
assert(left.pending_attendance_corrections===1&&right.pending_attendance_corrections===1,
 'Cross-month pending shift must block approval in both calendar months');
await call('/hrm/payroll/approve',{token:t,method:'POST',expected:409,
 body:{month:prior,staff_id:person.id,branch_id:first.id}});
await call('/hrm/attendance-corrections/'+overnight.id+'/decision',{
 token:managerT,method:'POST',
 body:{decision:'rejected',note:'Chưa xác minh được ca làm xuyên kỳ lương'},
});

const approved=await call('/hrm/payroll/approve',{token:t,method:'POST',expected:201,
 body:{month:prior,staff_id:person.id,branch_id:first.id}});
assert(approved.gross_salary===550000,'Approved wages after correction incorrect');
await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:409,body:form('new_shift','23','09:00','12:00')});
await call('/hrm/attendance-corrections/me',{token:workerT,
 method:'POST',expected:409,
 body:form('adjust_shift','20','08:00','16:00',correctionRow.applied_shift_id)});
const stored=(await call('/hrm/payroll?month='+prior,{token:t})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
assert(stored.status==='approved'&&stored.gross_salary===550000,
 'Locked payroll snapshot must remain unchanged');
// Closed paid leave cannot receive overlapping shift after approval.
const leave=await call('/hrm/leave/me',{token:otherT,method:'POST',expected:201,
 body:{leave_date:prior+'-22',leave_type:'paid',minutes:480,note:'Phép đã thông báo'}}); 
await call('/hrm/leave/'+leave.id+'/decision',{token:t,method:'POST',body:{decision:'approved'}});
const paidLeaveShift=await call('/hrm/attendance-corrections/me',{token:otherT,method:'POST',
 expected:201,body:form('new_shift','22','09:00','12:00')});
await call('/hrm/attendance-corrections/'+paidLeaveShift.id+'/decision',{
 token:t,method:'POST',expected:409,body:{decision:'approved'},
});
await call('/hrm/attendance-corrections/'+paidLeaveShift.id+'/decision',{
 token:t,method:'POST',body:{decision:'rejected',note:'Ngày hưởng phép không được cộng công'}});
const tenant=await call('/auth/register',{method:'POST',body:{
 phone:'08'+unique,name:'Other Correction Tenant',password:'HrCorrections2026!',sector:'retail',
}});
await call('/hrm/attendance-corrections/'+created.id+'/decision',{
 token:tenant.token,method:'POST',expected:404,body:{decision:'approved'},
});
const allForeign=await call('/hrm/attendance-corrections',{token:tenant.token});
assert(allForeign.length===0,'Another company must not see requests');
console.log('PASS: staff shift correction, missing checkout, manager scope, overlap, leave, payroll locks and tenant isolation');
