import React, { forwardRef } from 'react';

/**
 * ReceiptTemplate for 80mm thermal printers
 * Designed to be passed into react-to-print or similar printing libraries.
 */
export const ReceiptTemplate = forwardRef(({ 
  cart, 
  total, 
  customer, 
  paymentMethods, 
  cashierName,
  shopInfo = {
    name: 'Nhà Thuốc Nhân Đức',
    address: 'Địa chỉ nhà thuốc',
    phone: 'Hotline tư vấn dược'
  }
}, ref) => {
  return (
    <div ref={ref} style={{
      boxSizing: 'border-box',
      width: '80mm',
      padding: '10px',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#000',
      backgroundColor: '#fff',
      margin: '0 auto',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
        <h2 style={{ margin: '0 0 5px 0', fontSize: '18px', textTransform: 'uppercase' }}>{shopInfo.name}</h2>
        <p style={{ margin: '2px 0' }}>{shopInfo.address}</p>
        <p style={{ margin: '2px 0' }}>Tel: {shopInfo.phone}</p>
        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>
        <h3 style={{ margin: '5px 0' }}>PHIẾU THANH TOÁN</h3>
      </div>

      {/* Meta Info */}
      <div style={{ marginBottom: '10px' }}>
        <p style={{ margin: '2px 0' }}>Ngày: {new Date().toLocaleString('vi-VN')}</p>
        <p style={{ margin: '2px 0' }}>Thu ngân: {cashierName || 'Admin'}</p>
        {customer && <p style={{ margin: '2px 0' }}>Khách hàng: {customer.name}</p>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: '50%', textAlign: 'left', paddingBottom: '5px' }}>Món</th>
            <th style={{ width: '15%', textAlign: 'center', paddingBottom: '5px' }}>SL</th>
            <th style={{ width: '35%', textAlign: 'right', paddingBottom: '5px' }}>T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, index) => (
            <tr key={index}>
              <td style={{ verticalAlign: 'top', padding: '3px 0' }}>{item.name}</td>
              <td style={{ verticalAlign: 'top', textAlign: 'center', padding: '3px 0' }}>{item.quantity}</td>
              <td style={{ verticalAlign: 'top', textAlign: 'right', padding: '3px 0' }}>{item.total.toLocaleString('vi-VN')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
        <span>TỔNG CỘNG:</span>
        <span>{total.toLocaleString('vi-VN')} đ</span>
      </div>

      {/* Payment Details */}
      {paymentMethods && paymentMethods.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          {paymentMethods.map((pm, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>Thanh toán {pm.type}:</span>
              <span>{pm.amount.toLocaleString('vi-VN')} đ</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <p style={{ margin: '2px 0' }}>Xin cảm ơn quý khách!</p>
        <p style={{ margin: '2px 0' }}>Hẹn gặp lại!</p>
        <p style={{ margin: '10px 0 0 0', fontSize: '10px', fontStyle: 'italic' }}>Nhà Thuốc Nhân Đức - Chuẩn GPP</p>
      </div>
    </div>
  );
});
