import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Cloud, Copy, ExternalLink, RefreshCw, ShieldCheck, Square, Play } from 'lucide-react';
import API_BASE from '../config/api';

export default function CloudflareSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/system/tunnel`);
      setStatus(response.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Không đọc được trạng thái Cloudflare Tunnel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.isRunning || status?.url) return undefined;
    const timer = window.setInterval(loadStatus, 1500);
    return () => window.clearInterval(timer);
  }, [status?.isRunning, status?.url, loadStatus]);

  const startTunnel = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await axios.post(`${API_BASE}/api/system/tunnel/start`);
      setMessage(response.data?.message || 'Đang khởi động Cloudflare Tunnel.');
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể khởi động Cloudflare Tunnel.');
    } finally {
      setBusy(false);
    }
  };

  const stopTunnel = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await axios.post(`${API_BASE}/api/system/tunnel/stop`);
      setMessage(response.data?.message || 'Đã dừng Cloudflare Tunnel.');
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể dừng Cloudflare Tunnel.');
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!status?.url) return;
    await navigator.clipboard.writeText(status.url);
    setMessage('Đã sao chép đường dẫn public.');
  };

  if (loading) {
    return <div className="p-4 sm:p-6 lg:p-8 text-sm font-semibold text-slate-500">Đang kiểm tra Cloudflare Tunnel…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-600"><Cloud className="h-7 w-7" /></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Cloudflare Tunnel</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Mở đường dẫn HTTPS tạm thời tới AutoTax mà không cần mở thêm cổng inbound trên router. Chỉ tài khoản chủ cửa hàng được phép điều khiển.</p>
            </div>
          </div>
          <button onClick={loadStatus} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
        </div>
      </section>

      {(message || error) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Cloudflared</div>
          <div className={`mt-2 text-lg font-black ${status?.available ? 'text-emerald-600' : 'text-rose-600'}`}>{status?.available ? 'Sẵn sàng' : 'Chưa cài'}</div>
          <div className="mt-1 break-words text-xs text-slate-500">{status?.version || 'Không phát hiện binary cloudflared'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Trạng thái</div>
          <div className={`mt-2 text-lg font-black ${status?.isRunning ? 'text-emerald-600' : 'text-slate-700'}`}>{status?.isRunning ? 'Đang chạy' : 'Đang dừng'}</div>
          <div className="mt-1 text-xs text-slate-500">{status?.startedAt ? `Bắt đầu: ${new Date(status.startedAt).toLocaleString('vi-VN')}` : 'Không có tiến trình tunnel đang hoạt động'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Đích nội bộ</div>
          <div className="mt-2 break-all text-sm font-black text-slate-800">{status?.target || '—'}</div>
          <div className="mt-1 text-xs text-slate-500">Đích được cấu hình phía máy chủ, không nhận URL tùy ý từ trình duyệt.</div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-2 text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-600" /><h2 className="text-lg font-black">Điều khiển tunnel</h2></div>
        {status?.url ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Đường dẫn public</div>
            <div className="mt-2 break-all text-base font-black text-emerald-900">{status.url}</div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button onClick={copyUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 shadow-sm"><Copy className="h-4 w-4" /> Sao chép</button>
              <a href={status.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"><ExternalLink className="h-4 w-4" /> Mở đường dẫn</a>
            </div>
          </div>
        ) : status?.isRunning ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Tunnel đang khởi động và chưa trả về URL public. Trang sẽ tự kiểm tra lại trạng thái.</div>
        ) : (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">Tunnel hiện đang tắt. Khi bật, URL tạm thời do Cloudflare cấp sẽ xuất hiện tại đây.</div>
        )}

        {status?.lastError && <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">Lỗi gần nhất: {status.lastError}</div>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {status?.isRunning ? (
            <button onClick={stopTunnel} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"><Square className="h-4 w-4" /> Dừng Tunnel</button>
          ) : (
            <button onClick={startTunnel} disabled={busy || !status?.available} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" /> Bật Tunnel</button>
          )}
        </div>
      </section>
    </div>
  );
}
