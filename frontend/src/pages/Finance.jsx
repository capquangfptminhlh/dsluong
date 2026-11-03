import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDollarSign, Landmark, Plus, Receipt, RefreshCcw, X } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} ₫`;
const paymentMethodLabel = (method) => ({ cash: 'Tiền mặt', bank: 'Chuyển khoản', card: 'Thẻ', other: 'Khác', unknown: 'Chưa xác định' }[method] || 'Chưa xác định');

export default function Finance() {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pnl, setPnl] = useState({ revenue: 0, expense: 0, profit: 0 });
  const [debts, setDebts] = useState([]);
  const [cashFlows, setCashFlows] = useState([]);
  const [modal, setModal] = useState(null);
  const [debtForm, setDebtForm] = useState({ type: 'receivable', partner_name: '', amount: '', due_date: '', notes: '' });
  const [cashForm, setCashForm] = useState({ transaction_type: 'in', category: 'other', amount: '', payment_method: '', payment_reference: '', notes: '' });
  const [payingDebt, setPayingDebt] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payReference, setPayReference] = useState('');
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const cashSavingRef = useRef(false);
  const debtSavingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      axios.get(`${API_BASE}/api/finance/pnl`),
      axios.get(`${API_BASE}/api/finance/debts`),
      axios.get(`${API_BASE}/api/finance/cash-flows`),
    ]);
    const [pnlResult, debtResult, cashResult] = results;
    if (pnlResult.status === 'fulfilled') setPnl(pnlResult.value.data || { revenue: 0, expense: 0, profit: 0 });
    if (debtResult.status === 'fulfilled') setDebts(debtResult.value.data || []);
    if (cashResult.status === 'fulfilled') setCashFlows(cashResult.value.data || []);
    const failed = results.filter((item) => item.status === 'rejected').length;
    if (failed) setError(`${failed}/3 nguồn dữ liệu tài chính chưa phản hồi. AutoTax không thay bằng số liệu giả.`);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const debtSummary = useMemo(() => debts.reduce((summary, debt) => {
    const remain = Math.max(0, Number(debt.amount || 0) - Number(debt.paid_amount || 0));
    if (debt.type === 'receivable') summary.receivable += remain;
    else summary.payable += remain;
    return summary;
  }, { receivable: 0, payable: 0 }), [debts]);

  const debtPartnerName = debtForm.partner_name.trim();
  const debtAmountNumber = debtForm.amount.trim() === '' ? 0 : Number(debtForm.amount);
  const debtAmountInvalid = !Number.isFinite(debtAmountNumber) || debtAmountNumber <= 0;
  const debtFormValid = ['receivable', 'payable'].includes(debtForm.type)
    && Boolean(debtPartnerName)
    && !debtAmountInvalid
    && !saving;

  const cashAmountNumber = cashForm.amount.trim() === '' ? 0 : Number(cashForm.amount);
  const cashAmountInvalid = !Number.isFinite(cashAmountNumber) || cashAmountNumber <= 0;
  const cashFormValid = !cashAmountInvalid && Boolean(cashForm.payment_method) && !saving;

  const saveDebt = async (event) => {
    event.preventDefault();
    if (debtSavingRef.current) return;
    const amount = debtForm.amount.trim() === '' ? 0 : Number(debtForm.amount);
    const partnerName = debtForm.partner_name.trim();
    if (!['receivable', 'payable'].includes(debtForm.type)) return setError('Loại công nợ không hợp lệ.');
    if (!partnerName) return setError('Tên đối tác không được để trống.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Số tiền công nợ phải là số hợp lệ lớn hơn 0.');

    debtSavingRef.current = true;
    setSaving(true); setError('');
    try {
      await axios.post(`${API_BASE}/api/finance/debts`, {
        type: debtForm.type,
        partner_name: partnerName,
        amount,
        due_date: debtForm.due_date.trim() || null,
        notes: debtForm.notes.trim() || null,
      });
      setDebtForm({ type: 'receivable', partner_name: '', amount: '', due_date: '', notes: '' });
      setModal(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không tạo được công nợ.');
    } finally {
      debtSavingRef.current = false;
      setSaving(false);
    }
  };

  const saveCashFlow = async (event) => {
    event.preventDefault();
    if (cashSavingRef.current) return;
    const amount = cashForm.amount.trim() === '' ? 0 : Number(cashForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Số tiền thu/chi phải là số hợp lệ lớn hơn 0.');
    if (!cashForm.payment_method) return setError('Hãy chọn hình thức thanh toán để sổ quỹ ghi đúng dữ liệu.');

    cashSavingRef.current = true;
    setSaving(true); setError('');
    try {
      await axios.post(`${API_BASE}/api/finance/cash-flows`, {
        ...cashForm,
        amount,
        payment_reference: cashForm.payment_reference.trim() || null,
      });
      setCashForm({ transaction_type: 'in', category: 'other', amount: '', payment_method: '', payment_reference: '', notes: '' });
      setModal(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không ghi được phiếu thu/chi.');
    } finally {
      cashSavingRef.current = false;
      setSaving(false);
    }
  };

  const openDebtPayment = (debt) => {
    const remain = Math.max(0, Number(debt.amount || 0) - Number(debt.paid_amount || 0));
    payingRef.current = false;
    setPaying(false);
    setPayingDebt(debt);
    setPayAmount(String(remain));
    setPayMethod('');
    setPayReference('');
    setError('');
  };

  const closeDebtPayment = () => {
    if (payingRef.current) return;
    setPayingDebt(null);
    setPayAmount('');
    setPayMethod('');
    setPayReference('');
  };

  const payRemaining = payingDebt
    ? Math.max(0, Number(payingDebt.amount || 0) - Number(payingDebt.paid_amount || 0))
    : 0;
  const payAmountNumber = payAmount.trim() === '' ? 0 : Number(payAmount);
  const payAmountInvalid = !Number.isFinite(payAmountNumber) || payAmountNumber <= 0 || payAmountNumber > payRemaining;
  const payFormValid = Boolean(payingDebt) && !payAmountInvalid && Boolean(payMethod) && !paying;

  const payDebt = async (event) => {
    event.preventDefault();
    if (!payingDebt || payingRef.current) return;
    const amount = payAmount.trim() === '' ? 0 : Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Số tiền thanh toán phải là số hợp lệ lớn hơn 0.');
    if (amount > payRemaining) return setError(`Số tiền thanh toán không được vượt ${money(payRemaining)} còn lại.`);
    if (!payMethod) return setError('Hãy chọn hình thức thanh toán để sổ quỹ ghi đúng dữ liệu.');

    payingRef.current = true;
    setPaying(true);
    setError('');
    try {
      await axios.post(`${API_BASE}/api/finance/debts/${payingDebt.id}/pay`, {
        paid_amount: amount,
        payment_method: payMethod,
        payment_reference: payReference.trim() || null,
      });
      setPayingDebt(null);
      setPayAmount('');
      setPayMethod('');
      setPayReference('');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không cập nhật được thanh toán công nợ.');
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  const cards = [
    ['Doanh thu ghi nhận', pnl.revenue, CircleDollarSign, 'Từ nguồn tài chính/POS mà backend đã ghi nhận'],
    ['Chi phí ghi nhận', pnl.expense, ArrowUpRight, 'Không bao gồm khoản thu/chi trả công nợ'],
    ['Kết quả hiện tại', pnl.profit, Landmark, 'Doanh thu trừ chi phí đã ghi nhận'],
    ['Phải thu còn lại', debtSummary.receivable, Receipt, `Phải trả: ${money(debtSummary.payable)}`],
  ];

  return (
    <div className="pb-8">
      <div className="page-header">
        <div><h2 className="page-title">Tài chính & công nợ</h2><p className="page-subtitle">Chỉ hiển thị dữ liệu backend thực tế; khi API lỗi hệ thống báo lỗi thay vì dựng KPI.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Làm mới</button>
          <button type="button" className="btn-primary" onClick={() => setModal('cash')}><Plus className="h-4 w-4" />Phiếu thu/chi</button>
        </div>
      </div>

      {error && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}

      <div className="mb-4 flex w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
        {[['overview', 'Tổng quan'], ['cash', 'Sổ quỹ'], ['debts', 'Công nợ']].map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`min-w-[120px] flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === value ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>{label}</button>)}
      </div>

      {tab === 'overview' && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon, note]) => <div key={label} className="metric-card"><div className="flex items-start justify-between"><div><div className="metric-label">{label}</div><div className="metric-value">{loading ? '—' : money(value)}</div></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-5 w-5" /></div></div><div className="mt-3 text-xs leading-5 text-slate-400">{note}</div></div>)}</div>}

      {tab === 'cash' && <section className="table-shell">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="text-sm font-bold text-slate-900">Sổ quỹ</div><div className="text-xs text-slate-400">Các phiếu thu/chi đã ghi nhận</div></div><button type="button" className="btn-secondary" onClick={() => setModal('cash')}><Plus className="h-4 w-4" />Tạo phiếu</button></div>
        <div className="overflow-x-auto"><table className="min-w-[920px] w-full"><thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left">Thời gian</th><th className="px-5 py-3 text-left">Loại</th><th className="px-5 py-3 text-left">Khoản mục</th><th className="px-5 py-3 text-left">Hình thức</th><th className="px-5 py-3 text-right">Số tiền</th><th className="px-5 py-3 text-left">Ghi chú</th></tr></thead><tbody className="divide-y divide-slate-100">{cashFlows.map((flow) => <tr key={flow.id}><td className="px-5 py-3 text-sm text-slate-500">{flow.created_at ? new Date(flow.created_at).toLocaleString('vi-VN') : '—'}</td><td className="px-5 py-3"><span className={`status-pill ${flow.transaction_type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{flow.transaction_type === 'in' ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{flow.transaction_type === 'in' ? 'Thu' : 'Chi'}</span></td><td className="px-5 py-3 text-sm font-semibold text-slate-700">{flow.category || 'other'}</td><td className="px-5 py-3 text-sm font-semibold text-slate-700">{paymentMethodLabel(flow.payment_method)}</td><td className="px-5 py-3 text-right text-sm font-extrabold text-slate-900">{money(flow.amount)}</td><td className="px-5 py-3 text-sm text-slate-500">{flow.notes || '—'}</td></tr>)}{!cashFlows.length && !loading && <tr><td colSpan="6" className="px-5 py-12 text-center text-sm text-slate-400">Chưa có phiếu thu/chi.</td></tr>}</tbody></table></div>
      </section>}

      {tab === 'debts' && <section className="table-shell">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="text-sm font-bold text-slate-900">Công nợ</div><div className="text-xs text-slate-400">Phải thu và phải trả theo đối tác</div></div><button type="button" className="btn-secondary" onClick={() => setModal('debt')}><Plus className="h-4 w-4" />Ghi nợ</button></div>
        <div className="overflow-x-auto"><table className="min-w-[920px] w-full"><thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left">Loại</th><th className="px-5 py-3 text-left">Đối tác</th><th className="px-5 py-3 text-right">Tổng nợ</th><th className="px-5 py-3 text-right">Đã trả</th><th className="px-5 py-3 text-right">Còn lại</th><th className="px-5 py-3 text-center">Trạng thái</th><th className="px-5 py-3 text-center">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{debts.map((debt) => { const remain = Math.max(0, Number(debt.amount || 0) - Number(debt.paid_amount || 0)); return <tr key={debt.id}><td className="px-5 py-3 text-sm font-semibold text-slate-600">{debt.type === 'receivable' ? 'Phải thu' : 'Phải trả'}</td><td className="px-5 py-3 text-sm font-bold text-slate-800">{debt.partner_name}</td><td className="px-5 py-3 text-right text-sm text-slate-600">{money(debt.amount)}</td><td className="px-5 py-3 text-right text-sm text-slate-600">{money(debt.paid_amount)}</td><td className="px-5 py-3 text-right text-sm font-extrabold text-slate-900">{money(remain)}</td><td className="px-5 py-3 text-center"><span className={`status-pill ${debt.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{debt.status === 'paid' && <CheckCircle2 className="h-3.5 w-3.5" />}{debt.status || 'open'}</span></td><td className="px-5 py-3 text-center"><button type="button" className="text-xs font-bold text-blue-600 disabled:text-slate-300" disabled={remain <= 0} onClick={() => openDebtPayment(debt)}>Thanh toán</button></td></tr>; })}{!debts.length && !loading && <tr><td colSpan="7" className="px-5 py-12 text-center text-sm text-slate-400">Chưa có công nợ.</td></tr>}</tbody></table></div>
      </section>}

      {modal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={modal === 'debt' ? saveDebt : saveCashFlow} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-extrabold text-slate-900">{modal === 'debt' ? 'Ghi nhận công nợ' : 'Tạo phiếu thu/chi'}</h3><button type="button" className="icon-btn" disabled={saving} onClick={() => setModal(null)}><X className="h-5 w-5" /></button></div>{modal === 'debt' ? <div className="mt-5 grid gap-3"><select value={debtForm.type} disabled={saving} onChange={(e) => setDebtForm({ ...debtForm, type: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="receivable">Phải thu</option><option value="payable">Phải trả</option></select><div><input required disabled={saving} placeholder="Tên đối tác" value={debtForm.partner_name} onChange={(e) => setDebtForm({ ...debtForm, partner_name: e.target.value })} className={`w-full rounded-xl border px-3 py-2.5 outline-none ${debtForm.partner_name !== '' && !debtPartnerName ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'}`} />{debtForm.partner_name !== '' && !debtPartnerName && <div className="mt-1 text-xs font-semibold text-red-600">Tên đối tác không được chỉ có khoảng trắng.</div>}</div><div><input required min="1" step="1" disabled={saving} type="number" placeholder="Số tiền" value={debtForm.amount} onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })} className={`w-full rounded-xl border px-3 py-2.5 outline-none ${debtAmountInvalid ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'}`} />{debtAmountInvalid && debtForm.amount !== '' && <div className="mt-1 text-xs font-semibold text-red-600">Số tiền công nợ phải là số hợp lệ lớn hơn 0.</div>}</div><input type="date" disabled={saving} value={debtForm.due_date} onChange={(e) => setDebtForm({ ...debtForm, due_date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><textarea disabled={saving} placeholder="Ghi chú" value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">Ghi nợ chỉ tạo số dư phải thu/phải trả. Sổ quỹ và bằng chứng thanh toán chỉ được ghi khi thực sự thanh toán công nợ.</div></div> : <div className="mt-5 grid gap-3"><select value={cashForm.transaction_type} disabled={saving} onChange={(e) => setCashForm({ ...cashForm, transaction_type: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="in">Phiếu thu</option><option value="out">Phiếu chi</option></select><input required disabled={saving} placeholder="Khoản mục" value={cashForm.category} onChange={(e) => setCashForm({ ...cashForm, category: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><div><input required min="1" step="1" disabled={saving} type="number" placeholder="Số tiền" value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })} className={`w-full rounded-xl border px-3 py-2.5 outline-none ${cashAmountInvalid ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'}`} />{cashAmountInvalid && cashForm.amount !== '' && <div className="mt-1 text-xs font-semibold text-red-600">Số tiền phải là số hợp lệ lớn hơn 0.</div>}</div><select required disabled={saving} value={cashForm.payment_method} onChange={(e) => setCashForm({ ...cashForm, payment_method: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">-- Chọn hình thức thanh toán --</option><option value="cash">Tiền mặt</option><option value="bank">Chuyển khoản</option><option value="card">Thẻ</option><option value="other">Khác</option></select><input disabled={saving} placeholder="Mã tham chiếu (không bắt buộc)" value={cashForm.payment_reference} onChange={(e) => setCashForm({ ...cashForm, payment_reference: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><textarea disabled={saving} placeholder="Ghi chú" value={cashForm.notes} onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">Phiếu thu/chi và bằng chứng thanh toán được ghi trong cùng một giao dịch. Nếu một bước lỗi, toàn bộ giao dịch được hoàn tác.</div></div>}<button type="submit" className="btn-primary mt-5 w-full" disabled={saving || (modal === 'cash' && !cashFormValid) || (modal === 'debt' && !debtFormValid)}>{saving ? 'Đang lưu…' : 'Lưu'}</button></form></div>}

      {payingDebt && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onClick={closeDebtPayment}><form onSubmit={payDebt} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold text-slate-900">Thanh toán công nợ</h3><p className="mt-1 text-xs font-semibold text-slate-500">{payingDebt.type === 'receivable' ? 'Thu từ' : 'Chi trả cho'} · {payingDebt.partner_name}</p></div><button type="button" className="icon-btn" disabled={paying} onClick={closeDebtPayment}><X className="h-5 w-5" /></button></div><div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-sm font-bold text-slate-600">Còn phải thanh toán</span><span className="text-lg font-black text-slate-950">{money(payRemaining)}</span></div><div className="mt-4 grid gap-3"><label className="grid gap-1 text-sm font-bold text-slate-700">Số tiền<input required min="1" max={payRemaining} step="1" type="number" value={payAmount} disabled={paying} onChange={(e) => setPayAmount(e.target.value)} className={`rounded-xl border px-3 py-2.5 outline-none ${payAmountInvalid ? 'border-red-400' : 'border-slate-200 focus:border-blue-500'}`} />{payAmountInvalid && <span className="text-xs font-semibold text-red-600">Số tiền phải từ 1 đến {money(payRemaining)}.</span>}</label><label className="grid gap-1 text-sm font-bold text-slate-700">Hình thức thanh toán<select required value={payMethod} disabled={paying} onChange={(e) => setPayMethod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"><option value="">-- Chọn hình thức --</option><option value="cash">Tiền mặt</option><option value="bank">Chuyển khoản</option><option value="card">Thẻ</option><option value="other">Khác</option></select></label><label className="grid gap-1 text-sm font-bold text-slate-700">Mã tham chiếu <span className="text-xs font-normal text-slate-500">Không bắt buộc</span><input value={payReference} disabled={paying} onChange={(e) => setPayReference(e.target.value)} placeholder="VD: mã giao dịch ngân hàng" className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" /></label></div><div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">Khi xác nhận, AutoTax cập nhật công nợ, sổ quỹ và bằng chứng thanh toán trong cùng một giao dịch. Nếu một bước lỗi, toàn bộ giao dịch được hoàn tác.</div><div className="mt-4 flex gap-2"><button type="button" className="btn-secondary flex-1" disabled={paying} onClick={closeDebtPayment}>Hủy</button><button type="submit" className="btn-primary flex-[2]" disabled={!payFormValid}>{paying ? 'Đang thanh toán…' : 'Xác nhận thanh toán'}</button></div></form></div>}
    </div>
  );
}