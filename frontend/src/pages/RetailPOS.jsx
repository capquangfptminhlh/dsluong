import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { ShoppingCart, Search, User, Trash2, Plus, Minus, Package, Camera, X, Cloud, CloudOff, RefreshCw, Store } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import API_BASE from '../config/api';

// New Architecture Imports
import usePOSStore from '../store/posStore';
import { usePOSHotkeys } from '../hooks/usePOSHotkeys';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import PaymentModal from '../components/POS/PaymentModal';
import { ReceiptTemplate } from '../components/POS/ReceiptTemplate';
import { inHoaDonK80 } from '../utils/print';
import { db, syncOfflineBills } from '../utils/indexedDB';

export default function POS() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [shopInfo, setShopInfo] = useState({ name: '', address: '', phone: '', bank: '' });
  
  // Modals & States
  const [showPayment, setShowPayment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [vietQrUrl, setVietQrUrl] = useState('');
  
  // ERPNext Specific States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [serialQueue, setSerialQueue] = useState([]); // Array of { product: Object }

  const searchInputRef = useRef(null);
  const serialInputRef = useRef(null);
  const channelRef = useRef(null);

  // Zustand Store
  const { cart, customer, addToCart, updateQuantity, removeFromCart, getTotals, setCustomer, clearCart } = usePOSStore();
  const totals = getTotals(); 
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const categories = [
    { id: 'all', name: 'Tất cả' },
    { id: 'food', name: 'Đồ ăn' },
    { id: 'drink', name: 'Đồ uống' },
    { id: 'other', name: 'Khác' },
  ];

  // Sync Logic & Connectivity
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); handleSync(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkPendingCount();
    
    fetchProducts();
    
    channelRef.current = new BroadcastChannel('pos-cds-sync');
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  const checkPendingCount = async () => {
    try {
      const count = await db.offlineBills.where('sync_status').equals('pending').count();
      setPendingSyncCount(count);
    } catch (e) { console.error("IndexedDB blocked/unavailable"); }
  };

  const handleSync = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const syncedCount = await syncOfflineBills();
    if (syncedCount > 0) alert(`Đã đồng bộ thành công ${syncedCount} đơn hàng lên máy chủ!`);
    await checkPendingCount();
    setSyncing(false);
  };

  // Sync cart to Customer Display
  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'SYNC_CART', payload: { items: cart, total: totals.grandTotal } });
    }
  }, [cart, totals.grandTotal]);

  const [activeBranch, setActiveBranch] = useState(() => ({
    id: localStorage.getItem('active_branch_id') || null,
    name: localStorage.getItem('active_branch_name') || 'Nhà Thuốc Nhân Đức - Cơ Sở Chính'
  }));

  const fetchProducts = async (branchId = null) => {
    try {
      const bId = branchId || localStorage.getItem('active_branch_id');
      const url = bId ? `${API_BASE}/api/branches/${bId}/ton-kho` : `${API_BASE}/api/products`;
      const res = await axios.get(url);
      const mapped = (res.data || []).map(p => ({
        ...p,
        has_serial: p.category === 'other', 
      }));
      setProducts(mapped);
    } catch (err) { 
      console.error(err);
      try {
        const fallback = await axios.get(`${API_BASE}/api/products`);
        setProducts(fallback.data || []);
      } catch (e) {}
    }
  };

  useEffect(() => {
    const onBranchChange = (e) => {
      const b = e.detail;
      if (b) {
        setActiveBranch(b);
        fetchProducts(b.id);
      }
    };
    window.addEventListener('branchChanged', onBranchChange);
    return () => window.removeEventListener('branchChanged', onBranchChange);
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const layKey = async (key) => {
      try { return (await axios.get(`${API_BASE}/api/settings/${key}`)).data.value || ''; }
      catch { return ''; }
    };
    (async () => {
      const [name, address, phone, bank] = await Promise.all([
        layKey('shop_name'), layKey('shop_address'), layKey('shop_phone'), layKey('shop_bank'),
      ]);
      setShopInfo({ name: name || user.name || 'CỬA HÀNG', address, phone: phone || user.phone || '', bank });
      if (!customer) setCustomer({ name: 'Khách lẻ', phone: '' });
    })();
  }, []);

  // --- NEW HOOKS ---
  usePOSHotkeys({
    onSearch: () => searchInputRef.current?.focus(),
    onPayment: () => cart.length > 0 && setShowPayment(true),
  });

  const handleProductSelect = (product) => {
    if (product.has_serial) {
      setSerialQueue(prev => [...prev, { product }]);
      setTimeout(() => serialInputRef.current?.focus(), 100);
    } else {
      addToCart(product);
    }
  };

  useBarcodeScanner((code) => {
    if (serialQueue.length > 0) {
      // If we are waiting for a serial, check if this barcode is actually another product's SKU
      const matchProduct = products.find((p) => p.sku === code || p.barcode === code);
      if (matchProduct && !matchProduct.has_serial) {
        // Cashier scanned another product instead of a serial. Add the other product.
        addToCart(matchProduct);
        return;
      }
      
      const prompt = serialQueue[0];
      try { 
        addToCart(prompt.product, code); 
        setSerialQueue(prev => prev.slice(1)); 
      } 
      catch (e) { alert("Mã Serial này đã được quét trong giỏ hàng!"); }
      return;
    }
    
    const match = products.find((p) => p.sku === code || p.barcode === code);
    if (match) handleProductSelect(match);
    else alert(`Mã vạch ${code} không có trong hệ thống!`);
  });

  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter' || e.repeat) return;
    const code = search.trim();
    if (!code) return;
    const match = products.find((p) => p.sku === code || p.barcode === code);
    if (match) {
      handleProductSelect(match);
      setSearch('');
    }
  };

  // --- PAYMENT LOGIC ---
  const handleConfirmPayment = async (paymentDetails) => {
    if (isSubmitting) return; // Prevent double submit
    setIsSubmitting(true);
    
    const clientOrderId = 'ORDER-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    
    const body = {
      client_order_id: clientOrderId,
      cart,
      customer_name: customer?.name || 'Khách lẻ',
      customer_phone: customer?.phone || '',
      paid_cash: paymentDetails.cashAmount,
      paid_bank: paymentDetails.qrAmount,
      payment_method: paymentDetails.paymentMethod,
      cho_no: paymentDetails.paymentMethod === 'DEBT',
      totals, 
      branch_id: activeBranch?.id ? Number(activeBranch.id) : null,
    };

    let orderCode = clientOrderId;
    let isOfflineTransaction = false;

    try {
      if (navigator.onLine) {
        const res = await axios.post(`${API_BASE}/api/pos/checkout`, body);
        orderCode = res.data.order_code || orderCode;
      } else {
        throw new Error('Offline');
      }
    } catch (err) {
      isOfflineTransaction = true;
      try {
        await db.offlineBills.add({
          customer_name: body.customer_name,
          customer_phone: body.customer_phone,
          total_amount: totals.grandTotal,
          date: new Date().toISOString(),
          sync_status: 'pending',
          payload: body
        });
        checkPendingCount();
      } catch (dbErr) {
        alert("Lỗi lưu trữ ngoại tuyến! Trình duyệt có thể đang chặn IndexedDB.");
        setIsSubmitting(false);
        return;
      }
    }

    let qrUrl = '';
    // Only generate QR if amount > 0 and method involves QR
    if (paymentDetails.qrAmount > 0 && navigator.onLine) {
      // Use dynamic bank from shopInfo if available, else fallback
      const bankBin = shopInfo.bank ? shopInfo.bank.split('-')[0] : '970415';
      const bankAcc = shopInfo.bank ? shopInfo.bank.split('-')[1] : '113366668888';
      qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAcc}-compact2.jpg?amount=${paymentDetails.qrAmount}&addInfo=${orderCode}`;
    }

    setVietQrUrl(qrUrl);
    setReceiptData({
      order_code: orderCode,
      cart: [...cart],
      totalAmount: totals.grandTotal,
      paid_cash: paymentDetails.cashAmount,
      paid_bank: paymentDetails.qrAmount,
      customer: customer || { name: 'Khách lẻ' },
      paymentMethod: paymentDetails.paymentMethod,
      date: new Date().toLocaleString('vi-VN'),
      isOffline: isOfflineTransaction
    });
    
    clearCart();
    setShowPayment(false);
    setIsSubmitting(false);
    if (navigator.onLine && !isOfflineTransaction) fetchProducts();
  };

  const filteredProducts = useMemo(() => {
    // Only search up to 50 items to prevent DOM freezing
    return products
      .filter(p => {
        if (activeCategory !== 'all' && p.category !== activeCategory) return false;
        if (!search) return true;
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || (p.sku && p.sku.toLowerCase().includes(s)) || (p.barcode && p.barcode.includes(s));
      })
      .slice(0, 50);
  }, [products, search, activeCategory]);

  // Debounced Customer Phone Update (Prevent Thrashing)
  const [localCustomerName, setLocalCustomerName] = useState('');
  const [localCustomerPhone, setLocalCustomerPhone] = useState('');
  
  useEffect(() => {
    if (customer) {
      setLocalCustomerName(customer.name || '');
      setLocalCustomerPhone(customer.phone || '');
    } else {
      setLocalCustomerName('');
      setLocalCustomerPhone('');
    }
  }, [customer]);

  const handleCustomerNameChange = (e) => {
    setLocalCustomerName(e.target.value);
    setCustomer({ name: e.target.value, phone: localCustomerPhone });
  };
  
  const handleCustomerPhoneChange = (e) => {
    setLocalCustomerPhone(e.target.value);
    setCustomer({ name: localCustomerName, phone: e.target.value });
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-[var(--surface-warm)]/50 relative overflow-hidden">
      
      {/* Serial Number Prompt Queue Modal */}
      {serialQueue.length > 0 && (
        <div className="absolute inset-0 bg-slate-900/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="font-black text-[var(--fg)] text-lg mb-2">Nhập Số Lô / Hạn Dùng</h3>
            <p className="text-sm text-[var(--muted)] mb-4">Thuốc <strong>{serialQueue[0].product.name}</strong> yêu cầu chọn hoặc nhập Số Lô &amp; Hạn Dùng theo quy định.</p>
            {serialQueue.length > 1 && <div className="mb-2 text-xs text-blue-600 font-bold">Còn {serialQueue.length - 1} sản phẩm đang đợi quét...</div>}
            <input 
              ref={serialInputRef}
              type="text"
              placeholder="Quét hoặc gõ mã Serial..."
              className="w-full px-4 py-3 bg-[var(--surface-warm)] rounded-[var(--radius-md)] outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono font-bold mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.target.value.trim();
                  if (!val) return;
                  try { 
                    addToCart(serialQueue[0].product, val); 
                    setSerialQueue(prev => prev.slice(1));
                    e.target.value = '';
                  } catch(err) { alert(err.message); }
                }
              }}
            />
            <div className="flex gap-2">
              <button onClick={() => setSerialQueue(prev => prev.slice(1))} className="flex-1 py-2 bg-slate-200 font-bold rounded hover:bg-slate-300">Bỏ qua món này</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <div className="absolute inset-0 bg-slate-900/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] max-w-sm w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-[var(--fg)] text-lg">Quét Mã Vạch</h3>
              <button onClick={() => setShowScanner(false)} className="bg-[var(--surface-warm)] p-2 rounded-full"><X/></button>
            </div>
            <div id="reader"></div>
          </div>
        </div>
      )}

      {/* LEFT: Products Grid Area (65%) */}
      <div className="flex-1 flex flex-col h-full bg-[var(--surface-warm)]/50 relative">
        <div className="p-4 bg-[var(--surface)] border-b border-[var(--border)] flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-[var(--elev-ring)] z-10">
          
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isOnline ? <Cloud className="w-4 h-4"/> : <CloudOff className="w-4 h-4"/>}
              {isOnline ? 'Online' : 'Offline'}
            </div>
            {pendingSyncCount > 0 && (
              <button onClick={handleSync} disabled={!isOnline || syncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {pendingSyncCount} đơn chờ đồng bộ
              </button>
            )}
          </div>

          <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
            <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-xs font-bold flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-emerald-600" /><span>Quầy: {activeBranch?.name || "Cơ Sở Chính"}</span></div><button onClick={() => setShowScanner(true)} className="flex-1 md:flex-none justify-center px-3 py-2 bg-[var(--surface-warm)] font-bold rounded-[var(--radius-md)] flex gap-2 text-xs"><Camera className="w-4 h-4" /> Quét mã</button>
          </div>
        </div>

        <div className="px-4 py-3 bg-white border-b border-slate-200 flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-400" />
            <input 
              ref={searchInputRef}
              type="text"
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchEnter}
              placeholder="Tìm tên thuốc, hoạt chất, số lô hoặc quét mã vạch (F2)..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-[var(--radius-md)] outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map(cat => (
              <button 
                key={cat.id} 
                onClick={() => setActiveCategory(cat.id)} 
                className={`shrink-0 px-4 py-2 rounded-[var(--radius-md)] font-bold text-sm transition-all ${
                  activeCategory === cat.id 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start">
          {filteredProducts.map(p => (
            <div 
              key={p.id} 
              onClick={() => p.stock > 0 && handleProductSelect(p)} 
              className={`bg-white rounded-[var(--radius-lg)] border border-slate-200 p-3.5 flex flex-col h-full cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all ${
                p.stock <= 0 ? 'opacity-40 grayscale' : ''
              }`}
            >
              <div className="relative w-full aspect-square rounded-[var(--radius-md)] bg-slate-50 border border-slate-100 flex items-center justify-center mb-3 overflow-hidden">
                {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <Package className="text-slate-300 w-10 h-10" />}
                {p.has_serial && <span className="absolute bottom-1 right-1 bg-emerald-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">LÔ / DATE</span>}
              </div>
              <div className="flex flex-col flex-1">
                <div className="text-[10px] font-mono text-slate-500 mb-1 flex justify-between">
                  <span className="truncate max-w-[90px]">{p.sku}</span>
                  <span className={`font-bold px-1.5 py-0.2 rounded ${p.stock <= 5 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    Kho: {p.stock}
                  </span>
                </div>
                <div className="font-bold text-slate-800 leading-tight mb-2 flex-1 line-clamp-2">{p.name}</div>
                <div className="font-black text-emerald-700 text-lg">{new Intl.NumberFormat('vi-VN').format(p.price)}đ</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Cart & Checkout (35%) */}
      <div className="w-full lg:w-[420px] flex flex-col bg-[var(--surface)] h-full border-l border-[var(--border)] shrink-0 shadow-[-10px_0_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="p-4 border-b border-[var(--border-soft)] flex items-center gap-3">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--surface-warm)] flex items-center justify-center text-[var(--accent)]"><User className="w-6 h-6" /></div>
          <div className="flex-1">
            <input type="text" value={localCustomerName} onChange={handleCustomerNameChange} className="w-full font-black text-lg outline-none bg-transparent" placeholder="Tên khách hàng" />
            <input type="text" value={localCustomerPhone} onChange={handleCustomerPhoneChange} className="w-full text-sm text-[var(--muted)] outline-none bg-transparent" placeholder="SĐT (Bắt buộc khi nợ / Tích điểm)" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 bg-[var(--surface-warm)]/30">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--muted)]">
              <ShoppingCart className="w-16 h-16 opacity-20 mb-4" />
              <p className="font-bold text-lg">Giỏ hàng trống</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.serial || item.id} className="bg-[var(--surface)] p-3 rounded-[var(--radius-lg)] border border-[var(--border-soft)] flex gap-3 group">
                  <div className="w-14 h-14 bg-[var(--surface-warm)] flex items-center justify-center rounded-[var(--radius-md)] shrink-0"><Package className="w-6 h-6 text-slate-400"/></div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-bold text-sm leading-tight line-clamp-2">{item.name}</div>
                      <button onClick={() => removeFromCart(item.id, item.serial)} className="text-red-500 bg-red-50 p-1.5 rounded opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    {item.serial && <div className="text-[10px] text-[var(--accent)] font-mono font-bold bg-blue-50 w-fit px-1.5 rounded">SN: {item.serial}</div>}
                    <div className="flex justify-between items-center mt-2">
                      <div className="font-black text-[var(--fg)]">{new Intl.NumberFormat('vi-VN').format(item.price)}</div>
                      {!item.has_serial && (
                        <div className="flex items-center gap-1 bg-[var(--surface-warm)] rounded p-0.5">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-500"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="font-bold w-6 text-center text-sm">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-500"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--surface)] border-t border-[var(--border)] p-4 pb-safe">
          <div className="space-y-1 mb-4 text-sm">
            <div className="flex justify-between text-[var(--muted)]"><span>Tạm tính ({totalItems} món)</span><span className="font-semibold">{new Intl.NumberFormat('vi-VN').format(totals.subtotal)}đ</span></div>
            {totals.ruleDiscount > 0 && <div className="flex justify-between text-orange-500 font-semibold"><span>Khuyến mãi tự động</span><span>-{new Intl.NumberFormat('vi-VN').format(totals.ruleDiscount)}đ</span></div>}
            {totals.loyaltyDiscount > 0 && <div className="flex justify-between text-purple-600 font-semibold"><span>Đổi điểm Loyalty</span><span>-{new Intl.NumberFormat('vi-VN').format(totals.loyaltyDiscount)}đ</span></div>}
          </div>
          
          <div className="flex justify-between items-end mb-4 border-t border-[var(--border-soft)] pt-3">
            <span className="text-lg font-black text-[var(--fg)]">Khách cần trả</span>
            <span className="text-3xl font-black text-[var(--accent)]">{new Intl.NumberFormat('vi-VN').format(totals.grandTotal)}đ</span>
          </div>
          
          <button 
            onClick={() => setShowPayment(true)}
            disabled={cart.length === 0}
            className="w-full py-4 bg-emerald-600 text-white font-black tracking-wide rounded-[var(--radius-lg)] disabled:opacity-40 text-lg flex justify-center items-center gap-2 shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all cursor-pointer"
          >
            Thanh Toán <span className="font-mono text-xs border border-emerald-400/40 px-1.5 py-0.5 rounded bg-emerald-800/40 text-emerald-100">F4</span>
          </button>
        </div>
      </div>

      <PaymentModal 
        isOpen={showPayment} 
        isSubmitting={isSubmitting}
        onClose={() => setShowPayment(false)} 
        totalAmount={totals.grandTotal} 
        onConfirmPayment={handleConfirmPayment} 
      />

      {/* RECEIPT MODAL */}
      {receiptData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-10 duration-200 overflow-y-auto max-h-[90vh]">
            
            {vietQrUrl && (
              <div className="mb-4 text-center">
                <p className="font-bold text-sm text-blue-600 mb-2">Quét mã để thanh toán</p>
                <img src={vietQrUrl} alt="VietQR" className="mx-auto border border-gray-200 rounded p-1" style={{ maxWidth: '200px' }} />
              </div>
            )}
            
            {receiptData.isOffline && (
              <div className="bg-amber-100 text-amber-800 text-xs font-bold text-center py-1 mb-2 rounded border border-amber-200">
                Giao dịch Offline - Sẽ đồng bộ sau
              </div>
            )}
            <ReceiptTemplate 
              cart={receiptData.cart} 
              total={receiptData.totalAmount} 
              customer={receiptData.customer} 
              shopInfo={shopInfo}
            />
            <div className="flex gap-3 mt-4 print:hidden">
              <button onClick={() => { setReceiptData(null); setVietQrUrl(''); }} className="flex-1 py-2.5 border-2 border-slate-200 rounded font-bold hover:bg-slate-50 text-slate-600 transition-colors">Đóng</button>
              <button onClick={() => inHoaDonK80(receiptData, shopInfo)} className="flex-[2] py-2.5 bg-[var(--accent)] text-white rounded font-bold hover:bg-[var(--accent-hover)] transition-colors">In Hóa Đơn</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
