import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Keyboard, LoaderCircle, RefreshCw, ScanLine, ShieldAlert, X } from 'lucide-react';
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';

const VIDEO_READY_TIMEOUT_MS = 6500;

function cameraErrorMessage(error) {
  const name = String(error?.name || '');
  const text = String(error?.message || error || '');
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'Camera chỉ hoạt động trên kết nối HTTPS an toàn.';
  }
  if (name === 'NotAllowedError' || /permission|denied|notallowed/i.test(text)) {
    return 'Camera đang bị chặn. Hãy cho phép quyền Camera cho AutoTax trong trình duyệt rồi thử lại.';
  }
  if (name === 'NotFoundError' || /not found|no camera|devices found/i.test(text)) {
    return 'Không tìm thấy camera trên thiết bị này.';
  }
  if (name === 'NotReadableError' || /could not start|notreadable|track start|device in use/i.test(text)) {
    return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng camera khác rồi thử lại.';
  }
  if (name === 'OverconstrainedError') {
    return 'Không mở được camera đã chọn. Hãy thử đổi camera hoặc dùng ảnh/chế độ nhập mã.';
  }
  if (/timeout|video did not start|video unavailable/i.test(text)) {
    return 'Camera đã được cấp quyền nhưng hình ảnh không khởi động. Hãy bấm Đổi camera hoặc Mở lại camera.';
  }
  return 'Không thể mở camera. Bạn vẫn có thể quét từ ảnh hoặc nhập mã thủ công.';
}

function stopMediaStream(video) {
  const stream = video?.srcObject;
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch { }
    });
  }
  if (video) {
    try { video.pause(); } catch { }
    video.srcObject = null;
  }
}

function waitForVideo(video, timeoutMs = VIDEO_READY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error('video unavailable'));
      return;
    }

    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', verify);
      video.removeEventListener('playing', verify);
      video.removeEventListener('canplay', verify);
      if (error) reject(error); else resolve();
    };
    const verify = () => {
      const stream = video.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      const live = track ? track.readyState === 'live' : false;
      if (live && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish();
    };
    const timer = window.setTimeout(() => finish(new Error('video did not start before timeout')), timeoutMs);

    video.addEventListener('loadedmetadata', verify);
    video.addEventListener('playing', verify);
    video.addEventListener('canplay', verify);
    verify();
    void video.play().then(verify).catch(() => {});
  });
}

function codeText(result) {
  if (!result) return '';
  if (typeof result.getText === 'function') return result.getText();
  return String(result.text || result || '');
}

