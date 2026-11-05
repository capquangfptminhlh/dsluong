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
    name: 'NHÀ THUỐC NHÂN ĐỨC',
    address: '172 Quốc Lộ 50, KP4, TT. Cần Giuộc, H. Cần Giuộc, Long An',
    phone: '0933.324.368'
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
        <h2 style={{ margin: '0 0 5px 0', fontSize: '18px', textTransform: 'uppercase', fontWeight: 'bold' }}>{shopInfo.name || 'NHÀ THUỐC NHÂN ĐỨC'}</h2>
        <p style={{ margin: '2px 0', fontSize: '11px' }}>{shopInfo.address || '172 Quốc Lộ 50, KP4, TT. Cần Giuộc, H. Cần Giuộc, Long An'}</p>
        <p style={{ margin: '2px 0', fontSize: '11px' }}>Hotline Dược sĩ: {shopInfo.phone || '0933.324.368'}</p>
        <p style={{ margin: '2px 0', fontSize: '10px', fontStyle: 'italic' }}>Chuẩn Thực Hành Tốt Nhà Thuốc (GPP)</p>
        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>
        <h3 style={{ margin: '5px 0', fontSize: '15px', fontWeight: 'bold' }}>HÓA ĐƠN BÁN THUỐC</h3>
      </div>

      {/* Meta Info */}
      <div style={{ marginBottom: '10px', fontSize: '11px' }}>
        <div>Ngày: {new Date().toLocaleString('vi-VN')}</div>
        <div>Khách hàng: {customer?.name || 'Khách lẻ'}</div>
        {customer?.phone && <div>SĐT: {customer.phone}</div>}
        <div>Dược sĩ / Thu ngân: {cashierName || 'Dược sĩ trực quầy'}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }}></div>

      {/* Cart Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ padding: '4px 0', width: '45%' }}>Tên thuốc</th>
            <th style={{ padding: '4px 0', textAlign: 'center', width: '15%' }}>SL</th>
            <th style={{ padding: '4px 0', textAlign: 'right', width: '20%' }}>Đ.Giá</th>
            <th style={{ padding: '4px 0', textAlign: 'right', width: '20%' }}>T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          {cart && cart.map((item, idx) => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            return (
              <tr key={idx} style={{ borderBottom: '1px dotted #ccc' }}>
                <td style={{ padding: '4px 0' }}>
                  <div>{item.name}</div>
                  {item.unit_name && <span style={{ fontSize: '9px', color: '#555' }}>ĐVT: {item.unit_name}</span>}
                </td>
                <td style={{ padding: '4px 0', textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ padding: '4px 0', textAlign: 'right' }}>{(item.price || 0).toLocaleString('vi-VN')}</td>
                <td style={{ padding: '4px 0', textAlign: 'right' }}>{itemTotal.toLocaleString('vi-VN')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

      {/* Summary */}
      <div style={{ fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span>Tổng tiền thuốc:</span>
          <span>{(total?.subtotal || total?.grandTotal || 0).toLocaleString('vi-VN')} đ</span>
        </div>
        {total?.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span>Giảm giá:</span>
            <span>-{(total.discount).toLocaleString('vi-VN')} đ</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>
          <span>KHÁCH PHẢI TRẢ:</span>
          <span>{(total?.grandTotal || 0).toLocaleString('vi-VN')} đ</span>
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

      {/* Footer / Medical Reminders */}
      <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '10px' }}>
        <p style={{ margin: '2px 0', fontWeight: 'bold' }}>LƯU Ý DÙNG THUỐC:</p>
        <p style={{ margin: '2px 0' }}>Uống thuốc đúng liều và thời gian theo hướng dẫn của Dược sĩ.</p>
        <p style={{ margin: '2px 0' }}>Đổi trả trong 48h nếu thuốc có lỗi bao bì sản xuất.</p>
        <p style={{ margin: '6px 0 2px 0', fontWeight: 'bold' }}>Kính chúc Quý khách nhiều sức khỏe!</p>
        <p style={{ margin: '2px 0' }}>Hotline Dược sĩ: 0933.324.368</p>
      </div>
    </div>
  );
});
