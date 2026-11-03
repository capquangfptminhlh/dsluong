import React, { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, LogOut, Key, Trash2, Power, Play, RefreshCw, Edit2 } from 'lucide-react';
import axios from 'axios';
import HelpButton from '../components/HelpButton';
import API_BASE from '../config/api';

export default function Settings() {
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [modelName, setModelName] = useState('gemini-2.5-flash');
  const [testingKeyId, setTestingKeyId] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [editingKey, setEditingKey] = useState(null);
  const [editProvider, setEditProvider] = useState('gemini');
  const [editModelName, setEditModelName] = useState('gemini-2.5-flash');
  const [editKeyValue, setEditKeyValue] = useState('');

  const saveEditedKey = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_BASE}/api/settings/gemini-keys/${editingKey.id}`, {
        provider: editProvider,
        model_name: editModelName,
        key_value: editKeyValue
      });
      setEditingKey(null);
      fetchKeys();
    } catch {
      alert("Lỗi cập nhật cấu hình key");
    }
  };

  const testKey = async (id) => {
    setTestingKeyId(id);
    try {
      const res = await axios.post(`${API_BASE}/api/settings/gemini-keys/${id}/test`);
      alert(`Kiểm tra API kết nối THÀNH CÔNG! Phản hồi từ AI: "${res.data.reply}"`);
      fetchKeys();
    } catch (err) {
      alert(`Kết nối thất bại: ${err.response?.data?.error || err.message}`);
      fetchKeys();
    } finally {
      setTestingKeyId(null);
    }
  };
  const [settings, setSettings] = useState({
    shop_name: '',
    address: '',
    phone: '',
    tax_id: '',
    bank_account: '',
    bank_name: '',
    bank_account_name: '',
    custom_domain: ''
  });
  
  const [tunnelStatus, setTunnelStatus] = useState({ isRunning: false, url: null });
  const [tunnelLoading, setTunnelLoading] = useState(false);

  // Thông tin cửa hàng hiển thị trên hóa đơn in
  const [shop, setShop] = useState({ shop_name: '', shop_address: '', shop_phone: '', shop_bank: '' });
  const [shopSaved, setShopSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const g = async (k) => { try { return (await axios.get(`${API_BASE}/api/settings/${k}`)).data.value || ''; } catch { return ''; } };
      const [shop_name, shop_address, shop_phone, shop_bank, custom_domain] = await Promise.all([
        g('shop_name'), g('shop_address'), g('shop_phone'), g('shop_bank'), g('custom_domain')
      ]);
      setShop({ shop_name, shop_address, shop_phone, shop_bank });
      setSettings(prev => ({ ...prev, custom_domain }));
    };
    load();
  }, []);

  const saveShop = async () => {
    try {
      for (const [key, value] of Object.entries(shop)) {
        await axios.post(`${API_BASE}/api/settings`, { key, value });
      }
      setShopSaved(true);
      setTimeout(() => setShopSaved(false), 2500);
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu thông tin cửa hàng');
    }
  };

  const saveCustomDomain = async () => {
    const domain = settings.custom_domain.trim();
    if (!domain) {
      alert("Vui lòng nhập tên miền của bạn");
      return;
    }
    try {
      await axios.post(`${API_BASE}/api/settings`, { key: 'custom_domain', value: domain });
      setSettings(prev => ({ ...prev, custom_domain: domain }));
      alert(`Đã lưu tên miền dự kiến: ${domain}. Hệ thống chưa tự xác minh DNS hoặc kích hoạt tên miền này.`);
    } catch {
      alert("Lỗi khi lưu tên miền");
    }
  };

  const user = JSON.parse(localStorage.getItem('user')) || {};
  // Quyền quản trị đọc từ role do server trả khi đăng nhập (không so số điện thoại ở frontend nữa)
  const isAdmin = user?.role === 'superadmin';

  const fetchTunnelStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await axios.get(`${API_BASE}/api/system/tunnel`);
      setTunnelStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch tunnel status', err);
    }
  }, [isAdmin]);

  const startTunnel = async () => {
    setTunnelLoading(true);
    try {
      await axios.post(`${API_BASE}/api/system/tunnel/start`);
      // Start polling for URL
      const interval = setInterval(async () => {
        const res = await axios.get(`${API_BASE}/api/system/tunnel`);
        if (res.data.url) {
          setTunnelStatus(res.data);
          setTunnelLoading(false);
          clearInterval(interval);
        } else if (!res.data.isRunning) {
          setTunnelStatus(res.data);
          setTunnelLoading(false);
          clearInterval(interval);
        }
      }, 1000);
    } catch {
      alert('Không thể bật hầm!');
      setTunnelLoading(false);
    }
  };

  const stopTunnel = async () => {
    setTunnelLoading(true);
    try {
      await axios.post(`${API_BASE}/api/system/tunnel/stop`);
      setTunnelStatus({ isRunning: false, url: null });
    } catch {
      alert('Lỗi tắt hầm');
    }
    setTunnelLoading(false);
  };

  const fetchKeys = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/settings/gemini-keys`);
      setKeys(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    fetchTunnelStatus();
  }, [fetchKeys, fetchTunnelStatus]);

  const addKey = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/settings/gemini-keys`, { 
        key_value: newKey,
        provider,
        model_name: modelName
      });
      setNewKey('');
      fetchKeys();
    } catch (err) {
      alert(err.response?.data?.error || "Lỗi thêm key");
    }
  };

  const deleteKey = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/settings/gemini-keys/${id}`);
      fetchKeys();
    } catch {
      alert("Lỗi xóa key");
    }
  };

  const toggleKey = async (id, currentStatus) => {
    try {
      await axios.put(`${API_BASE}/api/settings/gemini-keys/${id}/toggle`, { is_active: !currentStatus });
      fetchKeys();
    } catch {
      alert("Lỗi cập nhật key");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-primary" /> Cài đặt Hệ thống
          </h1>
          <p className="text-slate-500 text-sm mt-1">Quản lý cấu hình AI và tài khoản</p>
        </div>
        <HelpButton 
          title="Cài đặt Hệ thống" 
          content="Trang này dùng để thiết lập các cấu hình nâng cao cho phần mềm. Hiện tại bạn có thể quản lý danh sách API Key của Gemini. Hệ thống sẽ tự động xoay vòng (round-robin) các key đang hoạt động để tránh quá tải."
        />
      </div>

      <div className="flex gap-4 mb-6">
        <button onClick={() => setActiveTab('shop')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'shop' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>Cửa hàng</button>
        <button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'general' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>API Key</button>
        <button onClick={() => setActiveTab('domain')} className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'domain' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>Tên miền (DNS)</button>
      </div>

      {activeTab === 'shop' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 max-w-2xl">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Thông tin cửa hàng</h2>
          <p className="text-sm text-slate-500 mb-6">Những thông tin này sẽ in lên hóa đơn bán hàng cho khách.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Tên cửa hàng</label>
              <input value={shop.shop_name} onChange={(e) => setShop({ ...shop, shop_name: e.target.value })}
                placeholder={user.name || 'VD: Tạp hóa Minh Anh'}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Địa chỉ</label>
              <input value={shop.shop_address} onChange={(e) => setShop({ ...shop, shop_address: e.target.value })}
                placeholder="VD: 123 Nguyễn Trãi, Q.1, TP.HCM"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Số điện thoại</label>
              <input value={shop.shop_phone} onChange={(e) => setShop({ ...shop, shop_phone: e.target.value })}
                placeholder={user.phone || '09xxxxxxxx'}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Số tài khoản / ghi chú cuối hóa đơn</label>
              <input value={shop.shop_bank} onChange={(e) => setShop({ ...shop, shop_bank: e.target.value })}
                placeholder="VD: VCB 0123456789 - NGUYEN VAN A"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveShop} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">Lưu thông tin</button>
              {shopSaved && <span className="text-emerald-600 font-semibold text-sm">✓ Đã lưu</span>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'general' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-500" /> Quản lý AI API Key & Cấu hình Model
          </h2>
          <p className="text-sm text-slate-500 mb-6">Thêm API Key từ Google hoặc NVIDIA NIM để kích hoạt các trợ lý AI bán hàng và khai thuế.</p>
          
          <form onSubmit={addKey} className="space-y-4 mb-8 bg-slate-50/50 p-5 rounded-2xl border border-slate-150">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nhà Cung Cấp API</label>
                <select 
                  value={provider}
                  onChange={(e) => {
                    const p = e.target.value;
                    setProvider(p);
                    if (p === 'nvidia') {
                      setModelName('meta/llama-3.1-70b-instruct');
                    } else if (p === 'openrouter') {
                      setModelName('openrouter/auto-free');
                    } else {
                      setModelName('gemini-2.5-flash');
                    }
                  }}
                  className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="gemini">Google Gemini AI</option>
                  <option value="nvidia">NVIDIA NIM (NGC)</option>
                  <option value="openrouter">OpenRouter (Vault)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Mô Hình (Model)</label>
                {provider === 'openrouter' ? (
                  <select 
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="openrouter/auto-free">Auto Free Models Router (Khuyên dùng)</option>
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (OpenRouter)</option>
                    <option value="meta-llama/llama-3.1-405b-instruct:free">Llama 3.1 405B (Free)</option>
                    <option value="meta-llama/llama-3.1-70b-instruct:free">Llama 3.1 70B (Free)</option>
                    <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B (Free)</option>
                    <option value="nvidia/llama-3.1-nemotron-70b-instruct:free">Llama 3.1 Nemotron 70B (Free)</option>
                    <option value="google/gemma-2-9b-it:free">Gemma 2 9B (Free)</option>
                    <option value="google/gemma-2-27b-it:free">Gemma 2 27B (Free)</option>
                    <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
                    <option value="microsoft/phi-3-medium-128k-instruct:free">Phi 3 Medium 128K (Free)</option>
                    <option value="microsoft/phi-3-mini-128k-instruct:free">Phi 3 Mini 128K (Free)</option>
                    <option value="qwen/qwen-2-7b-instruct:free">Qwen 2 7B (Free)</option>
                  </select>
                ) : provider === 'nvidia' ? (
                  <select 
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="meta/llama-3.1-405b-instruct">Llama 3.1 405B (Free - Khuyên dùng)</option>
                    <option value="meta/llama-3.1-70b-instruct">Llama 3.1 70B (Free - Siêu nhanh)</option>
                    <option value="meta/llama-3.1-8b-instruct">Llama 3.1 8B (Free - Rất nhẹ)</option>
                    <option value="nvidia/llama-3.1-nemotron-70b-instruct">Llama 3.1 Nemotron 70B (Free - Tiếng Việt xuất sắc)</option>
                    <option value="nvidia/nemotron-3-ultra-550b-a55b">Nemotron 3 Ultra 550B A55B (Free)</option>
                    <option value="nvidia/nemotron-3.5-content-safety">Nemotron 3.5 Content Safety (Free)</option>
                    <option value="nvidia/nemotron-3-ultra">Nemotron 3 Ultra (Free)</option>
                    <option value="nvidia/nemotron-3-nano-omni">Nemotron 3 Nano Omni (Free)</option>
                    <option value="nvidia/nemotron-3-nano-30b-a3b">Nemotron 3 Nano 30B A3B (Free)</option>
                    <option value="nvidia/nemotron-3-nano-12b-2-vl">Nemotron 3 Nano 12B 2 VL (Free)</option>
                    <option value="nvidia/nemotron-3-nano-9b-v2">Nemotron 3 Nano 9B V2 (Free)</option>
                    <option value="nvidia/nemotron-3-super">Nemotron 3 Super (Free)</option>
                    <option value="nvidia/nemotron-4-340b-instruct">Nemotron 4 340B (Free)</option>
                    <option value="z-ai/glm-5.2">Z-AI GLM 5.2 (Free)</option>
                    <option value="deepseek-ai/deepseek-v4-pro">DeepSeek V4 Pro (Free)</option>
                    <option value="thinkingmachines/inkling">Thinking Machines Inkling (Free)</option>
                    <option value="google/gemma-4-26b-a4b">Google Gemma 4 26B A4B (Free)</option>
                    <option value="google/gemma-4-31b">Google Gemma 4 31B (Free)</option>
                    <option value="google/lyria-3-pro-preview">Google Lyria 3 Pro Preview</option>
                    <option value="google/lyria-3-clip-preview">Google Lyria 3 Clip Preview</option>
                    <option value="google/gemma-2-27b-it">Gemma 2 27B (Free)</option>
                    <option value="google/gemma-2-9b-it">Gemma 2 9B (Free)</option>
                    <option value="poolside/laguna-xs-2.1">Poolside Laguna XS 2.1 (Free)</option>
                    <option value="poolside/laguna-m-1">Poolside Laguna M.1 (Free)</option>
                    <option value="poolside/laguna-s-2.1">Poolside Laguna S 2.1 (Free)</option>
                    <option value="cohere/north-mini-code">Cohere North Mini Code (Free)</option>
                    <option value="openai/gpt-oss-20b">OpenAI GPT Oss 20B (Free)</option>
                    <option value="meta/llama3-70b-instruct">Llama 3 70B (Free)</option>
                    <option value="meta/llama3-8b-instruct">Llama 3 8B (Free)</option>
                    <option value="mistralai/mixtral-8x22b-instruct">Mixtral 8x22B (Free)</option>
                    <option value="mistralai/mistral-large-2-instruct">Mistral Large 2 (Free)</option>
                    <option value="microsoft/phi-3-medium-128k-instruct">Phi 3 Medium 128K (Free)</option>
                    <option value="microsoft/phi-3-mini-128k-instruct">Phi 3 Mini 128K (Free)</option>
                    <option value="deepseek-ai/deepseek-coder-6.7b-instruct">DeepSeek Coder 6.7B (Free)</option>
                  </select>
                ) : (
                  <select 
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Khuyên dùng - Nhanh & Mới nhất)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Cực kỳ chính xác)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                required 
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder={provider === 'nvidia' ? "Nhập NVIDIA API Key (nvapi-...)" : "Nhập API Key Gemini (AIzaSy...)"}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm bg-white font-mono"
              />
              <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors text-sm">
                Thêm Cấu Hình Key
              </button>
            </div>
          </form>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold text-slate-600">Nhà cung cấp</th>
                  <th className="py-3 px-4 font-semibold text-slate-600">Model</th>
                  <th className="py-3 px-4 font-semibold text-slate-600">Key</th>
                  <th className="py-3 px-4 font-semibold text-slate-600 text-center">Số lần dùng</th>
                  <th className="py-3 px-4 font-semibold text-slate-600">Trạng thái</th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-600">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.length === 0 ? (
                  <tr><td colSpan="6" className="py-4 text-center text-slate-500">Chưa có API Key nào. Hãy thêm key để dùng tính năng AI.</td></tr>
                ) : keys.map(k => (
                  <tr key={k.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-bold text-slate-700 capitalize">
                      {k.provider === 'nvidia' ? 'NVIDIA NIM' : 'Google Gemini'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-xs max-w-[150px] truncate">
                      {k.model_name || 'gemini-2.5-flash'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {k.key_value.slice(0, 8)}...{k.key_value.slice(-4)}
                    </td>
                    <td className="py-3 px-4 text-center font-black text-slate-700">{k.usage_count}</td>
                    <td className="py-3 px-4">
                      {k.status === 'failed' ? (
                        <span className="text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded text-xs">Lỗi</span>
                      ) : k.is_active ? (
                        <span className="text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded text-xs">Đang Bật</span>
                      ) : (
                        <span className="text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">Đã Tắt</span>
                      )}
                    </td>
                    <td className="py-3 px-4 flex justify-end gap-2 text-right">
                      <button 
                        onClick={() => testKey(k.id)}
                        disabled={testingKeyId === k.id}
                        className="p-1.5 text-indigo-600 hover:text-indigo-850 bg-indigo-50 rounded disabled:opacity-50"
                        title="Kiểm tra API Key (Test)"
                      >
                        {testingKeyId === k.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button 
                        onClick={() => {
                          setEditingKey(k);
                          setEditProvider(k.provider || 'gemini');
                          setEditModelName(k.model_name || 'gemini-2.5-flash');
                          setEditKeyValue(k.key_value);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded"
                        title="Chỉnh sửa cấu hình"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleKey(k.id, k.is_active)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 rounded" title="Bật/Tắt">
                        <Power className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteKey(k.id)} className="p-1.5 text-slate-400 hover:text-red-600 bg-slate-50 rounded" title="Xóa">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT KEY MODAL */}
      {editingKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-500" /> Chỉnh sửa Cấu hình API Key
            </h3>
            
            <form onSubmit={saveEditedKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nhà Cung Cấp API</label>
                <select 
                  value={editProvider}
                  onChange={(e) => {
                    const p = e.target.value;
                    setEditProvider(p);
                    setEditModelName(p === 'nvidia' ? 'meta/llama-3.1-70b-instruct' : p === 'openrouter' ? 'openrouter/auto-free' : 'gemini-2.5-flash');
                  }}
                  className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="gemini">Google Gemini AI</option>
                  <option value="nvidia">NVIDIA NIM (NGC)</option>
                  <option value="openrouter">OpenRouter (Vault)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Mô Hình (Model)</label>
                {editProvider === 'openrouter' ? (
                  <select 
                    value={editModelName}
                    onChange={(e) => setEditModelName(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="openrouter/auto-free">Auto Free Models Router (Khuyên dùng)</option>
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (OpenRouter)</option>
                    <option value="meta-llama/llama-3.1-405b-instruct:free">Llama 3.1 405B (Free)</option>
                    <option value="meta-llama/llama-3.1-70b-instruct:free">Llama 3.1 70B (Free)</option>
                    <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B (Free)</option>
                    <option value="nvidia/llama-3.1-nemotron-70b-instruct:free">Llama 3.1 Nemotron 70B (Free)</option>
                    <option value="google/gemma-2-9b-it:free">Gemma 2 9B (Free)</option>
                    <option value="google/gemma-2-27b-it:free">Gemma 2 27B (Free)</option>
                    <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
                    <option value="microsoft/phi-3-medium-128k-instruct:free">Phi 3 Medium 128K (Free)</option>
                    <option value="microsoft/phi-3-mini-128k-instruct:free">Phi 3 Mini 128K (Free)</option>
                    <option value="qwen/qwen-2-7b-instruct:free">Qwen 2 7B (Free)</option>
                  </select>
                ) : editProvider === 'nvidia' ? (
                  <select 
                    value={editModelName}
                    onChange={(e) => setEditModelName(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="meta/llama-3.1-405b-instruct">Llama 3.1 405B (Free - Khuyên dùng)</option>
                    <option value="meta/llama-3.1-70b-instruct">Llama 3.1 70B (Free - Siêu nhanh)</option>
                    <option value="meta/llama-3.1-8b-instruct">Llama 3.1 8B (Free - Rất nhẹ)</option>
                    <option value="nvidia/llama-3.1-nemotron-70b-instruct">Llama 3.1 Nemotron 70B (Free - Tiếng Việt xuất sắc)</option>
                    <option value="nvidia/nemotron-3-ultra-550b-a55b">Nemotron 3 Ultra 550B A55B (Free)</option>
                    <option value="nvidia/nemotron-3.5-content-safety">Nemotron 3.5 Content Safety (Free)</option>
                    <option value="nvidia/nemotron-3-ultra">Nemotron 3 Ultra (Free)</option>
                    <option value="nvidia/nemotron-3-nano-omni">Nemotron 3 Nano Omni (Free)</option>
                    <option value="nvidia/nemotron-3-nano-30b-a3b">Nemotron 3 Nano 30B A3B (Free)</option>
                    <option value="nvidia/nemotron-3-nano-12b-2-vl">Nemotron 3 Nano 12B 2 VL (Free)</option>
                    <option value="nvidia/nemotron-3-nano-9b-v2">Nemotron 3 Nano 9B V2 (Free)</option>
                    <option value="nvidia/nemotron-3-super">Nemotron 3 Super (Free)</option>
                    <option value="nvidia/nemotron-4-340b-instruct">Nemotron 4 340B (Free)</option>
                    <option value="z-ai/glm-5.2">Z-AI GLM 5.2 (Free)</option>
                    <option value="deepseek-ai/deepseek-v4-pro">DeepSeek V4 Pro (Free)</option>
                    <option value="thinkingmachines/inkling">Thinking Machines Inkling (Free)</option>
                    <option value="google/gemma-4-26b-a4b">Google Gemma 4 26B A4B (Free)</option>
                    <option value="google/gemma-4-31b">Google Gemma 4 31B (Free)</option>
                    <option value="google/lyria-3-pro-preview">Google Lyria 3 Pro Preview</option>
                    <option value="google/lyria-3-clip-preview">Google Lyria 3 Clip Preview</option>
                    <option value="google/gemma-2-27b-it">Gemma 2 27B (Free)</option>
                    <option value="google/gemma-2-9b-it">Gemma 2 9B (Free)</option>
                    <option value="poolside/laguna-xs-2.1">Poolside Laguna XS 2.1 (Free)</option>
                    <option value="poolside/laguna-m-1">Poolside Laguna M.1 (Free)</option>
                    <option value="poolside/laguna-s-2.1">Poolside Laguna S 2.1 (Free)</option>
                    <option value="cohere/north-mini-code">Cohere North Mini Code (Free)</option>
                    <option value="openai/gpt-oss-20b">OpenAI GPT Oss 20B (Free)</option>
                    <option value="meta/llama3-70b-instruct">Llama 3 70B (Free)</option>
                    <option value="meta/llama3-8b-instruct">Llama 3 8B (Free)</option>
                    <option value="mistralai/mixtral-8x22b-instruct">Mixtral 8x22B (Free)</option>
                    <option value="mistralai/mistral-large-2-instruct">Mistral Large 2 (Free)</option>
                    <option value="microsoft/phi-3-medium-128k-instruct">Phi 3 Medium 128K (Free)</option>
                    <option value="microsoft/phi-3-mini-128k-instruct">Phi 3 Mini 128K (Free)</option>
                    <option value="deepseek-ai/deepseek-coder-6.7b-instruct">DeepSeek Coder 6.7B (Free)</option>
                  </select>
                ) : (
                  <select 
                    value={editModelName}
                    onChange={(e) => setEditModelName(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Mã API Key</label>
                <input 
                  type="text" 
                  required 
                  value={editKeyValue}
                  onChange={e => setEditKeyValue(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button 
                  type="button" 
                  onClick={() => setEditingKey(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors text-sm"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm"
                >
                  Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOMAIN TAB */}
      {activeTab === 'domain' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-2">Tên miền tùy chỉnh</h2>
              <p className="text-slate-500 mb-6">Lưu tên miền bạn dự kiến dùng cho cửa hàng. Việc lưu tại đây chưa làm thay đổi DNS hay kích hoạt tên miền.</p>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
                <h3 className="font-bold text-amber-900 mb-2">Chưa có xác minh DNS tự động</h3>
                <p className="text-sm text-amber-800 leading-6">
                  Phiên bản hiện tại chưa cung cấp target DNS production, chưa kiểm tra bản ghi DNS, chưa cấp SSL và chưa tự cấu hình routing cho tên miền riêng. Vì vậy hệ thống không hiển thị IP/CNAME mẫu và không báo tên miền đã xác minh khi chưa có kiểm tra thật.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Tên miền dự kiến</label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    value={settings.custom_domain}
                    onChange={e => setSettings({...settings, custom_domain: e.target.value})}
                    placeholder="VD: phanmemcuaban.com"
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button onClick={saveCustomDomain} className="bg-slate-800 text-white font-bold px-6 py-3 rounded-xl hover:bg-slate-700 transition">
                    Lưu tên miền
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Tên miền được lưu làm cấu hình dự kiến; không đồng nghĩa DNS, HTTPS hoặc truy cập bằng tên miền đã hoạt động.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN DEPLOYMENT GUIDE */}
      {isAdmin && (
        <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-6 mb-8">
          <h2 className="text-xl font-bold text-indigo-800 mb-4 flex items-center gap-2">
            <Power className="w-6 h-6" /> Trạm Điều Khiển Máy Chủ (Admin)
          </h2>
          
          <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-sm flex flex-col items-center justify-center text-center">
            {tunnelStatus.isRunning && tunnelStatus.url ? (
              <div className="w-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold mb-4 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Đang phát sóng Live
                </div>
                <h3 className="text-slate-500 font-medium mb-2">Link chia sẻ cho khách hàng:</h3>
                
                <div className="flex gap-2 w-full max-w-xl mx-auto">
                  <input 
                    readOnly
                    value={tunnelStatus.url}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-mono text-indigo-600 font-semibold text-center outline-none"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(tunnelStatus.url);
                      alert('Đã copy link!');
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    Copy
                  </button>
                </div>
                
                <p className="mt-6 text-sm text-slate-500">
                  ⚠️ Lưu ý: Giữ nguyên máy tính này để duy trì kết nối mạng.
                </p>

                <button 
                  onClick={stopTunnel}
                  disabled={tunnelLoading}
                  className="mt-6 px-6 py-2 border border-red-200 text-red-600 hover:bg-red-50 font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {tunnelLoading ? 'Đang xử lý...' : '🛑 Tắt Hầm'}
                </button>
              </div>
            ) : (
              <div className="py-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Power className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">Hệ thống đang offline</h3>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  Khách hàng hiện không thể truy cập vào phần mềm. Bấm nút dưới đây để tạo đường hầm Internet an toàn.
                </p>
                <button 
                  onClick={startTunnel}
                  disabled={tunnelLoading}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                >
                  {tunnelLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Power className="w-5 h-5" />
                  )}
                  {tunnelLoading ? 'Đang kết nối...' : 'BẬT HẦM INTERNET'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-red-50 rounded-2xl border border-red-100 p-6">
        <h2 className="text-lg font-bold text-red-800 mb-2">Đăng xuất</h2>
        <p className="text-sm text-red-600 mb-4">Bạn sẽ cần đăng nhập lại bằng SĐT để truy cập hệ thống.</p>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Đăng xuất khỏi thiết bị này
        </button>
      </div>
    </div>
  );
}