export default function BarcodeScannerModal({ open, onClose, onDetected, title = 'Quét mã vạch' }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const resolvingRef = useRef(false);
  const lastScanRef = useRef({ code: '', at: 0 });
  const closeTimerRef = useRef(null);
  const runRef = useRef(0);
  const openRef = useRef(open);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [mode, setMode] = useState('camera');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState('');

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const stopActiveCamera = useCallback(async () => {
    const controls = controlsRef.current;
    controlsRef.current = null;
    if (controls) {
      try { controls.stop(); } catch { }
    }
    readerRef.current = null;
    stopMediaStream(videoRef.current);
  }, []);

  const cancelCamera = useCallback(async () => {
    runRef.current += 1;
    await stopActiveCamera();
  }, [stopActiveCamera]);

  const consumeCode = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code || resolvingRef.current) return;
    const now = Date.now();
    if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1400) return;
    lastScanRef.current = { code, at: now };
    resolvingRef.current = true;
    setError('');
    setSuccess('');

    try {
      const result = await onDetectedRef.current?.(code);
      if (result === false || result?.ok === false) {
        setError(result?.message || `Không tìm thấy sản phẩm có mã ${code}.`);
        setStatus(videoRef.current?.srcObject ? 'scanning' : 'idle');
        return;
      }

      setSuccess(result?.message || `Đã nhận mã ${code}.`);
      setStatus('success');
      await cancelCamera();
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => onCloseRef.current?.(), 320);
    } catch (scanError) {
      setError(scanError?.message || 'Không thể xử lý mã vừa quét.');
      setStatus(videoRef.current?.srcObject ? 'scanning' : 'idle');
    } finally {
      resolvingRef.current = false;
    }
  }, [cancelCamera]);

  const refreshCameraDevices = useCallback(async () => {
    try {
      const devices = await BrowserCodeReader.listVideoInputDevices();
      setCameraDevices(devices || []);
      return devices || [];
    } catch {
      setCameraDevices([]);
      return [];
    }
  }, []);

  const startCamera = useCallback(async (deviceId = '') => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    setMode('camera');
    setError('');
    setSuccess('');
    setStatus('starting');
    await stopActiveCamera();

    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      if (runId === runRef.current) {
        setStatus('error');
        setError('Camera chỉ hoạt động trên kết nối HTTPS an toàn.');
      }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (runId === runRef.current) {
        setStatus('error');
        setError('Trình duyệt này không hỗ trợ camera trực tiếp. Hãy dùng ảnh hoặc nhập mã thủ công.');
      }
      return;
    }

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const video = videoRef.current;
    if (!video || !openRef.current || runId !== runRef.current) return;

    const constraints = {
      audio: false,
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
    };

    let controls;
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      controls = await reader.decodeFromConstraints(constraints, video, (scanResult) => {
        if (!scanResult || runId !== runRef.current || !openRef.current) return;
        void consumeCode(codeText(scanResult));
      });

      if (!openRef.current || runId !== runRef.current) {
        try { controls.stop(); } catch { }
        stopMediaStream(video);
        return;
      }

      controlsRef.current = controls;
      await waitForVideo(video);
      if (!openRef.current || runId !== runRef.current) {
        try { controls.stop(); } catch { }
        stopMediaStream(video);
        return;
      }

      const track = video.srcObject?.getVideoTracks?.()[0];
      const settings = track?.getSettings?.() || {};
      setActiveCameraId(settings.deviceId || deviceId || '');
      setStatus('scanning');
      void refreshCameraDevices();
    } catch (cameraError) {
      if (controls) {
        try { controls.stop(); } catch { }
      }
      stopMediaStream(video);
      controlsRef.current = null;
      readerRef.current = null;
      if (runId !== runRef.current || !openRef.current) return;
      setStatus('error');
      setError(cameraErrorMessage(cameraError));
      void refreshCameraDevices();
    }
  }, [consumeCode, refreshCameraDevices, stopActiveCamera]);

  const switchCamera = async () => {
    let devices = cameraDevices;
    if (devices.length < 2) devices = await refreshCameraDevices();
    if (!devices.length) {
      await startCamera();
      return;
    }
    const currentIndex = devices.findIndex((camera) => camera.deviceId === activeCameraId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % devices.length : 0;
    await startCamera(devices[nextIndex].deviceId);
  };

  useEffect(() => {
    if (!open) {
      void cancelCamera();
      return undefined;
    }
    setStatus('idle');
    setError('');
    setSuccess('');
    setManualCode('');
    setMode('camera');
    setCameraDevices([]);
    setActiveCameraId('');
    lastScanRef.current = { code: '', at: 0 };
    const timer = window.setTimeout(() => { void startCamera(); }, 120);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(closeTimerRef.current);
      void cancelCamera();
    };
  }, [cancelCamera, open, startCamera]);

  const scanImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMode('image');
    setError('');
    setSuccess('');
    setStatus('starting');
    await cancelCamera();

    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      await consumeCode(codeText(result));
    } catch {
      setStatus('error');
      setError('Không đọc được mã trong ảnh này. Hãy chụp rõ mã hơn hoặc nhập mã thủ công.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const submitManual = async (event) => {
    event.preventDefault();
    await consumeCode(manualCode);
  };

  const close = async () => {
    window.clearTimeout(closeTimerRef.current);
    await cancelCamera();
    onCloseRef.current?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-4" data-testid="barcode-scanner-modal">
      <div className="flex h-dvh w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-[28px]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><ScanLine className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-slate-900 sm:text-lg">{title}</h2>
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">Đưa mã vào giữa khung. Nếu máy có nhiều ống kính, bấm Đổi camera để chọn ống kính rõ nhất.</p>
          </div>
          <button type="button" onClick={close} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Đóng máy quét"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="relative h-[42dvh] min-h-[260px] max-h-[420px] overflow-hidden rounded-[24px] bg-slate-950 shadow-inner" data-camera-status={status} data-testid="barcode-reader">
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full bg-black object-cover" data-testid="barcode-video" />
            {(status === 'starting' || status === 'idle') && mode === 'camera' && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/78 text-white">
                <div className="text-center"><LoaderCircle className="mx-auto h-7 w-7 animate-spin" /><p className="mt-2 text-xs font-bold">Đang mở camera…</p></div>
              </div>
            )}
            {status === 'scanning' && mode === 'camera' && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-[9%] top-1/2 h-[2px] -translate-y-1/2 animate-pulse bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_18px_rgba(34,211,238,.9)]" />
                <div className="absolute inset-x-[9%] top-1/2 h-[150px] -translate-y-1/2 rounded-2xl border border-white/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,.3)]" />
              </div>
            )}
            {status === 'error' && mode === 'camera' && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/82 px-7 text-center text-white/85">
                <Camera className="mx-auto h-9 w-9 text-white/55" />
                <p className="mt-3 text-xs font-bold">Camera chưa hiển thị hình ảnh</p>
              </div>
            )}
          </div>

          <div className="mt-3 min-h-[48px]" data-testid="barcode-scanner-status">
            {status === 'scanning' && !error && !success && <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><Camera className="h-4 w-4" />Camera đang chạy — giữ mã đứng yên trong khung.</div>}
            {error && <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
            {success && <div className="rounded-2xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700">✓ {success}</div>}
          </div>

          <div className={`mt-2 grid gap-2 ${cameraDevices.length > 1 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button type="button" onClick={() => void startCamera(activeCameraId)} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50" data-testid="barcode-retry-camera"><RefreshCw className="h-4 w-4" />Mở lại</button>
            {cameraDevices.length > 1 && <button type="button" onClick={() => void switchCamera()} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50" data-testid="barcode-switch-camera"><Camera className="h-4 w-4" />Đổi camera</button>}
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
              <ImageIcon className="h-4 w-4" />Quét từ ảnh
              <input type="file" accept="image/*" capture="environment" onChange={scanImage} className="sr-only" data-testid="barcode-image-input" />
            </label>
          </div>

          <form onSubmit={submitManual} className="mt-3 rounded-[22px] border border-slate-200 bg-slate-50 p-3">
            <label htmlFor="autotax-barcode-manual" className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-700"><Keyboard className="h-4 w-4" />Không quét được? Nhập mã thủ công</label>
            <div className="flex gap-2">
              <input id="autotax-barcode-manual" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Mã vạch / SKU" autoComplete="off" inputMode="text" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base font-semibold outline-none focus:border-blue-500" data-testid="barcode-manual-input" />
              <button type="submit" disabled={!manualCode.trim()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40" data-testid="barcode-manual-submit">Thêm</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
