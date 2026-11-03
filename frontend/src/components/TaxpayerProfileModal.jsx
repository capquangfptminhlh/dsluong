import React, { useState } from 'react';
import { X, Save, User } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import locations from '../data/locations.json';

export default function TaxpayerProfileModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    taxCode: '',
    oldTaxCode: '',
    email: '',
    province: '',
    ward: '',
    address: '',
    taxDepartment: ''
  });
  const [loading, setLoading] = useState(false);

  // Get list of provinces from locations.json
  const provinces = Object.keys(locations);
  // Get list of wards based on selected province
  const availableWards = formData.province && locations[formData.province] 
    ? locations[formData.province].wards 
    : [];

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      
      // Auto-suggest Tax Department when ward changes
      if (name === 'ward') {
        const selectedWard = availableWards.find(w => w.name === value);
        if (selectedWard) {
          newData.taxDepartment = selectedWard.taxOffice;
        }
      }

      // Reset ward and tax department when province changes
      if (name === 'province') {
        newData.ward = '';
        newData.taxDepartment = '';
      }
      
      return newData;
    });
  };

  const handleSave = async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/api/auth/profile`, {
        phone: user.phone,
        ...formData
      });
      alert('Đã lưu thông tin người nộp thuế thành công!');
      onClose();
    } catch (error) {
      console.error('Error saving profile', error);
      alert('Lỗi khi lưu thông tin');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Thông tin người nộp thuế
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Người nộp thuế</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Mã số thuế cũ</label>
              <input type="text" name="oldTaxCode" value={formData.oldTaxCode} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Mã số thuế hiện tại</label>
              <input type="text" name="taxCode" value={formData.taxCode} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
            </div>
          </div>

          <h3 className="font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Địa chỉ trụ sở chính</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Tỉnh/thành phố trực thuộc trung ương</label>
              <select name="province" value={formData.province} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white">
                <option value="">-- Chọn Tỉnh/Thành phố --</option>
                {provinces.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Phường/xã/thị trấn (Theo mô hình hành chính mới)</label>
              <select name="ward" value={formData.ward} onChange={handleChange} disabled={!formData.province} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">-- Chọn Phường/Xã --</option>
                {availableWards.map(w => (
                  <option key={w.name} value={w.name}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Địa chỉ chi tiết</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" placeholder="VD: Số nhà, đường, phường, quận..." />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
                Tên cơ quan thuế
                <span className="text-xs text-indigo-500 font-normal">*Tự động điền Cơ quan Thuế cơ sở theo phường</span>
              </label>
              <input type="text" name="taxDepartment" value={formData.taxDepartment} onChange={handleChange} className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-slate-50" placeholder="Hệ thống tự động điền Cơ quan Thuế..." readOnly />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">
            Hủy bỏ
          </button>
          <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-indigo-600 transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" />
            {loading ? 'Đang lưu...' : 'Lưu thông tin'}
          </button>
        </div>
      </div>
    </div>
  );
}
