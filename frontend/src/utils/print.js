/**
 * Tiện ích in: hóa đơn K80 và tem mã vạch.
 * Tự sinh mã vạch Code39 (không cần thư viện ngoài) — Code39 quét được bằng
 * mọi máy quét phổ thông, không cần checksum.
 */

// Bảng mã Code39: mỗi ký tự = 9 vạch/khoảng (n = hẹp, w = rộng), xen kẽ bắt đầu bằng vạch đen.
const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn', // '*' = start/stop
};

/** Sinh SVG mã vạch Code39 cho chuỗi (chữ hoa, số và một số ký tự). */
export function barcodeSVG(text, { height = 50, narrow = 2, wide = 6, showText = true } = {}) {
  const clean = String(text || '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');
  const chars = `*${clean}*`.split('');
  let x = 0;
  const rects = [];
  chars.forEach((ch) => {
    const pat = CODE39[ch];
    if (!pat) return;
    for (let i = 0; i < pat.length; i++) {
      const w = pat[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`);
      x += w;
    }
    x += narrow; // khoảng hẹp ngăn cách giữa các ký tự
  });
  const w = x;
  const totalH = height + (showText ? 16 : 0);
  const label = showText
    ? `<text x="${w / 2}" y="${height + 13}" font-family="monospace" font-size="12" text-anchor="middle" fill="#000">${clean}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}">${rects.join('')}${label}</svg>`;
}

function money(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
}

function moPrintWindow(html, title) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) { alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup rồi thử lại.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  // Đợi nội dung (và mã vạch) vẽ xong rồi mới in
  setTimeout(() => { w.print(); }, 350);
}

/**
 * In hóa đơn khổ K80 (58–80mm).
 * shop: { name, address, phone, bank }
 * order: { order_code, date, customer, cart:[{name,quantity,price}], totalAmount, paymentMethod }
 */
export function inHoaDonK80(order, shop = {}) {
  const rows = (order.cart || []).map((it) => `
    <tr>
      <td style="padding:2px 0">${it.name}<div style="font-size:10px;color:#555">${it.quantity} x ${money(it.price)}</div>${Number(it.warranty_months) > 0 ? `<div style="font-size:10px;font-weight:700;color:#0f766e">Bảo hành: ${it.warranty_months} tháng</div>` : ''}</td>
      <td style="text-align:right;vertical-align:top;padding:2px 0;white-space:nowrap">${money(it.price * it.quantity)}</td>
    </tr>`).join('');

  const html = `
    <style>
      @page { size: 80mm auto; margin: 3mm; }
      * { font-family: 'Segoe UI', Tahoma, sans-serif; }
      body { width: 74mm; margin: 0 auto; color: #000; }
      .c { text-align: center; }
      .b { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
    </style>
    <div class="c">
      <div class="b" style="font-size:18px;text-transform:uppercase">${shop.name || 'CỬA HÀNG'}</div>
      ${shop.address ? `<div style="font-size:11px">${shop.address}</div>` : ''}
      ${shop.phone ? `<div style="font-size:11px">ĐT: ${shop.phone}</div>` : ''}
    </div>
    <div class="line"></div>
    <div class="c b" style="font-size:15px;margin-bottom:4px">HÓA ĐƠN BÁN HÀNG</div>
    <div style="font-size:11px">
      <div style="display:flex;justify-content:space-between"><span>Mã đơn:</span><span class="b">${order.order_code || ''}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Ngày:</span><span>${order.date || ''}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Khách:</span><span>${(order.customer && order.customer.name) || 'Khách lẻ'}</span></div>
    </div>
    <div class="line"></div>
    <table>${rows}</table>
    <div class="line"></div>
    <table style="font-size:12px">
      ${order.discount > 0 ? `<tr><td>Tiền hàng</td><td style="text-align:right">${money(order.subtotal)} đ</td></tr>
      <tr><td>Chiết khấu</td><td style="text-align:right">- ${money(order.discount)} đ</td></tr>` : ''}
      ${order.vat_amount > 0 ? `<tr><td>VAT ${order.vat_rate}%</td><td style="text-align:right">+ ${money(order.vat_amount)} đ</td></tr>` : ''}
    </table>
    <table style="font-size:14px">
      <tr class="b"><td>TỔNG CỘNG</td><td style="text-align:right">${money(order.totalAmount)} đ</td></tr>
    </table>
    <div style="font-size:11px;margin-top:4px">
      ${order.paid_cash > 0 ? `<div style="display:flex;justify-content:space-between"><span>Tiền mặt:</span><span>${money(order.paid_cash)} đ</span></div>` : ''}
      ${order.paid_bank > 0 ? `<div style="display:flex;justify-content:space-between"><span>Chuyển khoản:</span><span>${money(order.paid_bank)} đ</span></div>` : ''}
      ${order.debt_amount > 0 ? `<div style="display:flex;justify-content:space-between" class="b"><span>CÒN NỢ:</span><span>${money(order.debt_amount)} đ</span></div>` : ''}
      ${!order.paid_cash && !order.paid_bank ? `<div style="display:flex;justify-content:space-between"><span>Thanh toán:</span><span class="b">${order.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'}</span></div>` : ''}
    </div>
    ${shop.bank ? `<div style="font-size:10px;text-align:center;margin-top:4px">${shop.bank}</div>` : ''}
    <div class="line"></div>
    <div class="c" style="font-size:11px;font-style:italic;margin-top:6px">Cảm ơn quý khách và hẹn gặp lại!</div>
  `;
  moPrintWindow(html, `Hoa don ${order.order_code || ''}`);
}

/**
 * In phiếu thu / phiếu chi (khổ A5 ngang, in được trên A4).
 * phieu: { loai:'in'|'out', code, amount, category, notes, created_at, payment_method }
 */
export function inPhieuThuChi(phieu, shop = {}) {
  const laThu = phieu.loai === 'in' || phieu.transaction_type === 'in';
  const tieuDe = laThu ? 'PHIẾU THU' : 'PHIẾU CHI';
  const soTien = phieu.amount || 0;

  const html = `
    <style>
      @page { size: A5 landscape; margin: 10mm; }
      * { font-family: 'Times New Roman', serif; color: #000; }
      body { margin: 0; }
      .head { display: flex; justify-content: space-between; font-size: 12px; }
      .title { text-align: center; margin: 14px 0 4px; font-size: 22px; font-weight: bold; letter-spacing: 1px; }
      .sub { text-align: center; font-size: 12px; font-style: italic; margin-bottom: 14px; }
      table { width: 100%; font-size: 14px; border-collapse: collapse; }
      td { padding: 5px 0; vertical-align: top; }
      .lb { width: 130px; }
      .dot { border-bottom: 1px dotted #000; }
      .sign { display: flex; justify-content: space-around; margin-top: 34px; font-size: 12px; text-align: center; }
      .sign div { width: 30%; }
      .sign .r { font-weight: bold; margin-bottom: 44px; }
    </style>
    <div class="head">
      <div>
        <b>${shop.name || 'CỬA HÀNG'}</b>
        ${shop.address ? `<div>${shop.address}</div>` : ''}
      </div>
      <div>Số: <b>${phieu.reference_id || phieu.code || ''}</b></div>
    </div>

    <div class="title">${tieuDe}</div>
    <div class="sub">Ngày ${(phieu.created_at || '').replace('T', ' ').split(' ')[0] || new Date().toLocaleDateString('vi-VN')}</div>

    <table>
      <tr><td class="lb">${laThu ? 'Người nộp tiền' : 'Người nhận tiền'}:</td><td class="dot">${phieu.partner || ''}</td></tr>
      <tr><td class="lb">Lý do:</td><td class="dot">${phieu.notes || phieu.category || ''}</td></tr>
      <tr><td class="lb">Số tiền:</td><td class="dot"><b style="font-size:18px">${money(soTien)} đ</b></td></tr>
      <tr><td class="lb">Hình thức:</td><td class="dot">${phieu.payment_method === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'}</td></tr>
    </table>

    <div class="sign">
      <div><div class="r">Người lập phiếu</div>(Ký, họ tên)</div>
      <div><div class="r">${laThu ? 'Người nộp tiền' : 'Người nhận tiền'}</div>(Ký, họ tên)</div>
      <div><div class="r">Thủ quỹ</div>(Ký, họ tên)</div>
    </div>
  `;
  moPrintWindow(html, `${tieuDe} ${phieu.reference_id || ''}`);
}

/**
 * In tem mã vạch. labels: [{ name, price, code }], copies = số tem mỗi sản phẩm.
 */
export function inTemMaVach(labels, { copies = 1 } = {}) {
  const items = [];
  labels.forEach((l) => {
    for (let i = 0; i < copies; i++) {
      items.push(`
        <div class="tem">
          <div class="ten">${l.name}</div>
          <div class="bc">${barcodeSVG(l.code, { height: 36, narrow: 1.6, wide: 4.8 })}</div>
          <div class="gia">${money(l.price)} đ</div>
        </div>`);
    }
  });
  const html = `
    <style>
      @page { margin: 5mm; }
      * { font-family: 'Segoe UI', Tahoma, sans-serif; }
      body { margin: 0; }
      .wrap { display: flex; flex-wrap: wrap; gap: 4mm; }
      .tem { width: 40mm; border: 1px solid #ddd; border-radius: 4px; padding: 4px; text-align: center; page-break-inside: avoid; }
      .ten { font-size: 10px; font-weight: 700; height: 26px; overflow: hidden; line-height: 13px; }
      .bc svg { max-width: 100%; height: auto; }
      .gia { font-size: 12px; font-weight: 700; margin-top: 2px; }
    </style>
    <div class="wrap">${items.join('')}</div>
  `;
  moPrintWindow(html, 'In tem ma vach');
}
