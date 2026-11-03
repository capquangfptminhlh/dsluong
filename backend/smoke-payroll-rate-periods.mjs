// Monthly-effective pay-rate regression across past, current and future periods.
import Database from 'better-sqlite3';

const base=process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3107/api';
const dbFile=process.env.SMOKE_DB_PATH || './autotax.db';
const nonce=String(Date.now()).slice(-8);
const ok=(condition,why)=>{if(!condition)throw Error(why);};
async function call(path,{token,method='GET',body,expected=200}={}){
  const r=await fetch(base+path,{method,headers:{
    'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await r.json().catch(()=>({}));
  ok(r.status===expected,method+' '+path+' expected '+expected+', got '+r.status+' '+JSON.stringify(value));
  return value;
}
function shiftMonth(month,day=10){return month+'-'+day+' 02:00:00';}
const v=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',
}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const current=v.year+'-'+v.month;
const p1=new Date(Date.UTC(Number(v.year),Number(v.month)-2,1)).toISOString().slice(0,7);
const p2=new Date(Date.UTC(Number(v.year),Number(v.month)-3,1)).toISOString().slice(0,7);
const future=new Date(Date.UTC(Number(v.year),Number(v.month),1)).toISOString().slice(0,7);
const owner=await call('/auth/register',{method:'POST',body:{
 phone:'09'+nonce,name:'Historical Salary Rate Tenant',
 password:'EffectiveRate2026!',sector:'retail',
}});
const token=owner.token;
const first=(await call('/branches',{token}))[0];
const person=await call('/staff',{token,method:'POST',body:{
 name:'Employee Rate History',username:'rate_employee_'+nonce,
 password:'EffectiveRate2026!',role:'Thu ngân',branch_id:first.id,
 permissions:[],
}});
const staffLogin=await call('/auth/staff-login',{method:'POST',body:{
 username:'rate_employee_'+nonce,password:'EffectiveRate2026!',
}});
const staffToken=staffLogin.token;
const checkin=await call('/hrm/checkin',{token,method:'POST',body:{staff_id:person.id}});
const db=new Database(dbFile);
db.prepare("UPDATE shifts SET check_in=?,check_out=?,status='CLOSED' WHERE id=?")
 .run(shiftMonth(p2),p2+'-10 06:00:00',checkin.shift_id);
db.close();
const rateUrl='/hrm/pay-rates/'+person.id;
const sheet=async(month)=>(await call('/hrm/payroll?month='+month,{token})).rows
 .find(x=>x.staff_id===person.id&&x.branch_id===first.id);
await call('/hrm/pay-rates?month='+p2,{token:staffToken,expected:403});
await call(rateUrl+'/history',{token:staffToken,expected:403});
// First setup preserves prior-month compatibility using an explicit 2020-01 baseline.
const initial=await call(rateUrl,{token,method:'PUT',body:{hourly_rate:50000}});
ok(initial.effective_month==='2020-01','First pay rate must have baseline month');
const oldSheet=await sheet(p2);
ok(oldSheet.work_seconds===14400&&oldSheet.gross_salary===200000&&
 oldSheet.rate_effective_month==='2020-01','Historical baseline calculation failed');
await call(rateUrl,{token:staffToken,method:'PUT',expected:403,body:{hourly_rate:90000}});
await call(rateUrl,{token,method:'PUT',expected:400,
 body:{effective_month:'2026-13',hourly_rate:70000}});
await call(rateUrl,{token,method:'PUT',body:{
 effective_month:current,hourly_rate:90000,
}});
const oldAgain=await sheet(p2);
ok(oldAgain.gross_salary===200000&&oldAgain.hourly_rate===50000,
 'Changing salary this month must not recalculate older unapproved month');
const todayRow=await sheet(current);
ok(todayRow.rate_effective_month===current&&todayRow.hourly_rate===90000,
 'Current salary must use this month new rate');
await call(rateUrl,{token,method:'PUT',body:{
 effective_month:p1,hourly_rate:60000,
}});
ok((await sheet(p2)).hourly_rate===50000,
 'New rate backdated one month must not affect earlier month');
ok((await sheet(p1)).hourly_rate===60000,
 'Backdated period must affect selected unapproved month');
ok((await sheet(current)).hourly_rate===90000,
 'Backdated period must not replace newer effective wage');
await call(rateUrl,{token,method:'PUT',body:{
 effective_month:future,salary_type:'monthly',monthly_salary:10000000,
 standard_hours:200,
}});
const todayAgain=await sheet(current);
ok(todayAgain.salary_type==='hourly'&&todayAgain.hourly_rate===90000,
 'Future monthly contract must not apply early');
const futureRate=(await call('/hrm/pay-rates?month='+future,{token}))
 .find(x=>x.staff_id===person.id);
ok(futureRate.salary_type==='monthly'&&futureRate.monthly_salary===10000000&&
 futureRate.rate_effective_month===future,
 'Future month contract was not selected correctly');
const prevRate=(await call('/hrm/pay-rates?month='+p2,{token}))
 .find(x=>x.staff_id===person.id);
ok(prevRate.hourly_rate===50000&&prevRate.rate_effective_month==='2020-01',
 'Owner month-selected pay rate query incorrect');
const history=(await call(rateUrl+'/history',{token})).rows;
ok(history.length===4&&history.map(x=>x.effective_month).join(',')===
 [future,current,p1,'2020-01'].join(','),
 'Effective history order or contents incorrect '+JSON.stringify(history));
const auditSql=new Database(dbFile);
const logs=auditSql.prepare(`
 SELECT action,detail FROM audit_log WHERE user_id=? AND action='hrm.rate.period.update'
 ORDER BY id DESC
`).all('09'+nonce);
auditSql.close();
ok(logs.length>=4,'Every pay-rate write must retain audit evidence');
const approval=await call('/hrm/payroll/approve',{token,method:'POST',expected:201,body:{
 month:p2,staff_id:person.id,branch_id:first.id,
}});
ok(approval.gross_salary===200000,
 'Frozen payroll must use historical contract rate');
await call(rateUrl,{token,method:'PUT',expected:409,body:{
 effective_month:p2,hourly_rate:75000,
}});
await call(rateUrl,{token,method:'PUT',body:{
 effective_month:current,hourly_rate:95000,
}});
const closed=await sheet(p2);
ok(closed.status==='approved'&&closed.hourly_rate===50000&&
 closed.gross_salary===200000&&closed.rate_effective_month==='2020-01',
 'Approved salary snapshot changed after current rate update');
// A tenant cannot inspect employee wage history from another company.
const foreign=await call('/auth/register',{method:'POST',body:{
 phone:'08'+nonce,name:'Other Wage Tenant',password:'EffectiveRate2026!',sector:'retail',
}});
await call(rateUrl+'/history',{token:foreign.token,expected:404});
await call(rateUrl,{token:foreign.token,method:'PUT',expected:404,
 body:{hourly_rate:999999,effective_month:current}});
console.log('PASS: effective-month salary rates, history, baseline migration, prior drafts, future schedules, snapshots and access control');
