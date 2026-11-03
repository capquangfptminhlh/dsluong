import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[UI ERROR BOUNDARY]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="surface mx-auto mt-8 max-w-xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Màn hình này gặp sự cố</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Dữ liệu chưa bị thay đổi. Hãy tải lại màn hình; nếu lỗi lặp lại, hệ thống sẽ giữ nguyên phiên đăng nhập để bạn tiếp tục xử lý.
        </p>
        <button
          type="button"
          className="btn-primary mt-6"
          onClick={() => window.location.reload()}
        >
          <RefreshCcw className="h-4 w-4" />
          Tải lại màn hình
        </button>
      </div>
    );
  }
}
