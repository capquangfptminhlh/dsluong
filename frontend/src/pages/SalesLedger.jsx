import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Download, Upload, Plus, Trash2, FileText, Search } from 'lucide-react';
import API_BASE, { downloadAuthFile } from '../config/api';

export default function SalesLedger() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ date: '', description: '', amount: '' });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/transactions?user_id=${user.phone}`);
      setTransactions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user.phone]);

  useEffect(() => {
    if (user.phone) fetchTransactions();
  }, [fetchTransactions, user.phone]);

  const handleAddManual = async (e) => {
    e.preventDefault();
    if(!formData.date || !formData.description || !formData.amount) return;
    
    try {
      await axios.post(`${API_BASE}/api/transactions?user_id=${user.phone}`, {
        date: formData.date,
        description: formData.description,
        amount: parseFloat(formData.amount)
      });
      setFormData({ date: '', description: '', amount: '' });
      setShowForm(false);
      fetchTransactions();
    } catch {
      alert("Lỗi khi thêm giao dịch");
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Xóa giao dịch này?")) return;
    try {
      await axios.delete(`${API_BASE}/api/transactions/${id}?user_id=${user.phone}`);
      setTransactions(transactions.filter(t => t.id !== id));
    } catch {
      alert("Lỗi khi xóa");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      // Parse data - assuming standard VCB/Techcombank bank statement:
      // We will look for numbers that look like Credit Amount
      const parsedData = [];
      data.forEach(row => {
        if(row.length < 3) return;
        
        let date = row[0] || '';
        let desc = row[row.length - 1] || row[row.length - 2] || '';
        
        // Find amount (Credit usually positive large number)
        let amount = 0;
        row.forEach(cell => {
          if (typeof cell === 'number' && cell > 1000) {
             amount = cell;
          } else if (typeof cell === 'string') {
             const cleaned = cell.replace(/,/g, '');
             if (!isNaN(cleaned) && Number(cleaned) > 1000) amount = Number(cleaned);
          }
        });

        if (amount > 0 && String(date).length > 5) {
          parsedData.push({
            date: String(date).substring(0,10),
            description: String(desc),
            amount: amount
          });
        }
      });

      if (parsedData.length === 0) return alert("Không tìm thấy dữ liệu sao kê hợp lệ trong file này.");

      if (window.confirm(`Tìm thấy ${parsedData.length} giao dịch nhận tiền. Nhập vào sổ?`)) {
        try {
          await axios.post(`${API_BASE}/api/transactions/bulk?user_id=${user.phone}`, {
            transactions: parsedData
          });
          fetchTransactions();
          alert("Nhập sao kê thành công!");
        } catch {
          alert("Lỗi khi nhập sao kê");
        }
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; // reset
  };

  const handleExport = () => {
    downloadAuthFile('/api/transactions/export', 'S2-HKD.xlsx').catch(() => alert('Không tải được file. Vui lòng đăng nhập lại.'));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-primary w-6 h-6" /> Sổ Bán Hàng (S2-HKD)
          </h2>
          <p className="text-slate-500 mt-1">Quản lý và xuất sổ chi tiết doanh thu chuẩn Thông tư 88.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-semibold rounded-xl hover:bg-indigo-100 transition-colors"
          >
            <Download className="w-4 h-4" /> Xuất Sổ S2-HKD
          </button>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 font-semibold rounded-xl hover:bg-green-100 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" /> Nhập Sao Kê (Excel)
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
          </label>

          <button 
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-200"
          >
            <Plus className="w-4 h-4" /> Nhập thủ công
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleAddManual} className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex gap-4 items-end border border-slate-100">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngày tháng</label>
            <input type="date" value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-primary" required />
          </div>
          <div className="flex-[2]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Nội dung (Chi tiêu / Tên mặt hàng)</label>
            <input type="text" value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-primary" placeholder="Bán quần áo..." required />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền</label>
            <input type="number" value={formData.amount} onChange={e=>setFormData({...formData, amount: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-primary" placeholder="0" required />
          </div>
          <button type="submit" className="px-6 py-2 bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-700 transition-colors">
            Thêm
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col border border-slate-100">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-700">Lịch sử Giao dịch Doanh thu</h3>
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Tìm kiếm..." className="outline-none text-sm w-48" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-white sticky top-0 border-b border-slate-200">
              <tr>
                <th className="py-3 px-6 text-sm font-semibold text-slate-500">Ngày</th>
                <th className="py-3 px-6 text-sm font-semibold text-slate-500">Nội dung</th>
                <th className="py-3 px-6 text-sm font-semibold text-slate-500">Số tiền</th>
                <th className="py-3 px-6 text-sm font-semibold text-slate-500">Phân loại Thuế (Tự động)</th>
                <th className="py-3 px-6 text-right text-sm font-semibold text-slate-500">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center py-8 text-slate-500">Đang tải...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-8 text-slate-500">Chưa có dữ liệu. Hãy nhập thủ công hoặc tải sao kê lên.</td></tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-6 text-slate-600 font-medium">{t.date}</td>
                    <td className="py-3 px-6 text-slate-800">{t.description}</td>
                    <td className="py-3 px-6 text-green-600 font-bold">{new Intl.NumberFormat('vi-VN').format(t.amount)} đ</td>
                    <td className="py-3 px-6 text-slate-500 text-sm">
                      <span className="bg-slate-100 px-2 py-1 rounded-md">{t.category}</span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors">
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
    </div>
  );
}
