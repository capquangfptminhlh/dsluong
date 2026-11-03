import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Package, Trash2 } from 'lucide-react';
import API_BASE from '../config/api';

export default function MappedProducts() {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMappings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/mappings`);
      setMappings(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleDelete = async (id) => {
    if(!window.confirm("Bạn có chắc muốn xóa phân loại này?")) return;
    try {
      await axios.delete(`${API_BASE}/api/mappings/${id}`);
      setMappings(mappings.filter(m => m.id !== id));
    } catch {
      alert("Lỗi khi xóa");
    }
  };

  const handleDeleteAll = async () => {
    if(!window.confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa TẤT CẢ phân loại?\nHành động này không thể hoàn tác!")) return;
    try {
      await axios.delete(`${API_BASE}/api/mappings/all`);
      setMappings([]);
    } catch {
      alert("Lỗi khi xóa tất cả");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm h-full p-8 flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Sản phẩm đã phân loại</h2>
          <p className="text-slate-500">Quản lý các nhóm sản phẩm đã được phân loại thuế.</p>
        </div>
        
        {mappings.length > 0 && (
          <button 
            onClick={handleDeleteAll}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-semibold rounded-lg transition-colors border border-red-100"
          >
            <Trash2 className="w-4 h-4" />
            Xóa tất cả
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
            <tr>
              <th className="p-4">Nhóm sản phẩm</th>
              <th className="p-4">Danh mục thuế</th>
              <th className="p-4 w-24 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="3" className="p-8 text-center text-slate-500">Đang tải...</td></tr>
            ) : mappings.length === 0 ? (
              <tr><td colSpan="3" className="p-8 text-center text-slate-500">Chưa có dữ liệu phân loại.</td></tr>
            ) : (
              mappings.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="p-4 flex items-center gap-3 font-medium text-slate-800">
                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500">
                      <Package className="w-4 h-4"/>
                    </div>
                    {m.keyword}
                  </td>
                  <td className="p-4">
                    <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-semibold border border-green-200">
                      Mục {m.category}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => handleDelete(m.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
