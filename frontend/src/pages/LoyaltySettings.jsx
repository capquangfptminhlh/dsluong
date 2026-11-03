import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Award, Gift, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import API_BASE from '../config/api';

const EMPTY_FORM = { name: '', min_points: '', discount_percent: '', color: '#94a3b8' };

export default function LoyaltySettings() {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => Number(a.min_points || 0) - Number(b.min_points || 0)),
    [tiers]
  );

  const fetchTiers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/loyalty/tiers`);
      setTiers(Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được cấu hình khách hàng thân thiết.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage('');
    setError('');
    setShowModal(true);
  };

  const openEdit = (tier) => {
    setEditingId(tier.id);
    setForm({
      name: tier.name || '',
      min_points: String(tier.min_points ?? 0),
      discount_percent: String(tier.discount_percent ?? 0),
      color: tier.color || '#94a3b8'
    });
    setMessage('');
    setError('');
    setShowModal(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      min_points: Number(form.min_points),
      discount_percent: Number(form.discount_percent),
      color: form.color
    };
    if (!payload.name) return setError('Cần nhập tên hạng thẻ.');
    if (!Number.isInteger(payload.min_points) || payload.min_points < 0) return setError('Điểm tối thiểu phải là số nguyên không âm.');
    if (!Number.isFinite(payload.discount_percent) || payload.discount_percent < 0 || payload.discount_percent > 100) return setError('Chiết khấu phải nằm trong khoảng 0–100%.');

    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/api/loyalty/tiers/${editingId}`, payload);
        setMessage('Đã cập nhật hạng thẻ.');
      } else {
        await axios.post(`${API_BASE}/api/loyalty/tiers`, payload);
        setMessage('Đã tạo hạng thẻ.');
      }
      setShowModal(false);
      await fetchTiers();
    } catch (err) {
      setError(err.response?.data?.error || 'Không lưu được hạng thẻ.');
    } finally {
      setSaving(false);
    }
  };

  const removeTier = async (tier) => {
    if (!window.confirm(`Xóa hạng thẻ “${tier.name}”?`)) return;
    setError('');
    setMessage('');
    try {
      await axios.delete(`${API_BASE}/api/loyalty/tiers/${tier.id}`);
      setMessage('Đã xóa hạng thẻ.');
      await fetchTiers();
    } catch (err) {
      setError(err.response?.data?.error || 'Không xóa được hạng thẻ.');
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-800 sm:text-3xl">
            <Gift className="h-8 w-8 text-rose-500" /> Khách hàng thân thiết
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Quản lý hạng thẻ và mức ưu đãi dựa trên điểm tích lũy thực tế.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> Thêm hạng thẻ
        </button>
      </div>

      {(error || message) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">Đang tải hạng thẻ…</div>
      ) : sortedTiers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Gift className="mx-auto h-12 w-12 text-slate-300" />
          <h2 className="mt-4 text-lg font-black text-slate-700">Chưa có hạng thẻ nào</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">AutoTax không tự tạo dữ liệu mẫu. Hãy thêm hạng thẻ đầu tiên theo chính sách thật của cửa hàng.</p>
          <button onClick={openCreate} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700"><Plus className="h-4 w-4" /> Tạo hạng thẻ</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedTiers.map((tier) => (
            <article key={tier.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${tier.color || '#94a3b8'}22`, color: tier.color || '#64748b' }}>
                    <Award className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-slate-800">{tier.name}</h2>
                    <div className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500"><Star className="h-3.5 w-3.5" /> Từ {new Intl.NumberFormat('vi-VN').format(Number(tier.min_points || 0))} điểm</div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => openEdit(tier)} aria-label={`Sửa ${tier.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => removeTier(tier)} aria-label={`Xóa ${tier.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-500">Chiết khấu</span>
                <span className="font-black text-emerald-600">{Number(tier.discount_percent || 0)}%</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        Hạng thẻ chỉ phản ánh cấu hình đã lưu trong tài khoản của bạn. AutoTax không tự bật chương trình giới thiệu, cộng điểm hay ưu đãi nếu chưa có nghiệp vụ tương ứng được ghi nhận.
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowModal(false)}>
          <div role="dialog" aria-label={editingId ? 'Sửa hạng thẻ' : 'Tạo hạng thẻ'} className="w-full max-w-lg rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-800">{editingId ? 'Sửa hạng thẻ' : 'Tạo hạng thẻ'}</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Tên hạng thẻ</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-rose-500" placeholder="VD: Thành viên Vàng" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Điểm tối thiểu</label>
                  <input required type="number" min="0" step="1" value={form.min_points} onChange={(e) => setForm({ ...form, min_points: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">Chiết khấu (%)</label>
                  <input required type="number" min="0" max="100" step="0.01" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-rose-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Màu nhận diện</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-11 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
                  <code className="text-sm font-bold text-slate-500">{form.color}</code>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Hủy</button>
                <button disabled={saving} type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">{saving ? 'Đang lưu…' : 'Lưu hạng thẻ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
