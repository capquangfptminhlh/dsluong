import React, { useState, useEffect } from 'react';
import { Plus, Scissors, Coffee } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function ProductBOM() {
  const [boms, setBoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  
  const [form, setForm] = useState({
    product_id: '',
    material_product_id: '',
    quantity: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [bomRes, prodRes] = await Promise.all([
        axios.get(`${API_BASE}/api/bom`),
        axios.get(`${API_BASE}/api/products`)
      ]);
      setBoms(bomRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.material_product_id || !form.quantity) return alert("Vui lòng điền đủ thông tin");
    if (form.product_id === form.material_product_id) return alert("Thành phẩm và nguyên liệu không được trùng nhau");

    try {
      await axios.post(`${API_BASE}/api/bom`, form);
      setShowModal(false);
      setForm({ product_id: '', material_product_id: '', quantity: '' });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Group BOMs by product for display
  const groupedBoms = boms.reduce((acc, curr) => {
    if (!acc[curr.product_id]) {
      acc[curr.product_id] = {
        product_name: curr.product_name,
        materials: []
      };
    }
    acc[curr.product_id].materials.push(curr);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Scissors className="w-8 h-8 text-rose-500" /> Định mức Sản xuất (BOM)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Bóc tách nguyên vật liệu tự động khi bán sản phẩm chế biến</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
          <Plus className="w-5 h-5" /> Thêm Định Mức
        </button>
      </div>

      <div className="bg-white rounded-2xl p-6 border shadow-sm">
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="p-4 font-bold w-1/3">Sản phẩm bán ra (Thành phẩm)</th>
                <th className="p-4 font-bold">Thành phần nguyên liệu</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(groupedBoms).length === 0 ? (
                <tr>
                  <td colSpan="2" className="p-8 text-center text-slate-400">Chưa có định mức nào được tạo.</td>
                </tr>
              ) : (
                Object.values(groupedBoms).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-4 align-top">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 shrink-0">
                          <Coffee className="w-5 h-5" />
                        </div>
                        <div className="font-bold text-slate-800">{item.product_name}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <ul className="text-sm font-semibold text-slate-600 space-y-2">
                        {item.materials.map((mat, i) => (
                          <li key={i} className="flex justify-between items-center bg-white p-2 border border-slate-100 rounded-lg shadow-sm w-3/4">
                            <span>• {mat.material_name}</span>
                            <span className="text-rose-600 font-bold px-2 py-1 bg-rose-50 rounded">Số lượng: {mat.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black">Khai báo Định mức Nguyên liệu</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Sản phẩm Thành phẩm (Bán ra)</label>
                <select 
                  className="w-full px-4 py-2 border rounded-lg outline-none focus:border-rose-500 bg-slate-50"
                  value={form.product_id}
                  onChange={e => setForm({...form, product_id: e.target.value})}
                  required
                >
                  <option value="">-- Chọn Sản phẩm --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 space-y-4">
                <h3 className="font-bold text-rose-800 text-sm flex items-center gap-2"><Scissors className="w-4 h-4"/> Sẽ bị trừ các nguyên liệu sau:</h3>
                
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">Chọn Nguyên liệu gốc</label>
                  <select 
                    className="w-full px-4 py-2 border border-rose-200 rounded-lg outline-none focus:border-rose-500"
                    value={form.material_product_id}
                    onChange={e => setForm({...form, material_product_id: e.target.value})}
                    required
                  >
                    <option value="">-- Chọn Nguyên liệu trong kho --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">Số lượng trừ (VD: 0.05 kg, 2 cái)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    placeholder="Nhập số lượng..."
                    value={form.quantity} 
                    onChange={e => setForm({...form, quantity: e.target.value})}
                    className="w-full px-4 py-2 border border-rose-200 rounded-lg outline-none focus:border-rose-500" 
                    required 
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 shadow-md">Lưu Định Mức</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
