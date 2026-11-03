import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, FileSearch, ReceiptText, RefreshCw,
  ShieldCheck, TriangleAlert, XCircle,
} from 'lucide-react';
import API_BASE from '../config/api';

const CASE_STATES = [
  ['OPEN', 'Mở'],
  ['NEED_DOCUMENT', 'Chờ bổ sung chứng từ'],
  ['UNDER_REVIEW', 'Đang rà soát'],
  ['RESOLVED', 'Đã xử lý'],
  ['CLOSED', 'Đã đóng'],
];

const CASE_LABELS = Object.fromEntries(CASE_STATES);
const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} đ`;

function severityClass(severity) {
  if (severity === 'HIGH') return 'bg-red-100 text-red-700 border-red-200';
  if (severity === 'MEDIUM') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-blue-700 border-blue-100';
}

function stateClass(status) {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'UNDER_REVIEW') return 'bg-indigo-100 text-indigo-700';
  if (status === 'NEED_DOCUMENT') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function SummaryCard({ icon: Icon, label, value, detail, tone = 'slate' }) {
  const toneClass = {
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  }[tone];
  return (
    <div className="surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`rounded-xl border p-2.5 ${toneClass}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
        </div>
      </div>
    </div>
  );
}

export default function AuditWorkbench() {
  const [findings, setFindings] = useState([]);
  const [cases, setCases] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [outputInvoices, setOutputInvoices] = useState([]);
  const [runningSalesScan, setRunningSalesScan] = useState(false);
  const [linkingOrder, setLinkingOrder] = useState(null);
  const [savingOutputInvoice, setSavingOutputInvoice] = useState(false);
  const [outputDraft, setOutputDraft] = useState({ seller_tax_code: '', invoice_number: '', invoice_symbol: '', invoice_date: '', vat_amount: 0, total_amount: 0 });
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [findingRes, caseRes, invoiceRes, salesRes, outputRes] = await Promise.all([
        axios.get(`${API_BASE}/api/audit-compliance/findings`),
        axios.get(`${API_BASE}/api/audit-compliance/cases`),
        axios.get(`${API_BASE}/api/audit-compliance/input-invoices`),
        axios.get(`${API_BASE}/api/audit-compliance/sales-reconciliation`),
        axios.get(`${API_BASE}/api/audit-compliance/output-invoices`),
      ]);
      setFindings(findingRes.data || []);
      setCases(caseRes.data || []);
      setInvoices(invoiceRes.data || []);
      setSalesRows(salesRes.data || []);
      setOutputInvoices(outputRes.data || []);
      setDrafts((current) => {
        const next = { ...current };
        (caseRes.data || []).forEach((item) => {
          if (!next[item.id]) next[item.id] = { status: item.status, note: item.note || '' };
        });
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được dữ liệu kiểm toán.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const open = findings.filter((item) => item.status === 'OPEN').length;
    const high = findings.filter((item) => item.status === 'OPEN' && item.severity === 'HIGH').length;
    const reviewing = cases.filter((item) => item.status === 'UNDER_REVIEW' || item.status === 'NEED_DOCUMENT').length;
    const missingOutput = salesRows.filter((item) => item.reconciliation_status === 'NO_OUTPUT_INVOICE_LINKED').length;
    return { open, high, reviewing, invoices: invoices.length, outputs: outputInvoices.length, missingOutput };
  }, [findings, cases, invoices, salesRows, outputInvoices]);

  const saveCase = async (item) => {
    const draft = drafts[item.id] || { status: item.status, note: item.note || '' };
    setSavingId(item.id);
    setError('');
    try {
      await axios.patch(`${API_BASE}/api/audit-compliance/cases/${item.id}/status`, {
        status: draft.status,
        note: draft.note.trim() || null,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Không cập nhật được hồ sơ kiểm toán.');
    } finally {
      setSavingId(null);
    }
  };

  const openOutputInvoiceLink = (row) => {
    let user = {};
    try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch {}
    setLinkingOrder(row);
    setOutputDraft({
      seller_tax_code: user.taxCode || '',
      invoice_number: '',
      invoice_symbol: '',
      invoice_date: '',
      vat_amount: 0,
      total_amount: Number(row.total_amount) || 0,
    });
  };

  const saveOutputInvoice = async (event) => {
    event.preventDefault();
    if (!linkingOrder) return;
    setSavingOutputInvoice(true);
    setError('');
    try {
      const totalAmount = Number(outputDraft.total_amount) || 0;
      const vatAmount = Number(outputDraft.vat_amount) || 0;
      await axios.post(`${API_BASE}/api/audit-compliance/output-invoices`, {
        pos_order_id: linkingOrder.id,
        invoice: {
          seller_tax_code: outputDraft.seller_tax_code.trim(),
          invoice_number: outputDraft.invoice_number.trim(),
          invoice_symbol: outputDraft.invoice_symbol.trim() || null,
          invoice_date: outputDraft.invoice_date,
          subtotal: Math.max(totalAmount - vatAmount, 0),
          vat_amount: vatAmount,
          total_amount: totalAmount,
          currency: 'VND',
        },
      });
      setLinkingOrder(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Không ghi nhận được hóa đơn đầu ra.');
    } finally {
      setSavingOutputInvoice(false);
    }
  };

  const runSalesReconciliation = async () => {
    setRunningSalesScan(true);
    setError('');
    try {
      await axios.post(`${API_BASE}/api/audit-compliance/sales-reconciliation/run`, {});
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Không chạy được đối chiếu doanh thu - hóa đơn đầu ra.');
    } finally {
      setRunningSalesScan(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="audit-workbench">
      <div className="page-header">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <ShieldCheck className="h-4 w-4" /> Bàn kiểm toán dữ liệu
          </div>
          <h1 className="page-title">Kiểm toán hóa đơn & chi phí</h1>
          <p className="page-subtitle">Rà soát sai lệch, gom hồ sơ cần xử lý và theo dõi vòng đời kiểm tra theo từng cửa hàng.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-secondary inline-flex items-center justify-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-bold">Phạm vi kết luận được giới hạn.</div>
            <div>AutoTax chỉ báo các vấn đề phát hiện được từ dữ liệu và rule đã được cấu hình, phê duyệt. Rule chưa có nguồn/phê duyệt sẽ không được tự suy đoán. Trạng thái an toàn là “chưa phát hiện vấn đề trong phạm vi kiểm tra hiện có”, không phải “100% hợp pháp”.</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <div className="flex items-center gap-2"><XCircle className="h-5 w-5" /> {error}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <SummaryCard icon={AlertTriangle} label="Cảnh báo đang mở" value={summary.open} detail="Finding chưa được giải quyết" tone="amber" />
        <SummaryCard icon={TriangleAlert} label="Mức cao" value={summary.high} detail="Ưu tiên kiểm tra trước" tone="red" />
        <SummaryCard icon={ClipboardCheck} label="Đang xử lý" value={summary.reviewing} detail="Chờ chứng từ hoặc đang rà soát" tone="indigo" />
        <SummaryCard icon={FileSearch} label="Hóa đơn đầu vào" value={summary.invoices} detail="Ledger hóa đơn đã nhập" tone="emerald" />
        <SummaryCard icon={ReceiptText} label="Đơn chưa liên kết HĐ" value={summary.missingOutput} detail={`${summary.outputs} hóa đơn đầu ra đã ghi nhận`} tone={summary.missingOutput ? 'amber' : 'emerald'} />
      </div>

      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-950">Hàng đợi hồ sơ kiểm toán</h2>
              <p className="mt-1 text-sm text-slate-500">Mỗi cảnh báo có một audit case để yêu cầu chứng từ, rà soát và đóng hồ sơ.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{cases.length} hồ sơ</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Đang tải hồ sơ kiểm toán…</div>
          ) : cases.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
              <div className="mt-3 font-bold text-slate-800">Chưa có hồ sơ cần xử lý</div>
              <div className="mt-1 text-sm text-slate-500">Không có nghĩa là mọi nghĩa vụ đều đã được xác minh; chỉ là chưa có finding trong phạm vi kiểm tra hiện tại.</div>
            </div>
          ) : cases.map((item) => {
            const draft = drafts[item.id] || { status: item.status, note: item.note || '' };
            return (
              <div key={item.id} className="p-4 sm:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px_minmax(220px,320px)_auto] xl:items-end">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${severityClass(item.severity)}`}>{item.severity || 'REVIEW'}</span>
                      <span className="font-mono text-xs font-bold text-slate-500">{item.finding_code}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${stateClass(item.status)}`}>{CASE_LABELS[item.status] || item.status}</span>
                    </div>
                    <div className="mt-2 font-semibold leading-6 text-slate-900">{item.message}</div>
                    <div className="mt-1 text-xs text-slate-500">Đối tượng: {item.subject_type} #{item.subject_id} · Case #{item.id}</div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-500">Trạng thái xử lý</span>
                    <select
                      value={draft.status}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, status: e.target.value } }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    >
                      {CASE_STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-500">Ghi chú xử lý</span>
                    <input
                      value={draft.note}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, note: e.target.value } }))}
                      placeholder="Ví dụ: chờ sao kê / đã đối chiếu XML…"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => saveCase(item)}
                    disabled={savingId === item.id}
                    className="btn-primary whitespace-nowrap disabled:opacity-60"
                  >
                    {savingId === item.id ? 'Đang lưu…' : 'Cập nhật hồ sơ'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface overflow-hidden" data-testid="sales-reconciliation">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-950">Đối chiếu hóa đơn đầu ra & doanh thu POS</h2>
              <p className="mt-1 text-sm text-slate-500">So khớp đơn bán đã thanh toán với hóa đơn đầu ra đã liên kết. Đây là kiểm tra dữ liệu, không tự kết luận vi phạm pháp lý.</p>
            </div>
            <button type="button" onClick={runSalesReconciliation} disabled={runningSalesScan || loading} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${runningSalesScan ? 'animate-spin' : ''}`} /> {runningSalesScan ? 'Đang quét…' : 'Quét đối chiếu'}
            </button>
          </div>
        </div>

        <div className="sm:hidden divide-y divide-slate-100">
          {salesRows.slice(0, 30).map((row) => {
            const missing = row.reconciliation_status === 'NO_OUTPUT_INVOICE_LINKED';
            const mismatch = row.reconciliation_status === 'MISMATCH';
            return (
              <div key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-900">{row.order_code}</div>
                    <div className="mt-1 text-xs text-slate-500">Đơn #{row.id} · {row.status || '—'}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${missing || mismatch ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {missing ? 'Chưa liên kết HĐ' : mismatch ? 'Có sai lệch' : 'Đã khớp'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div><div className="text-slate-400">Giá trị đơn</div><div className="mt-1 font-bold text-slate-800">{money(row.total_amount)}</div></div>
                  <div className="text-right"><div className="text-slate-400">Hóa đơn</div><div className="mt-1 font-bold text-slate-800">{row.invoice_id ? money(row.invoice_total) : '—'}</div></div>
                </div>
                {missing && <button type="button" onClick={() => openOutputInvoiceLink(row)} className="btn-secondary mt-3 w-full">Gắn hóa đơn đầu ra</button>}
              </div>
            );
          })}
          {!loading && salesRows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Chưa có đơn bán để đối chiếu.</div>}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3">Đơn bán</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Giá trị đơn</th><th className="px-5 py-3">Hóa đơn liên kết</th><th className="px-5 py-3 text-right">Giá trị HĐ</th><th className="px-5 py-3 text-right">Thao tác</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salesRows.slice(0, 80).map((row) => {
                const missing = row.reconciliation_status === 'NO_OUTPUT_INVOICE_LINKED';
                const mismatch = row.reconciliation_status === 'MISMATCH';
                return (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-bold text-slate-900">{row.order_code}<div className="mt-0.5 text-xs font-normal text-slate-400">#{row.id}</div></td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${missing || mismatch ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{missing ? 'Chưa liên kết HĐ' : mismatch ? 'Có sai lệch' : 'Đã khớp'}</span></td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(row.total_amount)}</td>
                    <td className="px-5 py-3 text-slate-600">{row.invoice_id ? `${row.invoice_symbol ? `${row.invoice_symbol} · ` : ''}${row.invoice_number || `#${row.invoice_id}`}` : '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{row.invoice_id ? money(row.invoice_total) : '—'}</td>
                    <td className="px-5 py-3 text-right">{missing ? <button type="button" onClick={() => openOutputInvoiceLink(row)} className="btn-secondary whitespace-nowrap">Gắn hóa đơn</button> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {linkingOrder && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Gắn hóa đơn đầu ra">
          <form onSubmit={saveOutputInvoice} className="w-full max-w-2xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-lg font-black text-slate-950">Gắn hóa đơn đầu ra</h3><p className="mt-1 text-sm text-slate-500">Đơn {linkingOrder.order_code} · {money(linkingOrder.total_amount)}</p></div>
              <button type="button" onClick={() => setLinkingOrder(null)} className="icon-btn" aria-label="Đóng">×</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">MST người bán *</span><input required value={outputDraft.seller_tax_code} onChange={(e) => setOutputDraft((d) => ({ ...d, seller_tax_code: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">Số hóa đơn *</span><input required value={outputDraft.invoice_number} onChange={(e) => setOutputDraft((d) => ({ ...d, invoice_number: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">Ký hiệu</span><input value={outputDraft.invoice_symbol} onChange={(e) => setOutputDraft((d) => ({ ...d, invoice_symbol: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">Ngày hóa đơn *</span><input required type="date" value={outputDraft.invoice_date} onChange={(e) => setOutputDraft((d) => ({ ...d, invoice_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">Tiền VAT</span><input min="0" type="number" value={outputDraft.vat_amount} onChange={(e) => setOutputDraft((d) => ({ ...d, vat_amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">Tổng thanh toán *</span><input required min="0" type="number" value={outputDraft.total_amount} onChange={(e) => setOutputDraft((d) => ({ ...d, total_amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">AutoTax sẽ đối chiếu số tiền, MST người bán và trạng thái thanh toán ở backend. Sai lệch được tạo thành finding để rà soát, không tự gắn nhãn vi phạm pháp lý.</div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setLinkingOrder(null)} className="btn-secondary">Hủy</button><button type="submit" disabled={savingOutputInvoice} className="btn-primary disabled:opacity-60">{savingOutputInvoice ? 'Đang ghi nhận…' : 'Ghi nhận & đối chiếu'}</button></div>
          </form>
        </div>
      )}

      <section className="surface overflow-hidden">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <h2 className="text-base font-extrabold text-slate-950">Hóa đơn đầu vào gần đây</h2>
          <p className="mt-1 text-sm text-slate-500">Nguồn dữ liệu để đối chiếu phiếu nhập, kho, thanh toán và findings.</p>
        </div>

        <div className="sm:hidden divide-y divide-slate-100">
          {invoices.slice(0, 20).map((invoice) => (
            <div key={invoice.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{invoice.invoice_symbol ? `${invoice.invoice_symbol} · ` : ''}{invoice.invoice_number}</div>
                  <div className="mt-1 text-xs text-slate-500">MST bán: {invoice.seller_tax_code || '—'}</div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{invoice.source_type}</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="text-xs text-slate-500">{invoice.invoice_date || 'Chưa có ngày'}</div>
                <div className="font-black text-slate-950">{money(invoice.total_amount)}</div>
              </div>
            </div>
          ))}
          {!loading && invoices.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Chưa có hóa đơn đầu vào.</div>}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3">Số / ký hiệu</th><th className="px-5 py-3">MST người bán</th><th className="px-5 py-3">Ngày HĐ</th><th className="px-5 py-3">Nguồn</th><th className="px-5 py-3 text-right">Tổng tiền</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.slice(0, 50).map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{invoice.invoice_symbol ? `${invoice.invoice_symbol} · ` : ''}{invoice.invoice_number}</td>
                  <td className="px-5 py-3 font-mono text-slate-600">{invoice.seller_tax_code || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{invoice.invoice_date || '—'}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{invoice.source_type}</span></td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900">{money(invoice.total_amount)}</td>
                </tr>
              ))}
              {!loading && invoices.length === 0 && <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-500">Chưa có hóa đơn đầu vào.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
