import React from 'react';

export default function AutoTaxLoader({ label = 'Đang tải dữ liệu…', overlay = false }) {
  return (
    <div className={overlay ? 'autotax-route-loader-overlay' : 'autotax-inline-loader'} data-autotax-loader="true">
      <div className="autotax-loader-box">
        <div className="autotax-loader-mark" aria-hidden="true">
          <span className="autotax-loader-ring autotax-loader-ring-one" />
          <span className="autotax-loader-ring autotax-loader-ring-two" />
          <span className="autotax-loader-core">A</span>
        </div>
        <div className="autotax-loader-title">{label}</div>
        <div className="autotax-loader-subtitle">AutoTax đang chuẩn bị màn hình cho bạn</div>
      </div>
    </div>
  );
}
