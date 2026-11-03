import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { History as HistoryIcon, Download, Trash2, RefreshCw } from 'lucide-react';
import API_BASE from '../config/api';

export default function History() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/reports`);
      setReports(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDeleteReport = async (id) => {
    if(!window.confirm("Bạn có chắc chắn muốn xóa báo cáo này?")) return;
    try {
      await axios.delete(`${API_BASE}/api/reports/${id}`);
      setReports(reports.filter(r => r.id !== id));
    } catch {
      alert("Lỗi khi xóa báo cáo");
    }
  };

  const formatCurrency = (val) => new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  const formatDate = (dateStr) => new Date(dateStr).toLocaleString('vi-VN');

  return (
    <div className="bg-white rounded-2xl shadow-sm h-full p-8 flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Lịch sử báo cáo</h2>
          <p className="text-slate-500">Danh sách các báo cáo thuế bạn đã tạo.</p>
        </div>
        
        <button 
          onClick={fetchReports}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-primary hover:bg-indigo-100 font-semibold rounded-lg transition-colors border border-indigo-100"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className="grid gap-4">
          {loading ? (
            <div className="text-center text-slate-500 py-8">Đang tải lịch sử...</div>
          ) : reports.length === 0 ? (
            <div className="text-center text-slate-500 py-8 border-2 border-dashed border-slate-200 rounded-xl">
              Chưa có báo cáo nào được tạo.
            </div>
          ) : (
            reports.map(report => (
              <div key={report.id} className="flex items-center justify-between p-5 border border-slate-200 rounded-xl hover:border-primary transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-primary rounded-xl flex items-center justify-center">
                    <HistoryIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{report.fileName}</h3>
                    <p className="text-sm text-slate-500 mt-1">Tạo lúc: {formatDate(report.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-6">
                  <div>
                    <div className="text-sm text-slate-500 mb-1">Tổng doanh thu</div>
                    <div className="font-bold text-slate-800 text-lg">{formatCurrency(report.totalRevenue)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      className="p-2 bg-slate-50 text-slate-600 hover:text-primary hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Tải xuống báo cáo"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteReport(report.id)}
                      className="p-2 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa báo cáo"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
