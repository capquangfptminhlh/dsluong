import React, { useState, useEffect } from 'react';
import { Globe, Link2, Trash2, Smartphone, Monitor, ShoppingBag, X, Zap, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function OmnichannelIntegration() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newPlatform, setNewPlatform] = useState('');
  const [apiConfig, setApiConfig] = useState({ app_key: '', app_secret: '', shop_id: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/omni/channels`);
      setChannels(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async (e) => {
    e.preventDefault();
    if (!newPlatform) return;
    try {
      await axios.post(`${API_BASE}/api/omni/channels`, { platform: newPlatform, ...apiConfig });
      setShowModal(false);
      setNewPlatform('');
      setApiConfig({ app_key: '', app_secret: '', shop_id: '' });
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Có lỗi xảy ra khi lưu cấu hình kênh!');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa cấu hình kênh này? Đơn mới từ webhook của kênh sẽ không được nhận cho tới khi cấu hình lại.')) return;
    try {
      await axios.delete(`${API_BASE}/api/omni/channels/${id}`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Không thể xóa cấu hình kênh');
    }
  };

  const getPlatformIcon = (platform) => {
    if (platform.toLowerCase().includes('shopee')) return <ShoppingBag className="w-10 h-10" />;
    if (platform.toLowerCase().includes('tiktok')) return <Smartphone className="w-10 h-10" />;
    if (platform.toLowerCase().includes('lazada')) return <Monitor className="w-10 h-10" />;
    return <Globe className="w-10 h-10" />;
  };

  const getPlatformGradient = (platform) => {
    if (platform.toLowerCase().includes('shopee')) return 'from-orange-500 to-red-500 shadow-orange-500/30';
    if (platform.toLowerCase().includes('tiktok')) return 'from-slate-800 to-black shadow-slate-800/30';
    if (platform.toLowerCase().includes('lazada')) return 'from-blue-600 to-indigo-600 shadow-blue-600/30';
    return 'from-emerald-500 to-teal-500 shadow-emerald-500/30';
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      <div className="p-8 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Globe className="w-8 h-8 text-indigo-600" /> Bán Hàng Đa Kênh (Omnichannel)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Quản lý cấu hình kênh và tiếp nhận đơn từ webhook đã xác thực vào đúng kho cửa hàng.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
        >
          <Link2 className="w-5 h-5" /> Cấu hình Kênh Mới
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Trạng thái tích hợp hiện tại</h2>
            <p className="text-slate-500 text-sm mt-0.5">AutoTax hiện nhận đơn qua webhook có khóa bí mật. Pull-sync trực tiếp/OAuth với từng sàn chưa được bật, nên hệ thống không hiển thị trạng thái “đang kết nối” giả.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-500 font-medium">Đang tải cấu hình kênh bán hàng...</div>
          ) : channels.length === 0 ? (
            <div className="col-span-full p-16 text-center bg-white rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center">
              <Globe className="w-20 h-20 text-slate-200 mb-6" />
              <p className="text-xl font-black text-slate-700">Chưa có kênh bán hàng nào được cấu hình.</p>
              <p className="text-slate-500 mt-2 font-medium">Bấm “Cấu hình Kênh Mới” để lưu thông tin kênh trước khi nhận webhook.</p>
            </div>
          ) : (
            channels.map((ch) => {
              const gradient = getPlatformGradient(ch.platform);
              const configured = ch.status === 'configured' || ch.status === 'connected';

              return (
                <div key={ch.id} className="bg-white rounded-3xl p-1 border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className={`h-32 bg-gradient-to-r ${gradient} rounded-t-[22px] p-6 text-white relative overflow-hidden`}>
                    <div className="absolute -bottom-8 -right-8 opacity-20 transform -rotate-12 scale-150">
                      {getPlatformIcon(ch.platform)}
                    </div>
                    <div className="relative z-10">
                      <h3 className="font-black text-2xl tracking-wide">{ch.platform}</h3>
                      <div className="flex items-center gap-1.5 mt-2 text-sm font-medium bg-black/20 w-fit px-3 py-1 rounded-full backdrop-blur-md">
                        <Zap className="w-3.5 h-3.5" /> Webhook nhận đơn
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-white rounded-b-[22px]">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái cấu hình</span>
                        {configured ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-black border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Đã Cấu Hình
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 bg-slate-100 text-slate-500 text-xs rounded-full font-black border border-slate-200">
                            Cần Cấu Hình Lại
                          </span>
                        )}
                      </div>

                      <button onClick={() => handleDelete(ch.id)} aria-label={`Xóa cấu hình ${ch.platform}`} className="w-10 h-10 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center gap-4">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đơn đã nhận qua webhook</div>
                        <div className="font-black text-2xl text-slate-800">{Number(ch.order_count || 0)} <span className="text-sm text-slate-500 font-medium">đơn</span></div>
                      </div>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl text-right">Không có sync tay</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Link2 className="w-6 h-6 text-indigo-600" /> Cấu hình Sàn Thương Mại
              </h2>
              <button onClick={() => setShowModal(false)} aria-label="Đóng" className="text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddChannel} className="p-6 space-y-5 bg-slate-50">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Chọn nền tảng cần cấu hình <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {['Shopee', 'TikTok Shop', 'Lazada'].map((plat) => (
                    <button
                      type="button"
                      key={plat}
                      onClick={() => {
                        setNewPlatform(plat);
                        setApiConfig({ app_key: '', app_secret: '', shop_id: '' });
                      }}
                      className={`cursor-pointer rounded-xl border-2 p-3 flex flex-col items-center justify-center gap-2 text-center transition-all ${newPlatform === plat ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
                    >
                      {getPlatformIcon(plat)}
                      <span className={`text-xs font-bold ${newPlatform === plat ? 'text-indigo-700' : 'text-slate-600'}`}>{plat}</span>
                    </button>
                  ))}
                </div>
              </div>

              {newPlatform && (
                <div className="space-y-4 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-4">
                  <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" /> Cấu hình API Open Platform
                  </h3>
                  <p className="text-xs text-slate-500">Thông tin này được lưu cho cửa hàng nhưng chưa tự xác minh OAuth với sàn. Sau khi lưu, trạng thái sẽ là “Đã cấu hình”.</p>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">App Key (Client ID) <span className="text-red-500">*</span></label>
                    <input type="text" value={apiConfig.app_key} onChange={(e) => setApiConfig({ ...apiConfig, app_key: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-sm transition-all" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">App Secret (Client Secret) <span className="text-red-500">*</span></label>
                    <input type="password" value={apiConfig.app_secret} onChange={(e) => setApiConfig({ ...apiConfig, app_secret: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-sm transition-all" required autoComplete="new-password" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Shop ID (Mã cửa hàng) <span className="text-red-500">*</span></label>
                    <input type="text" value={apiConfig.shop_id} onChange={(e) => setApiConfig({ ...apiConfig, shop_id: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-sm transition-all" required />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-3 rounded-xl text-slate-600 bg-white border border-slate-200 font-bold hover:bg-slate-100 transition-colors">Hủy Bỏ</button>
                <button type="submit" disabled={!newPlatform} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                  Lưu Cấu Hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
