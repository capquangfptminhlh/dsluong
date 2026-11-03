const namePriorities = [
    'tên sản phẩm', 'product name', 'tên hàng', 'sản phẩm', 'hàng hóa', 'item', 
    'nội dung chi tiết', 'diễn giải', 'nội dung', 'chi tiết', 'mô tả', 'description', 'giao dịch', 'khách hàng'
];
const revenuePriorities = [
    'tổng tiền đã thanh toán', 'tổng thanh toán', 'doanh thu theo giao dịch', 'doanh thu thuần', 'thực thu', 'doanh thu', 'thành tiền', 'tổng tiền theo giao dịch', 'tổng tiền', 'tổng cộng', 'giá sản phẩm', 
    'ghi có', 'credit', 'có', 'tiền vào', 'số tiền'
];
const excludeName = ['ngày', 'date', 'thời gian', 'time', 'stt', 'số thứ tự'];
const excludeRevenue = ['số dư', 'balance', 'dư cuối', 'tiền hàng', 'giá vốn', 'lợi nhuận', 'giảm giá'];

const keys = [
  'Mã giao dịch',
  'Đơn hàng / Sản phẩm',
  'Mã đơn hàng',
  'Mã Số Thuế',
  'Mã yêu cầu hoàn tiền',
  'Mã sản phẩm',
  'Tên sản phẩm',
  'Ngày đặt hàng',
  'Ngày hoàn thành thanh toán',
  'Phương thức thanh toán',
  'Phân Loại',
  'Sản Phẩm Bán Chạy',
  'Tổng tiền đã thanh toán',
  'Giá sản phẩm',
  'Số tiền hoàn lại',
  'Phí vận chuyển Người mua trả',
  'Phí vận chuyển thực tế',
  'Phí vận chuyển được trợ giá từ Shopee',
  'Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)'
];

let nameCandidates = [];
let revenueCandidates = [];

keys.forEach(k => {
    const lowerK = String(k).toLowerCase().trim();
    
    const nameMatchIdx = namePriorities.findIndex(n => lowerK.includes(n));
    if (nameMatchIdx !== -1 && !excludeName.some(e => lowerK.includes(e))) {
      nameCandidates.push({ key: k, priority: nameMatchIdx });
    }
    
    const revMatchIdx = revenuePriorities.findIndex(r => lowerK.includes(r));
    if (revMatchIdx !== -1 && !excludeRevenue.some(e => lowerK.includes(e))) {
      revenueCandidates.push({ key: k, priority: revMatchIdx });
    }
});

nameCandidates.sort((a, b) => a.priority - b.priority);
revenueCandidates.sort((a, b) => a.priority - b.priority);

console.log("Name Candidates:", nameCandidates);
console.log("Revenue Candidates:", revenueCandidates);
