import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { ShoppingCart, Search, User, CreditCard, Trash2, Plus, Minus, Receipt, Package, Mic, Camera, X, Tag, CheckCircle2, ShieldCheck } from 'lucide-react';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import API_BASE from '../config/api';
import { inHoaDonK80 } from '../utils/print';

export default function POS() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [customer, setCustomer] = useState({ name: 'Khách lẻ', phone: '' });
  const [customers, setCustomers] = useState([]);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: '', phone: '', address: '' });
  const [savingQuickCustomer, setSavingQuickCustomer] = useState(false);
  const [customerPricing, setCustomerPricing] = useState({ level_id: null, level_name: '', prices: {} });
  const [pricingLoading, setPricingLoading] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [shopInfo, setShopInfo] = useState({ name: '', address: '', phone: '', bank: '' });
  const [serialOptions, setSerialOptions] = useState({});
  const [serialLoading, setSerialLoading] = useState({});

  // Thanh toán chi tiết
  const [showThanhToan, setShowThanhToan] = useState(false);
  const [giamGia, setGiamGia] = useState('');
  const [vat, setVat] = useState('');
  const [traTM, setTraTM] = useState('');
  const [traCK, setTraCK] = useState('');
  const [choNo, setChoNo] = useState(false);
  const [dsKM, setDsKM] = useState([]);
  const [kmChon, setKmChon] = useState(null);

  // New State for PRO features
  const [isListening, setIsListening] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [vietQrUrl, setVietQrUrl] = useState('');
  const [waitingPaymentCode, setWaitingPaymentCode] = useState(null);
  const searchInputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const checkoutRef = useRef(() => {});

  const categories = useMemo(() => {
    const names = [...new Set(products.map((product) => String(product.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'));
    return [{ id: 'all', name: 'Tất cả' }, ...names.map((name) => ({ id: name, name }))];
  }, [products]);

  useEffect(() => {
    const raw = sessionStorage.getItem('autotax_pos_customer');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved?.name || saved?.phone) {
        setCustomer({ name: saved.name || 'Khách lẻ', phone: saved.phone || '' });
      }
    } catch {
      // Ignore malformed browser-local prefill only; checkout remains server-authoritative.
    } finally {
      sessionStorage.removeItem('autotax_pos_customer');
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCustomers();

    // Keyboard shortcuts — gọi qua ref để luôn dùng giỏ hàng mới nhất
    // (nếu gọi handleCheckout trực tiếp sẽ dính closure cũ với giỏ rỗng)
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        checkoutRef.current('cash');
      } else if (e.key === 'F10') {
        e.preventDefault();
        checkoutRef.current('bank');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCart([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (waitingPaymentCode) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE}/api/pos/order/${waitingPaymentCode}`);
          if (res.data.status === 'paid') {
            clearInterval(pollIntervalRef.current);
            setVietQrUrl('');
            setWaitingPaymentCode(null);
            alert('TING TING! Khách hàng đã thanh toán thành công!');
          }
        } catch { }
      }, 3000);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
  }, [waitingPaymentCode]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setPricingLoading(true);
      try {
        const phone = String(customer.phone || '').trim();
        const query = phone ? `?phone=${encodeURIComponent(phone)}` : '';
        const res = await axios.get(`${API_BASE}/api/pricing/for-customer${query}`);
        if (!active) return;
        const nextPricing = {
          level_id: res.data?.level_id || null,
          level_name: res.data?.level_name || '',
          prices: res.data?.prices || {},
        };
        setCustomerPricing(nextPricing);
        setCart((previous) => previous.map((item) => {
          if (item.manual_price !== undefined && item.manual_price !== null) return item;
          if (item.unit_name) return item;
          const source = products.find((product) => Number(product.id) === Number(item.id));
          const variants = Array.isArray(source?.variants) ? source.variants : [];
          const selectedVariant = variants.find((variant) => Number(variant.id) === Number(item.variant_id));
          const basePrice = selectedVariant
            ? (Number(selectedVariant.price) || 0)
            : (Number(source?.price ?? item.base_price ?? item.price) || 0);
          const options = Array.isArray(source?.warranty_options) ? source.warranty_options : [];
          const selectedPackage = options.find((option) => Number(option.months) === Number(item.warranty_months));
          if (selectedPackage) {
            return { ...item, base_price: basePrice, warranty_options: options, price: Number(selectedPackage.price) || 0 };
          }
          if (selectedVariant) {
            return { ...item, base_price: basePrice, warranty_options: options, price: basePrice };
          }
          const override = nextPricing.prices?.[item.id];
          const effective = override === undefined ? basePrice : Number(override);
          return {
            ...item,
            base_price: basePrice,
            warranty_options: options,
            price: Number.isFinite(effective) && effective >= 0 ? effective : basePrice,
          };
        }));
      } catch {
        if (active) setCustomerPricing({ level_id: null, level_name: '', prices: {} });
      } finally {
        if (active) setPricingLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customer.phone, products]);

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/products`);
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/customers`);
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setCustomers([]);
    }
  };

  const tracksSerial = (item) => Number(item?.track_serial) === 1 || item?.track_serial === true;

  const loadSerialOptions = async (productId, force = false) => {
    const key = Number(productId);
    if (!key) return;
    if (!force && Object.prototype.hasOwnProperty.call(serialOptions, key)) return;
    if (serialLoading[key]) return;
    setSerialLoading((previous) => ({ ...previous, [key]: true }));
    try {
      const res = await axios.get(`${API_BASE}/api/pd/serials`, {
        params: { status: 'in_stock', product_id: key },
      });
      const rows = Array.isArray(res.data) ? res.data : [];
      setSerialOptions((previous) => ({ ...previous, [key]: rows }));
    } catch (err) {
      console.error(err);
      setSerialOptions((previous) => ({ ...previous, [key]: [] }));
    } finally {
      setSerialLoading((previous) => ({ ...previous, [key]: false }));
    }
  };

  const createQuickCustomer = async (event) => {
    event?.preventDefault();
    const name = String(quickCustomer.name || '').trim();
    const phone = String(quickCustomer.phone || '').trim();
    const address = String(quickCustomer.address || '').trim();
    if (!name) return alert('Nhập tên khách hàng.');
    if (!phone) return alert('Nhập số điện thoại khách hàng.');

    setSavingQuickCustomer(true);
    try {
      const res = await axios.post(`${API_BASE}/api/customers`, { name, phone, address });
      const created = { id: res.data?.id, name, phone, address };
      setCustomers((previous) => [created, ...previous.filter((item) => String(item.phone) !== phone)]);
      setCustomer({ name, phone });
      setQuickCustomer({ name: '', phone: '', address: '' });
      setShowQuickCustomer(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Không tạo được khách hàng.');
    } finally {
      setSavingQuickCustomer(false);
    }
  };

  const priceForProduct = (product) => {
    const override = customerPricing.prices?.[product.id];
    const basePrice = Number(product.price) || 0;
    if (override === undefined) return basePrice;
    const effective = Number(override);
    return Number.isFinite(effective) && effective >= 0 ? effective : basePrice;
  };

  // Thông tin cửa hàng để in lên hóa đơn: ưu tiên cài đặt, fallback về tài khoản
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
      setShopInfo({
        name: name || user.name || 'CỬA HÀNG',
        address,
        phone: phone || user.phone || '',
        bank,
      });
    })();
  }, []);

  // Máy quét mã vạch USB gõ mã + Enter vào ô tìm kiếm -> tự thêm sản phẩm khớp mã
  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter') return;
    const code = search.trim();
    if (!code) return;
    const match = products.find((p) => p.sku === code || p.barcode === code);
    if (match) {
      addToCart(match, 1);
      setSearch('');
    } else if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0], 1);
      setSearch('');
    }
  };

  const variantLabel = (variant) => {
    const values = Object.values(variant?.attributes || {}).map((value) => String(value || '').trim()).filter(Boolean);
    return values.join(' / ') || String(variant?.sku || 'Phân loại');
  };

  const addToCart = (product, quantity = 1) => {
    if (tracksSerial(product)) loadSerialOptions(product.id);
    setCart(prev => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const defaultVariant = variants[0] || null;
      const existing = prev.find(item => item.id === product.id && Number(item.variant_id || 0) === Number(defaultVariant?.id || 0));
      if (existing) {
        return prev.map(item => item === existing ? { ...item, quantity: item.quantity + quantity } : item);
      }
      const warrantyOptions = Array.isArray(product.warranty_options) ? product.warranty_options : [];
      const defaultMonths = Number(product.warranty_months) || 0;
      const selectedPackage = warrantyOptions.find((option) => Number(option.months) === defaultMonths) || warrantyOptions[0] || null;
      const variantPrice = defaultVariant ? (Number(defaultVariant.price) || 0) : priceForProduct(product);
      return [...prev, {
        ...product,
        cart_line_id: `line-${product.id}-${defaultVariant?.id || 0}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        base_price: variantPrice,
        price: selectedPackage ? (Number(selectedPackage.price) || 0) : variantPrice,
        quantity,
        variant_id: defaultVariant?.id || null,
        variant_label: defaultVariant ? variantLabel(defaultVariant) : '',
        sku: defaultVariant?.sku || product.sku,
        warranty_options: warrantyOptions,
        warranty_months: selectedPackage ? Number(selectedPackage.months) : defaultMonths,
        serials: [],
      }];
    });
  };

  const isCartLine = (item, lineId) => String(item.cart_line_id || '') === String(lineId || '');

  const updateQuantity = (lineId, delta) => {
    setCart(prev => prev.map(item => {
      if (isCartLine(item, lineId)) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? {
          ...item,
          quantity: newQ,
          serials: Array.isArray(item.serials) ? item.serials.slice(0, newQ) : [],
        } : item;
      }
      return item;
    }));
  };

  const updateQuantityValue = (lineId, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const quantity = Math.max(1, Math.trunc(parsed));
    setCart(prev => prev.map(item => isCartLine(item, lineId) ? {
      ...item,
      quantity,
      serials: Array.isArray(item.serials) ? item.serials.slice(0, quantity) : [],
    } : item));
  };

  const removeFromCart = (lineId) => {
    setCart(prev => prev.filter(item => !isCartLine(item, lineId)));
  };

  const updateItemPrice = (lineId, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart(prev => prev.map(item => isCartLine(item, lineId) ? { ...item, price: parsed, manual_price: parsed } : item));
  };

  const updateVariantSelection = (lineId, variantId) => {
    const parsedId = Number(variantId);
    setCart(prev => prev.map(item => {
      if (!isCartLine(item, lineId)) return item;
      const source = products.find((product) => Number(product.id) === Number(item.id));
      const variants = Array.isArray(source?.variants) ? source.variants : [];
      const selected = variants.find((variant) => Number(variant.id) === parsedId);
      if (!selected) return item;
      const options = Array.isArray(item.warranty_options) ? item.warranty_options : [];
      const selectedPackage = options.find((option) => Number(option.months) === Number(item.warranty_months));
      const basePrice = Number(selected.price) || 0;
      return {
        ...item,
        variant_id: selected.id,
        variant_label: variantLabel(selected),
        sku: selected.sku || item.sku,
        image_url: selected.image_url || source?.image_url || item.image_url,
        base_price: basePrice,
        price: selectedPackage ? (Number(selectedPackage.price) || 0) : basePrice,
        manual_price: undefined,
      };
    }));
  };

  const updateWarrantyMonths = (lineId, value) => {
    const parsed = Number(value);
    const months = Number.isFinite(parsed) ? Math.max(0, Math.min(240, Math.trunc(parsed))) : 0;
    setCart(prev => prev.map(item => {
      if (!isCartLine(item, lineId)) return item;
      const options = Array.isArray(item.warranty_options) ? item.warranty_options : [];
      if (options.length) {
        const selected = options.find((option) => Number(option.months) === months);
        return selected ? { ...item, warranty_months: months, price: Number(selected.price) || 0, manual_price: undefined } : item;
      }
      return { ...item, warranty_months: months };
    }));
  };

  const updateSerialSelection = (lineId, serialIndex, value) => {
    const serial = String(value || '').trim();
    if (serial) {
      const duplicate = cart.some((line) => {
        const values = Array.isArray(line.serials) ? line.serials : [];
        return values.some((selected, index) => String(selected || '').trim() === serial
          && !(String(line.cart_line_id) === String(lineId) && index === serialIndex));
      });
      if (duplicate) {
        alert(`Serial ${serial} đã được chọn ở dòng khác trong đơn.`);
        return;
      }
    }
    setCart((previous) => previous.map((item) => {
      if (!isCartLine(item, lineId)) return item;
      const serials = Array.isArray(item.serials) ? [...item.serials] : [];
      serials[serialIndex] = serial;
      return { ...item, serials };
    }));
  };

  const serialUsedElsewhere = (lineId, serialIndex, serial) => {
    const value = String(serial || '').trim();
    if (!value) return false;
    return cart.some((line) => {
      const values = Array.isArray(line.serials) ? line.serials : [];
      return values.some((selected, index) => String(selected || '').trim() === value
        && !(String(line.cart_line_id) === String(lineId) && index === serialIndex));
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const serialCheckoutIssue = cart.find((item) => {
    if (!tracksSerial(item)) return false;
    const needed = Math.max(1, Math.trunc(Number(item.quantity) || 0));
    const selected = (Array.isArray(item.serials) ? item.serials : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return selected.length !== needed || new Set(selected).size !== needed;
  }) || null;

  /**
   * Thanh toán. `tuyChon` cho phép chiết khấu, VAT, trả nhiều hình thức và ghi nợ.
   * Số tiền cuối cùng do SERVER tính lại, ở đây chỉ hiển thị.
   */
  const handleCheckout = async (paymentMethod, tuyChon = {}) => {
    if (cart.length === 0) return alert('Giỏ hàng trống!');
    if (pricingLoading) return alert('Đang tải bảng giá khách hàng, vui lòng thử lại ngay.');
    for (const item of cart) {
      if (!tracksSerial(item)) continue;
      const needed = Math.max(1, Math.trunc(Number(item.quantity) || 0));
      const selected = (Array.isArray(item.serials) ? item.serials : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      if (selected.length !== needed || new Set(selected).size !== needed) {
        return alert(`Sản phẩm "${item.name}" cần chọn đúng ${needed} Serial/IMEI trước khi thanh toán.`);
      }
    }
    if (cart.some((item) => Number(item.warranty_months) > 0) && !String(customer.phone || '').trim()) {
      return alert('Đơn có bảo hành. Nhập số điện thoại khách ở phần Khách hàng để hệ thống tự tạo phiếu bảo hành, không cần nhập lại lần 2.');
    }

    const body = {
      cart,
      customer_name: customer.name,
      customer_phone: customer.phone,
      payment_method: paymentMethod,
      ...tuyChon,
    };

    try {
      const res = await axios.post(`${API_BASE}/api/pos/checkout`, body);
      const d = res.data;
      const orderCode = d.order_code;

      let qrUrl = '';
      if (d.paid_bank > 0) {
        qrUrl = `https://img.vietqr.io/image/970415-113366668888-compact2.jpg?amount=${d.paid_bank}&addInfo=${orderCode}&accountName=${encodeURIComponent(shopInfo.name || 'SHOP')}`;
        setWaitingPaymentCode(orderCode);
      }

      setVietQrUrl(qrUrl);
      setReceiptData({
        order_code: orderCode,
        cart: [...cart],
        totalAmount: d.total_amount,
        subtotal: d.subtotal,
        discount: d.discount,
        vat_rate: d.vat_rate,
        vat_amount: d.vat_amount,
        paid_cash: d.paid_cash,
        paid_bank: d.paid_bank,
        debt_amount: d.debt_amount,
        customer,
        paymentMethod: d.paid_bank > 0 && d.paid_cash > 0 ? 'mixed' : (d.paid_bank > 0 ? 'bank' : 'cash'),
        date: new Date().toLocaleString('vi-VN'),
      });
      setCart([]);
      setSerialOptions({});
      dongThanhToan();
      fetchProducts(); // refresh stock
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi thanh toán!');
    }
  };

  // ---- Thanh toán chi tiết: chiết khấu / KM / VAT / chia tiền / ghi nợ ----
  const moThanhToan = async () => {
    if (cart.length === 0) return alert('Giỏ hàng trống!');
    if (pricingLoading) return alert('Đang tải bảng giá khách hàng, vui lòng thử lại ngay.');
    setGiamGia(''); setVat(''); setTraTM(String(totalAmount)); setTraCK(''); setChoNo(false); setKmChon(null);
    setShowThanhToan(true);
    try {
      const res = await axios.get(`${API_BASE}/api/promo/applicable?total=${totalAmount}`);
      setDsKM(res.data);
    } catch { setDsKM([]); }
  };
  const dongThanhToan = () => setShowThanhToan(false);

  const chonKM = (km) => {
    if (kmChon && kmChon.id === km.id) { setKmChon(null); setGiamGia(''); return; }
    setKmChon(km);
    setGiamGia(String(km.discount_value));
  };

  // Luôn trỏ ref tới bản checkout mới nhất để phím tắt F9/F10 dùng đúng giỏ hàng hiện tại
  checkoutRef.current = handleCheckout;

  // --- 1. VOICE POS ---
  const handleVoiceOrder = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome/Edge.');
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.start();
    setIsListening(true);
    
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      
      try {
        const res = await axios.post(`${API_BASE}/api/ai/parse-voice-order`, { text: transcript });
        const items = res.data.items;
        
        let addedCount = 0;
        items.forEach(item => {
          const match = products.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(p.name.toLowerCase()));
          if (match) {
            addToCart(match, item.quantity || 1);
            addedCount++;
          }
        });
        
        if (addedCount === 0) alert(`Nghe được: "${transcript}" nhưng không tìm thấy sản phẩm nào khớp trong kho.`);
      } catch (err) {
        console.error(err);
        alert('Lỗi xử lý giọng nói AI!');
      }
    };
    
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
  };

  // --- 2. CAMERA BARCODE SCANNER ---
  const handleBarcodeDetected = (decodedText) => {
    const code = String(decodedText || '').trim().toLowerCase();
    const match = products.find((product) => [product.barcode, product.sku, product.id]
      .some((value) => String(value ?? '').trim().toLowerCase() === code));
    if (!match) return { ok: false, message: `Không tìm thấy sản phẩm có mã ${decodedText}.` };
    if (Number(match.stock || 0) <= 0) return { ok: false, message: `${match.name} đang hết hàng.` };
    addToCart(match, 1);
    return { ok: true, message: `Đã thêm ${match.name} vào giỏ.` };
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search);
      const matchesCategory = activeCategory === 'all' || String(p.category || '').trim() === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-100/50 relative overflow-hidden">
      
      <BarcodeScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={handleBarcodeDetected}
        title="Quét mã sản phẩm"
      />

      {showQuickCustomer && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => !savingQuickCustomer && setShowQuickCustomer(false)}
            aria-label="Đóng tạo khách hàng"
          />
          <form
            onSubmit={createQuickCustomer}
            className="relative z-10 w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Tạo khách mới</h3>
                <p className="text-xs text-slate-500">Lưu xong sẽ tự chọn khách này vào đơn.</p>
              </div>
              <button
                type="button"
                onClick={() => !savingQuickCustomer && setShowQuickCustomer(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-bold text-slate-600">Tên khách hàng</label>
            <input
              autoFocus
              type="text"
              value={quickCustomer.name}
              onChange={(e) => setQuickCustomer((current) => ({ ...current, name: e.target.value }))}
              placeholder="Ví dụ: Anh Minh"
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <label className="mb-1 block text-xs font-bold text-slate-600">Số điện thoại</label>
            <input
              type="tel"
              inputMode="tel"
              value={quickCustomer.phone}
              onChange={(e) => setQuickCustomer((current) => ({ ...current, phone: e.target.value }))}
              placeholder="Nhập số điện thoại"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <label className="mb-1 mt-3 block text-xs font-bold text-slate-600">Địa chỉ</label>
            <textarea
              rows="2"
              value={quickCustomer.address}
              onChange={(e) => setQuickCustomer((current) => ({ ...current, address: e.target.value }))}
              placeholder="Địa chỉ khách hàng (tuỳ chọn)"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={savingQuickCustomer}
                onClick={() => setShowQuickCustomer(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 font-bold text-slate-700 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingQuickCustomer}
                className="rounded-xl bg-blue-600 px-4 py-3 font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {savingQuickCustomer ? 'Đang lưu...' : 'Lưu khách'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LEFT: Products Grid Area (65%) */}
      <div className="flex-1 flex flex-col h-full bg-slate-50/50 relative">
        
        {/* Top Filter Bar */}
        <div className="p-4 bg-white border-b border-slate-200 flex gap-4 items-center shadow-sm z-10 sticky top-0">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-400" />
            <input 
              ref={searchInputRef}
              type="text"
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchEnter}
              placeholder="Tìm tên / quét mã vạch (F2)..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-100 rounded-xl border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-medium text-slate-700"
            />
            {/* Keyboard hint */}
            <div className="absolute right-3 top-3 border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-400">F2</div>
          </div>
          
          <button 
            type="button"
            onClick={() => setShowScanner(true)}
            data-testid="pos-open-barcode-scanner"
            aria-label="Quét mã vạch bằng camera"
            className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 flex items-center gap-2 transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span className="hidden sm:inline">Quét mã</span>
          </button>

          <button 
            onClick={handleVoiceOrder}
            className={`px-4 py-2.5 font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm ${isListening ? 'bg-red-500 text-white animate-pulse shadow-red-500/30' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20 hover:shadow-md'}`}
          >
            <Mic className="w-5 h-5" />
            <span className="hidden sm:inline">{isListening ? 'Đang nghe...' : 'Gọi món AI'}</span>
          </button>
        </div>

        {/* Categories Pills */}
        <div className="px-4 pt-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-5 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start">
          {filteredProducts.map(p => {
            const isOutOfStock = p.stock <= 0;
            return (
              <div 
                key={p.id} 
                onClick={() => !isOutOfStock && addToCart(p)}
                className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-col h-full transition-all group overflow-hidden relative ${isOutOfStock ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-blue-500/50'}`}
              >
                {/* Image Area */}
                <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-slate-100 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <Package className="w-10 h-10 text-slate-300 group-hover:scale-110 transition-transform duration-500" />
                  )}
                  {isOutOfStock && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center">
                      <span className="bg-red-500 text-white text-xs font-black px-3 py-1 rounded-full shadow-lg">HẾT HÀNG</span>
                    </div>
                  )}
                </div>
                
                {/* Info Area */}
                <div className="flex flex-col flex-1">
                  <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between">
                    <span>{p.sku}</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-500">Kho: {p.stock}</span>
                  </div>
                  <div className="font-bold text-slate-800 leading-snug mb-2 flex-1 group-hover:text-blue-600 line-clamp-2">{p.name}</div>
                  <div className="font-black text-blue-600 text-lg">{new Intl.NumberFormat('vi-VN').format(priceForProduct(p))}</div>
                </div>
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
              <Package className="w-16 h-16 opacity-20 mb-4" />
              <div className="font-medium text-lg">Không tìm thấy sản phẩm.</div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart & Checkout (35%) */}
      <div className="w-full lg:w-[420px] flex flex-col bg-white h-full shadow-2xl lg:shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] z-20 border-l border-slate-200 shrink-0">
        
        {/* Customer Header */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-white sticky top-0 z-10">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
            <User className="w-6 h-6" />
          </div>
          <div className="flex-1 group relative">
            <div className="flex items-center gap-2">
              <select
                value={customer.phone || ''}
                onChange={(e) => {
                  const phone = e.target.value;
                  if (!phone) {
                    setCustomer({ name: 'Khách lẻ', phone: '' });
                    return;
                  }
                  const selected = customers.find((item) => String(item.phone) === String(phone));
                  if (selected) setCustomer({ name: selected.name || 'Khách hàng', phone: selected.phone || '' });
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-black text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                aria-label="Chọn khách hàng đã lưu"
              >
                <option value="">Khách lẻ / Chọn khách đã lưu</option>
                {customers.map((item) => (
                  <option key={item.id} value={item.phone}>{item.name} · {item.phone}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setQuickCustomer({ name: '', phone: '', address: '' });
                  setShowQuickCustomer(true);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
                aria-label="Tạo khách hàng mới"
                title="Tạo khách mới"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <input 
              type="tel" 
              inputMode="tel"
              value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})}
              className="mt-1 w-full text-sm text-slate-500 outline-none bg-transparent placeholder-slate-300"
              placeholder="SĐT khách mới (nếu chưa lưu)"
            />
            {(pricingLoading || customerPricing.level_name) && (
              <div className="mt-1 text-[11px] font-bold text-blue-600">
                {pricingLoading ? 'Đang tải bảng giá…' : `Bảng giá: ${customerPricing.level_name}`}
              </div>
            )}
            <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-blue-500 transition-all group-focus-within:w-full"></div>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
              <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
                <ShoppingCart className="w-10 h-10 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-600 text-lg">Giỏ hàng trống</p>
                <p className="text-sm mt-1">Chọn sản phẩm bên trái để bắt đầu bán hàng</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item, idx) => (
                <div key={item.cart_line_id || `${item.id}-${item.variant_id || 0}-${idx}`} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex gap-3 relative group">
                  <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{item.name}</span>
                      <button onClick={() => removeFromCart(item.cart_line_id)} className="text-slate-300 hover:text-red-500 bg-red-50 hover:bg-red-100 rounded p-1.5 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400">Giá bán</label>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          inputMode="numeric"
                          value={item.price}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItemPrice(item.cart_line_id, e.target.value)}
                          className="h-8 w-28 rounded-lg border border-blue-200 bg-blue-50 px-2 text-sm font-black text-blue-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          aria-label={`Giá bán ${item.name}`}
                        />
                        {Number(item.quantity) > 1 && (
                          <div className="text-[10px] font-semibold text-slate-400">
                            {new Intl.NumberFormat('vi-VN').format(item.price)} × {item.quantity} = <span className="font-black text-slate-600">{new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Quantity Control */}
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                        <button onClick={() => updateQuantity(item.cart_line_id, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={item.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateQuantityValue(item.cart_line_id, e.target.value)}
                          className="h-7 w-14 rounded-md border border-slate-200 bg-white px-1 text-center text-sm font-black text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          aria-label={`Số lượng ${item.name}`}
                        />
                        <button onClick={() => updateQuantity(item.cart_line_id, 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {Array.isArray(item.variants) && item.variants.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1.5">
                        <span className="text-xs font-bold text-indigo-900">Phân loại</span>
                        <select
                          value={item.variant_id || ''}
                          onChange={(e) => updateVariantSelection(item.cart_line_id, e.target.value)}
                          className="ml-auto min-w-40 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs font-black text-slate-800 outline-none focus:border-indigo-500"
                          aria-label={`Phân loại ${item.name}`}
                        >
                          {item.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variantLabel(variant)} · {new Intl.NumberFormat('vi-VN').format(Number(variant.price) || 0)}đ
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {tracksSerial(item) && (
                      <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-amber-900">Serial / IMEI</span>
                          <button
                            type="button"
                            onClick={() => loadSerialOptions(item.id, true)}
                            className="rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                          >
                            Làm mới
                          </button>
                        </div>
                        {serialLoading[Number(item.id)] ? (
                          <div className="py-2 text-xs font-semibold text-amber-700">Đang tải Serial còn trong kho…</div>
                        ) : (
                          <div className="space-y-1.5">
                            {Array.from({ length: Math.max(1, Math.trunc(Number(item.quantity) || 1)) }, (_, serialIndex) => {
                              const currentSerial = String(item.serials?.[serialIndex] || '');
                              const options = Array.isArray(serialOptions[Number(item.id)]) ? serialOptions[Number(item.id)] : [];
                              return (
                                <select
                                  key={`${item.cart_line_id}-serial-${serialIndex}`}
                                  value={currentSerial}
                                  onChange={(e) => updateSerialSelection(item.cart_line_id, serialIndex, e.target.value)}
                                  className={`w-full rounded-lg border bg-white px-2 py-2 text-xs font-black outline-none ${currentSerial ? 'border-emerald-300 text-emerald-800 focus:border-emerald-500' : 'border-amber-300 text-slate-700 focus:border-amber-500'}`}
                                  aria-label={`Serial ${serialIndex + 1} ${item.name}`}
                                >
                                  <option value="">Chọn Serial {serialIndex + 1}/{Math.max(1, Math.trunc(Number(item.quantity) || 1))}</option>
                                  {options.filter((row) => {
                                    const value = String(row.serial || '');
                                    return value === currentSerial || !serialUsedElsewhere(item.cart_line_id, serialIndex, value);
                                  }).map((row) => (
                                    <option key={row.id || row.serial} value={row.serial}>{row.serial}</option>
                                  ))}
                                </select>
                              );
                            })}
                            {(serialOptions[Number(item.id)] || []).length === 0 && (
                              <div className="text-[11px] font-bold text-red-600">Không còn Serial nào ở trạng thái trong kho. Kiểm tra lại mục Serial/IMEI.</div>
                            )}
                            <div className="text-[10px] font-semibold text-amber-700">
                              Còn {(serialOptions[Number(item.id)] || []).length} Serial trong kho · cần chọn {Math.max(1, Math.trunc(Number(item.quantity) || 1))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/70 px-2 py-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="text-xs font-bold text-teal-900">Bảo hành</span>
                      {Array.isArray(item.warranty_options) && item.warranty_options.length > 0 ? (
                        <select
                          value={item.warranty_months ?? 0}
                          onChange={(e) => updateWarrantyMonths(item.cart_line_id, e.target.value)}
                          className="ml-auto min-w-36 rounded-lg border border-teal-200 bg-white px-2 py-1.5 text-xs font-black text-slate-800 outline-none focus:border-teal-500"
                          aria-label={`Gói bảo hành ${item.name}`}
                        >
                          {item.warranty_options.map((option) => (
                            <option key={option.months} value={option.months}>{Number(option.months) === 0 ? 'Không BH' : `${option.months} tháng`} · {new Intl.NumberFormat('vi-VN').format(Number(option.price) || 0)}đ</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <input
                            type="number" min="0" max="240" step="1"
                            value={item.warranty_months ?? 0}
                            onChange={(e) => updateWarrantyMonths(item.cart_line_id, e.target.value)}
                            className="ml-auto w-16 rounded-lg border border-teal-200 bg-white px-2 py-1 text-right text-xs font-black text-slate-800 outline-none focus:border-teal-500"
                            aria-label={`Số tháng bảo hành ${item.name}`}
                          />
                          <span className="text-xs font-semibold text-teal-800">tháng</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & Actions Pane */}
        <div className="bg-white border-t border-slate-200 pb-safe">
          {/* Summary */}
          <div className="px-4 py-3 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 font-medium">Mặt hàng</span>
                <span className="font-bold text-slate-700">{cart.length}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 font-medium">Tổng số lượng</span>
                <span className="font-black text-slate-800">{totalItems}</span>
              </div>
            </div>
            <div className="w-full h-px bg-slate-100 my-1"></div>
            <div className="flex justify-between items-end gap-3">
              <span className="text-lg font-black text-slate-800">Khách cần trả</span>
              <span className="text-3xl font-black text-blue-600">{new Intl.NumberFormat('vi-VN').format(totalAmount)}</span>
            </div>
          </div>

          {serialCheckoutIssue && (
            <div data-testid="pos-serial-blocker" className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
              Chọn đủ Serial/IMEI cho “{serialCheckoutIssue.name}” trước khi thanh toán.
            </div>
          )}

          {/* Thanh toán chi tiết: chiết khấu, khuyến mãi, VAT, chia tiền, ghi nợ */}
          <div className="px-4 pb-2">
            <button
              onClick={moThanhToan}
              disabled={cart.length === 0 || pricingLoading}
              className="w-full py-2.5 border-2 border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-50 disabled:opacity-40 text-sm flex items-center justify-center gap-2"
            >
              <Tag className="w-4 h-4" /> Chiết khấu / Ghi nợ / VAT
            </button>
          </div>

          {/* Action Buttons */}
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <button 
              data-testid="pos-bank-checkout"
              onClick={() => handleCheckout('bank')}
              disabled={cart.length === 0 || pricingLoading || Boolean(serialCheckoutIssue)}
              className="relative flex flex-col items-center justify-center gap-2 py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              <CreditCard className="w-6 h-6 relative z-10" />
              <div className="relative z-10 flex flex-col items-center">
                <span className="font-bold text-sm tracking-wide uppercase">Chuyển Khoản</span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 border border-slate-600 rounded px-1">F10</span>
              </div>
            </button>
            <button 
              data-testid="pos-cash-checkout"
              onClick={() => handleCheckout('cash')}
              disabled={cart.length === 0 || pricingLoading || Boolean(serialCheckoutIssue)}
              className="relative flex flex-col items-center justify-center gap-2 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl shadow-[0_10px_20px_-10px_rgba(34,197,94,0.6)] hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              <Receipt className="w-6 h-6 relative z-10" />
              <div className="relative z-10 flex flex-col items-center">
                <span className="font-bold text-sm tracking-wide uppercase">Tiền Mặt</span>
                <span className="text-[10px] text-green-200 font-mono mt-0.5 border border-green-400 rounded px-1">F9</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Thanh toán chi tiết */}
      {showThanhToan && (() => {
        const giam = Math.min(Number(giamGia) || 0, totalAmount);
        const sauGiam = totalAmount - giam;
        const tienVAT = Math.round(sauGiam * (Number(vat) || 0) / 100);
        const phaiTra = sauGiam + tienVAT;
        const daTra = (Number(traTM) || 0) + (Number(traCK) || 0);
        const conNo = Math.max(0, phaiTra - daTra);
        const traThua = Math.max(0, daTra - phaiTra);
        const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={dongThanhToan}>
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-black text-slate-800">Thanh toán</h3>
                  <p className="text-sm text-slate-500">{totalItems} sản phẩm · tiền hàng {fmt(totalAmount)}đ</p>
                </div>
                <button onClick={dongThanhToan} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 space-y-4">
                {/* Khuyến mãi */}
                {dsKM.length > 0 && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Khuyến mãi áp dụng được</label>
                    <div className="space-y-1.5">
                      {dsKM.map((km) => (
                        <button key={km.id} onClick={() => chonKM(km)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 text-sm transition-all ${
                            kmChon && kmChon.id === km.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300'
                          }`}>
                          <span className="font-semibold text-slate-700 flex items-center gap-2">
                            {km.name}
                            {km.best && <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[10px] rounded font-bold">TỐT NHẤT</span>}
                          </span>
                          <span className="font-bold text-orange-600">−{fmt(km.discount_value)}đ</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Chiết khấu (đ)</label>
                    <input type="number" min="0" value={giamGia}
                      onChange={(e) => { setGiamGia(e.target.value); setKmChon(null); }}
                      placeholder="0" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-right font-bold" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">VAT (%)</label>
                    <select value={vat} onChange={(e) => setVat(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white">
                      <option value="">Không tính VAT</option>
                      <option value="5">5%</option>
                      <option value="8">8%</option>
                      <option value="10">10%</option>
                    </select>
                  </div>
                </div>

                {/* Tổng kết */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Tiền hàng</span><span className="font-semibold">{fmt(totalAmount)}đ</span></div>
                  {giam > 0 && <div className="flex justify-between text-orange-600"><span>Chiết khấu</span><span className="font-semibold">−{fmt(giam)}đ</span></div>}
                  {tienVAT > 0 && <div className="flex justify-between text-slate-500"><span>VAT {vat}%</span><span className="font-semibold">+{fmt(tienVAT)}đ</span></div>}
                  <div className="border-t border-slate-200 pt-2 flex justify-between items-end">
                    <span className="font-black text-slate-800">Khách cần trả</span>
                    <span className="text-2xl font-black text-blue-600">{fmt(phaiTra)}đ</span>
                  </div>
                </div>

                {/* Chia tiền */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Khách trả</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-slate-500">Tiền mặt</span>
                      <input type="number" min="0" value={traTM} onChange={(e) => setTraTM(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-green-500 text-right font-bold" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Chuyển khoản</span>
                      <input type="number" min="0" value={traCK} onChange={(e) => setTraCK(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-right font-bold" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => { setTraTM(String(phaiTra)); setTraCK(''); }} className="flex-1 py-1.5 text-xs font-bold bg-slate-100 rounded-lg hover:bg-slate-200">Đủ tiền mặt</button>
                    <button onClick={() => { setTraCK(String(phaiTra)); setTraTM(''); }} className="flex-1 py-1.5 text-xs font-bold bg-slate-100 rounded-lg hover:bg-slate-200">Đủ chuyển khoản</button>
                  </div>
                </div>

                {traThua > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-3 flex justify-between">
                    <span className="font-bold text-emerald-700">Tiền thối lại khách</span>
                    <span className="font-black text-emerald-700">{fmt(traThua)}đ</span>
                  </div>
                )}

                {conNo > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-bold text-amber-800">Khách còn thiếu</span>
                      <span className="font-black text-amber-800">{fmt(conNo)}đ</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 cursor-pointer">
                      <input type="checkbox" checked={choNo} onChange={(e) => setChoNo(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                      Cho khách ghi nợ số tiền này
                    </label>
                    {choNo && !customer.phone && (
                      <p className="text-xs text-rose-600 font-semibold">Cần nhập số điện thoại khách ở ô "Khách hàng" để theo dõi công nợ.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button onClick={dongThanhToan} className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100">Hủy</button>
                <button
                  onClick={() => handleCheckout('cash', {
                    discount: giam, promotion_id: kmChon ? kmChon.id : null, vat_rate: Number(vat) || 0,
                    paid_cash: Number(traTM) || 0, paid_bank: Number(traCK) || 0, cho_no: choNo,
                  })}
                  disabled={pricingLoading || (conNo > 0 && (!choNo || !customer.phone))}
                  className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Xác nhận thanh toán {fmt(phaiTra)}đ
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* VietQR Payment Modal */}
      {vietQrUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col items-center p-8 text-center relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => {setVietQrUrl(''); setWaitingPaymentCode(null)}} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2"><X className="w-5 h-5"/></button>
            
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <CreditCard className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Thanh toán Chuyển khoản</h2>
            <p className="text-slate-500 text-sm mb-6">Mã QR đã chứa sẵn Số Tiền & Nội Dung. Khách hàng chỉ cần quét và xác nhận.</p>
            
            <div className="border-4 border-blue-500 rounded-2xl p-3 mb-6 bg-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-[scan_2s_ease-in-out_infinite]"></div>
              <img src={vietQrUrl} alt="VietQR" className="w-64 h-64 object-contain" />
            </div>
            
            <div className="flex items-center gap-3 text-blue-700 font-bold bg-blue-50 border border-blue-100 px-6 py-3 rounded-full w-full justify-center">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
              </div>
              Hệ thống đang chờ nhận tiền...
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {receiptData && !vietQrUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 print:bg-white print:p-0">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden print:shadow-none print:max-w-full animate-in fade-in slide-in-from-bottom-10 duration-300">
            <div className="p-8 print:p-0" id="receipt-content">
              {/* Receipt Content remains largely the same but with refined typography */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-widest">{shopInfo.name || 'CỬA HÀNG'}</h2>
                {shopInfo.address && <p className="text-sm text-slate-500 mt-1">{shopInfo.address}</p>}
                {shopInfo.phone && <div className="text-xs text-slate-400 mt-0.5">Tel: {shopInfo.phone}</div>}
              </div>
              
              <div className="border-t-2 border-b-2 border-dashed border-slate-200 py-4 mb-4">
                <div className="text-center font-black text-xl mb-3 text-slate-800">HÓA ĐƠN BÁN LẺ</div>
                <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                  <span>Mã Đơn:</span>
                  <span className="font-mono font-bold">{receiptData.order_code}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                  <span>Ngày:</span>
                  <span>{receiptData.date}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Khách:</span>
                  <span className="font-semibold">{receiptData.customer.name}</span>
                </div>
              </div>

              <div className="space-y-3 mb-6 min-h-[100px]">
                {receiptData.cart.map((item, idx) => (
                  <div key={item.cart_line_id || `${item.id}-${item.variant_id || 0}-${idx}`} className="flex justify-between text-sm">
                    <div className="flex-1 pr-3">
                      <div className="font-bold text-slate-800">{item.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.quantity} x {new Intl.NumberFormat('vi-VN').format(item.price)}</div>
                      {Array.isArray(item.serials) && item.serials.filter(Boolean).length > 0 && (
                        <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Serial: {item.serials.filter(Boolean).join(', ')}</div>
                      )}
                    </div>
                    <div className="font-black text-slate-800">
                      {new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-slate-800 pt-3">
                {receiptData.discount > 0 && (
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Chiết khấu:</span>
                    <span className="font-semibold text-orange-600">−{new Intl.NumberFormat('vi-VN').format(receiptData.discount)}</span>
                  </div>
                )}
                {receiptData.vat_amount > 0 && (
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>VAT {receiptData.vat_rate}%:</span>
                    <span className="font-semibold">+{new Intl.NumberFormat('vi-VN').format(receiptData.vat_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-end">
                  <span className="font-bold text-slate-600 uppercase text-sm">Tổng thanh toán:</span>
                  <span className="text-2xl font-black text-slate-800">{new Intl.NumberFormat('vi-VN').format(receiptData.totalAmount)} đ</span>
                </div>
                {receiptData.debt_amount > 0 && (
                  <div className="flex justify-between items-center mt-2 text-sm bg-amber-50 rounded-lg px-2 py-1.5">
                    <span className="font-bold text-amber-800">Còn nợ:</span>
                    <span className="font-black text-amber-800">{new Intl.NumberFormat('vi-VN').format(receiptData.debt_amount)} đ</span>
                  </div>
                )}
                <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
                  <span>Hình thức:</span>
                  <span className="font-bold uppercase bg-slate-100 px-2 py-1 rounded">
                    {receiptData.paymentMethod === 'mixed' ? 'Tiền mặt + CK' : receiptData.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'}
                  </span>
                </div>
              </div>
              
              <div className="text-center mt-8 pt-6 border-t border-dashed border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="font-bold text-slate-800">Giao dịch thành công</div>
                <div className="text-xs italic text-slate-500 mt-1">Cảm ơn quý khách và hẹn gặp lại!</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3 print:hidden">
              <button 
                onClick={() => setReceiptData(null)}
                className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors"
              >
                Đóng
              </button>
              <button
                onClick={() => inHoaDonK80(receiptData, shopInfo)}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
              >
                <Receipt className="w-5 h-5" /> In Hóa Đơn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}