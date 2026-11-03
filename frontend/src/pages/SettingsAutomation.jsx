import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Zap, Plus, Trash2, Play } from 'lucide-react';
import API_BASE from '../config/api';

export default function SettingsAutomation() {
  const [workflows, setWorkflows] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    trigger_event: 'ORDER_CREATED',
    condition: { field: 'total_amount', operator: '>', value: '' },
    action_type: 'SEND_SMS',
    action_payload: { message: '', phone: '' }
  });

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/workflows`);
      setWorkflows(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/workflows`, {
        ...form,
        condition: { ...form.condition, value: Number(form.condition.value) }
      });
      setShowModal(false);
      setForm({
        name: '', trigger_event: 'ORDER_CREATED',
        condition: { field: 'total_amount', operator: '>', value: '' },
        action_type: 'SEND_SMS', action_payload: { message: '', phone: '' }
      });
      fetchWorkflows();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa Rule tự động này?')) return;
    await axios.delete(`${API_BASE}/api/workflows/${id}`);
    fetchWorkflows();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Zap className="w-8 h-8 text-amber-500" /> Tự Động Hóa (Automation)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Lưu bản nháp quy tắc tự động. Bộ thực thi SMS/Zalo hiện chưa được tích hợp production.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all">
          <Plus className="w-5 h-5" /> Thêm Rule Nháp
        </button>
      </div>

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Các rule ở trang này chỉ được lưu cấu hình. AutoTax chưa gửi SMS, Zalo ZNS hoặc tự chạy action từ các rule này.
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {workflows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">Chưa có Rule nháp nào.</div>
          ) : (
            workflows.map(wf => (
              <div key={wf.id} className="border border-slate-200 rounded-xl p-5 hover:border-amber-300 transition-colors flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-2 flex items-center gap-2">
                    {wf.name}
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold">CHƯA CÓ BỘ THỰC THI</span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-semibold flex items-center gap-1">
                      <Play className="w-3 h-3"/> Khi: {wf.trigger_event === 'ORDER_CREATED' ? 'Có Đơn Hàng Mới' : wf.trigger_event === 'CUSTOMER_CREATED' ? 'Có Khách Hàng Mới' : wf.trigger_event}
                    </span>
                    <span className="text-slate-400 font-bold">→</span>
                    <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 font-semibold">
                      Nếu: {wf.condition?.field} {wf.condition?.operator} {new Intl.NumberFormat('vi-VN').format(wf.condition?.value || 0)}
                    </span>
                    <span className="text-slate-400 font-bold">→</span>
                    <span className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3"/> Dự kiến: {wf.action_type === 'SEND_SMS' ? 'Gửi SMS' : wf.action_type === 'NOTIFY_ZALO' ? 'Gửi Zalo ZNS' : wf.action_type}
                    </span>
                  </div>
                </div>
                <button onClick={() => handleDelete(wf.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black">Tạo Rule Nháp</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tên Quy Tắc</label>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg outline-none focus:border-amber-500" placeholder="VD: Gửi tin nhắn cảm ơn VIP" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 text-center bg-slate-100 rounded-t-lg py-1">KHI (Trigger)</label>
                  <select value={form.trigger_event} onChange={e => setForm({...form, trigger_event: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-b-lg outline-none bg-slate-50 font-semibold">
                    <option value="ORDER_CREATED">Có đơn hàng mới</option>
                    <option value="CUSTOMER_CREATED">Có khách hàng mới</option>
                  </select>
                </div>
                <div className="md:border-x border-slate-100 md:px-4">
                  <label className="block text-sm font-bold text-amber-600 mb-1 text-center bg-amber-50 rounded-t-lg py-1">NẾU (Condition)</label>
                  <div className="space-y-2">
                    <select value={form.condition.field} onChange={e => setForm({...form, condition: {...form.condition, field: e.target.value}})} className="w-full px-3 py-1 border rounded bg-white text-sm">
                      <option value="total_amount">Tổng tiền đơn</option>
                    </select>
                    <select value={form.condition.operator} onChange={e => setForm({...form, condition: {...form.condition, operator: e.target.value}})} className="w-full px-3 py-1 border rounded bg-white text-sm font-bold">
                      <option value=">">Lớn hơn (&gt;)</option>
                      <option value="<">Nhỏ hơn (&lt;)</option>
                    </select>
                    <input required type="number" placeholder="Số tiền..." value={form.condition.value} onChange={e => setForm({...form, condition: {...form.condition, value: e.target.value}})} className="w-full px-3 py-1 border rounded bg-white text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-indigo-600 mb-1 text-center bg-indigo-50 rounded-t-lg py-1">DỰ KIẾN (Action)</label>
                  <div className="space-y-2">
                    <select value={form.action_type} onChange={e => setForm({...form, action_type: e.target.value})} className="w-full px-3 py-1 border rounded bg-white text-sm font-bold text-indigo-700">
                      <option value="SEND_SMS">Gửi SMS (chưa tích hợp)</option>
                      <option value="NOTIFY_ZALO">Gửi Zalo ZNS (chưa tích hợp)</option>
                    </select>
                    <input type="text" placeholder="Số điện thoại dự kiến..." value={form.action_payload.phone} onChange={e => setForm({...form, action_payload: {...form.action_payload, phone: e.target.value}})} className="w-full px-3 py-1 border rounded bg-white text-sm" />
                    <textarea placeholder="Nội dung tin nhắn dự kiến..." value={form.action_payload.message} onChange={e => setForm({...form, action_payload: {...form.action_payload, message: e.target.value}})} className="w-full px-3 py-1 border rounded bg-white text-sm h-16 resize-none" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                Lưu rule không kích hoạt gửi tin. Cần tích hợp provider và executor production trước khi AutoTax có thể chạy action tự động.
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 shadow-md">Lưu Bản Nháp</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}