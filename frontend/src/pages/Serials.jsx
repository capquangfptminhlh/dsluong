import React, { useState, useEffect } from 'react';
import { ScanBarcode, Plus, Trash2, Search, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import {} from '../utils/excel';

export default function Serials() {
  const [tab, setTab] = useState('serial'); // serial | warranty
  const [serials, setSerials] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [locTT, setLocTT] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: '', serials: '' });
  const [showBH, setShowBH] = useState(false);
  const [formBH, setFormBH] = useState({ product_id: '', serial: '', customer_name: '', customer_phone: '', months: 12, note: '' });

  const [traCuu, setTraCuu] = useState('');
  const [ketQua, setKetQua] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, w, p] = await Promise.all([
        axios.get(`${API_BASE}/api/pd/serials`),
        axios.get(`${API_BASE}/api/pd/warranties`),
        axios.get(`${API_BASE}/api/products`),
      ]);
      setSerials(s.data); setWarranties(w.data); setProducts(p.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const themSerial = async (e) => {
    e.preventDefault();
    if (!form.product_id) return alert('Chọn sản phẩm!');
    if (!form.serials.trim()) return alert('Nhập ít nhất một serial!');
    try {
      const res = await axios.post(`${API_BASE}/api/pd/serials`, { product_id: Number(form.product_id), serials: form.serials });
      let msg = `Đã thêm ${res.data.da_them} serial.`;
      if (res.data.trung.length) msg += `\nBỏ qua ${res.data.trung.length} mã đã tồn tại: ${res.data.trung.slice(0, 5).join(', ')}`;
      alert(msg);
      setShowForm(false); setForm({ product_id: '', serials: '' });
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi thêm serial'); }
  };

  const xoaSerial = async (s) => {
    if (!window.confirm(`Xóa serial "${s.serial}"?`)) return;
    try { await axios.delete(`${API_BASE}/api/pd/serials/${s.id}`); fetchAll(); }
    catch (err) { alert(err.response?.data?.error || 'Lỗi khi xóa'); }
  };

  const themBH = async (e) => {
    e.preventDefault();
    if (!(Number(formBH.months) > 0)) return alert('Số tháng bảo hành phải lớn hơn 0!');
    try {
      await axios.post(`${API_BASE}/api/pd/warranties`, { ...formBH, product_id: formBH.product_id || null, months: Number(formBH.months) });
      setShowBH(false);
      setFormBH({ product_id: '', serial: '', customer_name: '', customer_phone: '', months: 12, note: '' });
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi tạo phiếu bảo hành'); }
  };

  const tim = async () => {
    if (!traCuu.trim()) return;
    try {
      const res = await axios.get(`${API_BASE}/api/pd/serials/tra-cuu/${encodeURIComponent(traCuu.trim())}`);
      setKetQua(res.data);
    } catch (err) { setKetQua({ loi: err.response?.data?.error || 'Không tìm thấy' }); }
  };

  const srHienThi = serials.filter((s) => {
    if (locTT !== 'all' && s.status !== locTT) return false;
    if (!search) return true;
    return `${s.serial} ${s.product_name}`.toLowerCase().includes(search.toLowerCase());
  });
  const bhHienThi = warranties.filter((w) => !search ||
    `${w.serial || ''} ${w.product_name || ''} ${w.customer_name || ''} ${w.customer_phone || ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ScanBarcode className="w-7 h-7 text-teal-600" /> Serial / IMEI & Bảo Hành
          </h2>
          <p className="text-xs text-slate-500 mt-1">Theo dõi từng máy theo số IMEI/serial, tra cứu bảo hành cho khách</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBH(true)} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-teal-200 text-teal-700 text-xs font-bold rounded-lg hover:bg-teal-50">
            <ShieldCheck className="w-4 h-4" /> Tạo bảo hành thủ công
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 shadow-md shadow-teal-200">
            <Plus className="w-4 h-4" /> Nhập serial
          </button>
        </div>
      </div>

      {/* Tra cứu nhanh */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <label className="block text-sm font-bold text-slate-700 mb-2">Tra cứu nhanh serial / IMEI</label>
        <div className="flex gap-2">
          <input value={traCuu} onChange={(e) => setTraCuu(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tim()}
            placeholder="Quét hoặc nhập số serial rồi Enter..."
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-mono" />
          <button onClick={tim} className="px-5 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900">Tra cứu</button>
        </div>
        {ketQua && (
          <div className={`mt-3 rounded-xl p-4 ${ketQua.loi ? 'bg-rose-50' : 'bg-teal-50'}`}>
            {ketQua.loi ? <span className="font-bold text-rose-700">{ketQua.loi}</span> : (
              <div className="text-sm space-y-1">
                <div className="font-black text-slate-800">{ketQua.product_name} — <span className="font-mono">{ketQua.serial}</span></div>
                <div>Trạng thái: <b className={ketQua.status === 'sold' ? 'text-slate-600' : 'text-emerald-600'}>
                  {ketQua.status === 'sold' ? 'Đã bán' : 'Còn trong kho'}</b>
                  {ketQua.order_code && <span className="text-slate-500"> · đơn {ketQua.order_code}</span>}
                </div>
                {ketQua.bao_hanh ? (
                  <div className={ketQua.ngay_bao_hanh_con_lai >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                    Bảo hành đến {ketQua.bao_hanh.end_date} — {ketQua.ngay_bao_hanh_con_lai >= 0
                      ? `còn ${ketQua.ngay_bao_hanh_con_lai} ngày` : `đã hết hạn ${Math.abs(ketQua.ngay_bao_hanh_con_lai)} ngày`}
                  </div>
                ) : <div className="text-slate-500">Chưa có phiếu bảo hành</div>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setTab('serial')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${tab === 'serial' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Serial ({serials.length})</button>
            <button onClick={() => setTab('warranty')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${tab === 'warranty' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Bảo hành ({warranties.length})</button>
          </div>
          {tab === 'serial' && (
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {[{ k: 'all', l: 'Tất cả' }, { k: 'in_stock', l: 'Còn kho' }, { k: 'sold', l: 'Đã bán' }].map((x) => (
                <button key={x.k} onClick={() => setLocTT(x.k)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${locTT === x.k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{x.l}</button>
              ))}
            </div>
          )}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm serial, sản phẩm, khách..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500" />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : tab === 'serial' ? (
              srHienThi.length === 0 ? (
                <div className="py-16 text-center">
                  <ScanBarcode className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">{serials.length === 0 ? 'Chưa nhập serial nào.' : 'Không có serial khớp bộ lọc.'}</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr><th className="py-3 px-4 font-semibold">Serial / IMEI</th><th className="py-3 px-4 font-semibold">Sản phẩm</th><th className="py-3 px-4 font-semibold">Trạng thái</th><th className="py-3 px-4 font-semibold">Đơn hàng</th><th className="py-3 px-4 text-right font-semibold"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {srHienThi.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.serial}</td>
                        <td className="py-3 px-4 text-slate-600">{s.product_name}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.status === 'sold' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                            {s.status === 'sold' ? 'Đã bán' : 'Còn kho'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{s.order_code || '—'}</td>
                        <td className="py-3 px-4 text-right">
                          {s.status !== 'sold' && (
                            <button onClick={() => xoaSerial(s)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              bhHienThi.length === 0 ? (
                <div className="py-16 text-center">
                  <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">Chưa có phiếu bảo hành nào.</p>
                  <p className="text-slate-400 text-sm mt-1">Đơn POS có thời hạn bảo hành sẽ tự tạo phiếu từ thông tin khách trên đơn, kể cả hàng không có serial.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr><th className="py-3 px-4 font-semibold">Sản phẩm</th><th className="py-3 px-4 font-semibold">Serial</th><th className="py-3 px-4 font-semibold">Khách hàng</th><th className="py-3 px-4 font-semibold">Bảo hành đến</th><th className="py-3 px-4 font-semibold">Tình trạng</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bhHienThi.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-800">{w.product_name || '—'}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{w.serial || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{w.customer_name || '—'}<div className="text-xs text-slate-400">{w.customer_phone}</div></td>
                        <td className="py-3 px-4 text-slate-600">{w.end_date} <span className="text-xs text-slate-400">({w.months} tháng{Number(w.quantity) > 1 ? ` · SL ${w.quantity}` : ''})</span></td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${w.con_han ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {w.con_han ? `Còn ${w.ngay_con_lai} ngày` : 'Hết hạn'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
        </div>
      </div>

      {/* Nhập serial */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Nhập serial / IMEI</h3>
            <p className="text-sm text-slate-500 mb-4">Mỗi mã một dòng. Mã đã có sẽ tự bỏ qua.</p>
            <form onSubmit={themSerial} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Sản phẩm</label>
                <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500 bg-white">
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Danh sách serial</label>
                <textarea rows="6" value={form.serials} onChange={(e) => setForm({ ...form, serials: e.target.value })}
                  placeholder={'IMEI-001\nIMEI-002\nIMEI-003'}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-mono text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">Nhập</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lập phiếu bảo hành */}
      {showBH && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBH(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Tạo bảo hành thủ công</h3>
            <p className="text-xs text-slate-500 mb-4">Chỉ dùng cho đơn cũ hoặc giao dịch ngoài POS. Đơn POS mới tự tạo bảo hành khi thanh toán.</p>
            <form onSubmit={themBH} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Sản phẩm</label>
                <select value={formBH.product_id} onChange={(e) => setFormBH({ ...formBH, product_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500 bg-white">
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Serial</label>
                  <input value={formBH.serial} onChange={(e) => setFormBH({ ...formBH, serial: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Số tháng BH</label>
                  <input type="number" min="1" value={formBH.months} onChange={(e) => setFormBH({ ...formBH, months: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500 text-right" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Tên khách</label>
                  <input value={formBH.customer_name} onChange={(e) => setFormBH({ ...formBH, customer_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">SĐT khách</label>
                  <input value={formBH.customer_phone} onChange={(e) => setFormBH({ ...formBH, customer_phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-teal-500" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowBH(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">Lập phiếu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
