import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Folder, Package } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function ProductCategories() {
  const industry = localStorage.getItem('industry_type') || 'retail';
  const nhan = ['spa', 'petshop', 'clinic', 'hotel'].includes(industry) ? 'Nhóm dịch vụ' : 'Nhóm hàng / Danh mục';

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dangSua, setDangSua] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', parent_id: '' });

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/categories`);
      setCategories(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (id) => categories.filter((c) => Number(c.parent_id) === Number(id));

  const moThem = (parentId = '') => {
    setDangSua(null);
    setForm({ name: '', description: '', parent_id: parentId ? String(parentId) : '' });
    setShowForm(true);
  };

  const moSua = (c) => {
    setDangSua(c);
    setForm({ name: c.name, description: c.description || '', parent_id: c.parent_id ? String(c.parent_id) : '' });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Vui lòng nhập tên!');
    const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null };
    try {
      if (dangSua) await axios.put(`${API_BASE}/api/categories/${dangSua.id}`, payload);
      else await axios.post(`${API_BASE}/api/categories`, payload);
      setShowForm(false);
      await fetchCategories();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu');
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Xóa "${c.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/categories/${c.id}`);
      await fetchCategories();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi xóa');
    }
  };

  const q = search.trim().toLowerCase();
  const visibleRoots = roots.filter((root) => {
    if (!q) return true;
    if (root.name.toLowerCase().includes(q)) return true;
    return childrenOf(root.id).some((child) => child.name.toLowerCase().includes(q));
  });
  const ungroupedChildren = categories.filter((c) => c.parent_id && !roots.some((r) => Number(r.id) === Number(c.parent_id)));
  const tongSanPham = roots.reduce((sum, c) => sum + Number(c.product_count || 0), 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
        <div>
<h2 className="text-xl font-bold text-slate-800">{nhan}</h2>
<p className="text-xs text-slate-500 mt-1">Tạo cố định theo cấu trúc: <b>Nhóm lớn → Danh mục con</b>. Ví dụ Điện lạnh → Tủ lạnh, Máy giặt.</p>
<p className="text-xs text-slate-400 mt-1">{roots.length} nhóm lớn · {categories.length - roots.length} danh mục con · {tongSanPham} sản phẩm</p>
        </div>
        <button onClick={() => moThem('')} className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200">
<Plus className="w-4 h-4" /> Thêm nhóm lớn
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
<div className="relative w-full sm:w-80">
  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nhóm lớn hoặc danh mục con..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
</div>
        </div>

        <div className="flex-1 overflow-auto p-4">
{loading ? (
  <div className="py-16 text-center text-slate-400">Đang tải...</div>
) : visibleRoots.length === 0 ? (
  <div className="py-16 text-center">
    <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
    <p className="text-slate-400 font-medium">{roots.length === 0 ? 'Chưa có nhóm hàng nào.' : 'Không tìm thấy nhóm phù hợp.'}</p>
    {roots.length === 0 && <p className="text-slate-400 text-sm mt-1">Tạo nhóm lớn trước, sau đó tạo các danh mục con bên trong.</p>}
  </div>
) : (
  <div className="space-y-4">
    {visibleRoots.map((root) => {
      const children = childrenOf(root.id).filter((c) => !q || c.name.toLowerCase().includes(q) || root.name.toLowerCase().includes(q));
      return (
        <section key={root.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0"><Folder className="w-5 h-5 text-indigo-600" /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-wider font-black text-indigo-600">Nhóm lớn</span><span className="text-[10px] text-slate-400">{root.child_count || 0} danh mục con</span></div>
                <div className="font-black text-slate-800 truncate">{root.name}</div>
                <div className="text-xs text-slate-500 truncate">{root.description || 'Không có mô tả'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {root.product_count || 0} SP</span>
              <button onClick={() => moThem(root.id)} className="px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg"><Plus className="w-3.5 h-3.5 inline mr-1" />Danh mục con</button>
              <button onClick={() => moSua(root)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Sửa nhóm lớn"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(root)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Xóa nhóm lớn"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {children.length === 0 ? (
              <button onClick={() => moThem(root.id)} className="border border-dashed border-slate-300 rounded-xl p-4 text-left text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-600">+ Tạo danh mục con đầu tiên trong {root.name}</button>
            ) : children.map((child) => (
              <div key={child.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-indigo-200">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Danh mục con</div>
                  <div className="font-bold text-slate-800 truncate">{child.name}</div>
                  <div className="text-xs text-slate-500 mt-1"><b>{child.product_count || 0}</b> sản phẩm</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moSua(child)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(child)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    })}
    {ungroupedChildren.length > 0 && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">Có {ungroupedChildren.length} danh mục cũ chưa xác định nhóm cha. Hãy mở chỉnh sửa và gán lại nhóm lớn.</div>}
  </div>
)}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
<div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
  <h3 className="text-lg font-bold text-slate-800 mb-1">{dangSua ? 'Sửa nhóm / danh mục' : (form.parent_id ? 'Thêm danh mục con' : 'Thêm nhóm lớn')}</h3>
  <p className="text-xs text-slate-500 mb-4">Nhóm lớn dùng để gom nhiều danh mục con. Sản phẩm mới sẽ chọn từ các mục đã lưu này.</p>
  <form onSubmit={handleSubmit} className="space-y-4">
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1">Thuộc nhóm lớn</label>
      <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 bg-white">
        <option value="">— Đây là nhóm lớn —</option>
        {roots.filter((r) => !dangSua || Number(r.id) !== Number(dangSua.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1">Tên {form.parent_id ? 'danh mục con' : 'nhóm lớn'}</label>
      <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.parent_id ? 'VD: Tủ lạnh' : 'VD: Điện lạnh'} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
      {dangSua && <p className="text-xs text-slate-500 mt-1">Đổi tên sẽ tự cập nhật các sản phẩm đang dùng danh mục này.</p>}
    </div>
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1">Mô tả</label>
      <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
    </div>
    <div className="flex gap-2 pt-2">
      <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
      <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">{dangSua ? 'Lưu thay đổi' : 'Tạo mục'}</button>
    </div>
  </form>
</div>
        </div>
      )}
    </div>
  );
}
