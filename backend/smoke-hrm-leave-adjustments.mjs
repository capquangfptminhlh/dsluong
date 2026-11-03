import Database from 'better-sqlite3';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3107/api';
const id=String(Date.now()).slice(-8);
const ok=(v,m)=>{if(!v)throw Error(m);};
async function call(path,token,method='GET',body=null,status=200){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
 ...(body===null?{}:{body:JSON.stringify(body)})});const data=await r.json().catch(()=>({}));
 ok(r.status===status,`${method} ${path}: ${r.status} expected ${status} ${JSON.stringify(data)}`);
 return data;
}
const owner=await call('/auth/register',null,'POST',{phone:'09'+id,name:'Leave test tenant',password:'TestLeave2026!',sector:'retail'});
const t=owner.token;
const first=(await call('/branches',t))[0];
const other=await call('/branches',t,'POST',{name:'Payroll second location'});
async function employee(branch,name,permissions=[]){
 return call('/staff',t,'POST',{name,username:name+'_'+id,password:'TestLeave2026!',role:'Quản lý',permissions,branch_id:branch.id});
}
const a=await employee(first,'leave_person');
await employee(first,'leave_manager',['staff']);
const b=await employee(other,'leave_other');
async function login(name){return (await call('/auth/staff-login',null,'POST',{username:name+'_'+id,password:'TestLeave2026!'})).token;}
const staffToken=await login('leave_person'), mgr=await login('leave_manager'), otherToken=await login('leave_other');
const current=new Date();
const vn=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',
 year:'numeric',month:'2-digit'}).formatToParts(current).map(x=>[x.type,x.value]));
const prior=new Date(Date.UTC(Number(vn.year),Number(vn.month)-2,1)).toISOString().slice(0,7);
const date=prior+'-20';
const request={leave_date:date,leave_type:'paid',minutes:480,note:'Nghỉ có thông báo',staff_id:b.id,branch_id:other.id};
const leave=await call('/hrm/leave/me',staffToken,'POST',request,201);
ok(leave.branch_id===first.id,'Leave must use staff live assigned branch');
await call('/hrm/leave/me',staffToken,'POST',request,409);
const foreign=await call('/hrm/leave/me',otherToken,'POST',{...request,leave_date:prior+'-21',leave_type:'unpaid'},201);
await call('/hrm/leave/'+foreign.id+'/decision',mgr,'POST',{decision:'approved'},403);
await call('/hrm/leave/'+leave.id+'/decision',mgr,'POST',{decision:'approved'});
await call('/hrm/leave/'+leave.id+'/decision',mgr,'POST',{decision:'approved'},409);
const pending=await call('/hrm/leave/me',staffToken,'POST',{...request,leave_date:prior+'-22'},201);
const shift=await call('/hrm/checkin',t,'POST',{staff_id:a.id});
const db=new Database(process.env.SMOKE_DB_PATH||'./autotax.db');
db.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(prior+'-10 02:00:00',prior+'-10 06:00:00',shift.shift_id);
db.close();
const conflicting=await call('/hrm/leave/me',staffToken,'POST',
 {...request,leave_date:prior+'-10'},201);
await call('/hrm/leave/'+conflicting.id+'/decision',mgr,'POST',{decision:'approved'},409);
await call('/hrm/leave/'+conflicting.id+'/decision',mgr,'POST',{decision:'rejected'});
const managerScope=await call('/hrm/leave?month='+prior,mgr);
ok(managerScope.every(x=>x.branch_id===first.id),'Manager leaked another branch leave requests');
await call('/hrm/pay-rates/'+a.id,t,'PUT',{hourly_rate:50000});
const adjust=(category,amount,key)=>({month:prior,staff_id:a.id,branch_id:first.id,category,amount,
 note:'Điều chỉnh có lý do',idempotency_key:'payroll_'+id+'_'+key});
const allowance=await call('/hrm/adjustments',t,'POST',adjust('allowance',30000,'allow'),201);
await call('/hrm/adjustments',t,'POST',adjust('allowance',30000,'allow'),409);
await call('/hrm/adjustments',mgr,'POST',adjust('deduction',10000,'forbid'),403);
await call('/hrm/adjustments',t,'POST',adjust('overtime',20000,'overtime'),201);
await call('/hrm/adjustments',t,'POST',adjust('deduction',10000,'deduction'),201);
const disposable=await call('/hrm/adjustments',t,'POST',adjust('allowance',9000,'cancel'),201);
await call('/hrm/adjustments/'+disposable.id+'/void',t,'POST',{});
await call('/hrm/adjustments/'+disposable.id+'/void',t,'POST',{},409);
const auditTrail=await call('/hrm/adjustments?month='+prior+'&branch_id='+first.id,t);
ok(auditTrail.some(x=>x.id===disposable.id&&x.status==='void'),'Voided adjustment must remain visible');
const row=(await call('/hrm/payroll?month='+prior,t)).rows.find(x=>x.staff_id===a.id&&x.branch_id===first.id);
ok(row.work_seconds===14400&&row.paid_leave_minutes===480&&row.base_salary===600000&&
 row.gross_salary===650000&&row.payable_estimate===640000&&row.pending_leave_requests===1,
 'Paid leave / adjustments arithmetic incorrect '+JSON.stringify(row));
await call('/hrm/payroll/approve',t,'POST',{month:prior,staff_id:a.id,branch_id:first.id},409);
await call('/hrm/leave/'+pending.id+'/decision',mgr,'POST',{decision:'rejected'});
const frozen=await call('/hrm/payroll/approve',t,'POST',{month:prior,staff_id:a.id,branch_id:first.id},201);
ok(frozen.payable_estimate===640000&&frozen.payment_status==='unpaid','Approval must be unpaid snapshot');
await call('/hrm/adjustments/'+allowance.id+'/void',t,'POST',{},409);
await call('/hrm/leave/me',staffToken,'POST',{...request,leave_date:prior+'-25'},409);
await call('/hrm/pay-rates/'+a.id,t,'PUT',{hourly_rate:90000});
const approved=(await call('/hrm/payroll?month='+prior,t)).rows.find(x=>x.staff_id===a.id&&x.branch_id===first.id);
ok(approved.status==='approved'&&approved.gross_salary===650000&&approved.payable_estimate===640000,
 'Approved payroll changed after salary rate update');
console.log('PASS: HRM leave approvals, adjustment idempotency, salary calculation, frozen history');
