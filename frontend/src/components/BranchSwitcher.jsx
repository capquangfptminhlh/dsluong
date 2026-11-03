import React, { useState, useEffect, useRef } from 'react';
import { Store, ChevronDown, Check, Plus, MapPin, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE from '../config/api';

export default function BranchSwitcher() {
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchBranches = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/branches`);
      const list = res.data || [];
      setBranches(list);

      const savedId = localStorage.getItem('active_branch_id');
      let active = list.find((b) => String(b.id) === String(savedId));
      if (!active) {
        active = list.find((b) => b.is_default) || list[0] || null;
      }

      if (active) {
        setCurrentBranch(active);
        localStorage.setItem('active_branch_id', active.id);
        localStorage.setItem('active_branch_name', active.name);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách chi nhánh:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();

    const handleBranchUpdate = () => {
      fetchBranches();
    };

    window.addEventListener('branchesUpdated', handleBranchUpdate);
    return () => window.removeEventListener('branchesUpdated', handleBranchUpdate);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectBranch = (branch) => {
    setCurrentBranch(branch);
    localStorage.setItem('active_branch_id', branch.id);
    localStorage.setItem('active_branch_name', branch.name);
    setOpen(false);
    // Bắn event để POS và kho tự load lại theo chi nhánh này
    window.dispatchEvent(new CustomEvent('branchChanged', { detail: branch }));
  };

  if (loading && !currentBranch) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl text-xs text-slate-500 animate-pulse">
        <Store className="w-4 h-4" /> Đang tải quầy...
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 rounded-xl transition-all shadow-xs text-xs font-bold"
        title="Bấm để chuyển chi nhánh / quầy thuốc đang bán"
      >
        <div className="p-1 bg-white rounded-lg text-emerald-600 shadow-2xs border border-emerald-100">
          <Store className="w-3.5 h-3.5" />
        </div>
        <div className="text-left max-w-[140px] sm:max-w-[200px] truncate">
          <div className="leading-tight truncate">{currentBranch?.name || 'Chọn Quầy Thuốc'}</div>
          <div className="text-[10px] text-emerald-600 font-medium">
            {currentBranch?.is_default ? 'Cơ sở chính' : 'Chi nhánh phụ'}
          </div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-emerald-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-slate-900">Chi Nhánh & Quầy Thuốc</div>
              <div className="text-[10px] text-slate-500">Mỗi quầy quản lý tồn kho độc lập</div>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
              {branches.length} quầy
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {branches.map((b) => {
              const isSelected = currentBranch?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => selectBranch(b)}
                  className={`w-full px-4 py-2.5 text-left flex items-start justify-between gap-2 hover:bg-emerald-50/60 transition-colors ${
                    isSelected ? 'bg-emerald-50/90 text-emerald-900' : 'text-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate">{b.name}</span>
                      {b.is_default === 1 && (
                        <span className="px-1.5 py-0.2 bg-emerald-200/80 text-emerald-900 rounded text-[9px] font-black uppercase">
                          Gốc
                        </span>
                      )}
                    </div>
                    {b.address && (
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" /> {b.address}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Tồn: <strong className="text-slate-800">{b.tong_ton || 0}</strong> sp ({b.so_mat_hang || 0} mục)
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>

          <div className="pt-2 px-3 border-t border-slate-100 mt-1">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/app/branches');
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 hover:bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-dashed border-emerald-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo Quầy Thuốc / Chi Nhánh Mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
