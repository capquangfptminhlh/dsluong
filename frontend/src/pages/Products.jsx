import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Package, Plus, Search, Edit2, Trash2, ChevronDown, ChevronRight, Tags, Info, Filter, MoreHorizontal, Image as ImageIcon, FileText, X, Upload, Printer, DollarSign, Eye } from 'lucide-react';
import API_BASE from '../config/api';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Multi-select & Description States
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedDesc, setSelectedDesc] = useState(null);
  const [showDescModal, setShowDescModal] = useState(false);

  // Edit Modals State
  const [editProductModal, setEditProductModal] = useState(null);
  const [editVariantModal, setEditVariantModal] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Barcode & Bulk Price & Variant Detail Modals
  const [variantDetailModal, setVariantDetailModal] = useState(null); // { parent, activeIdx }
  const [barcodeModal, setBarcodeModal] = useState(null); // { item, quantity }
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkPriceType, setBulkPriceType] = useState('fixed_add');
  const [bulkPriceValue, setBulkPriceValue] = useState('10000');
  const [updatingBulkPrice, setUpdatingBulkPrice] = useState(false);

  // Form State
  const [form, setForm] = useState({ name: '', category: '', image_url: '', description: '' });
  const [attributes, setAttributes] = useState([{ name: 'Màu sắc', values: 'Đỏ, Xanh' }]);
  const [hasVariants, setHasVariants] = useState(false);
  const [generatedVariants, setGeneratedVariants] = useState([]);
  
  // Basic single product state
  const [singlePrice, setSinglePrice] = useState('0');
  const [singleCost, setSingleCost] = useState('0');
  const [singleStock, setSingleStock] = useState('0');
  const [singleSku, setSingleSku] = useState('');
  const [singleBarcode, setSingleBarcode] = useState('');

  useEffect(() => {
    fetchProducts();
    const onUpdated = () => fetchProducts();
    window.addEventListener('productsUpdated', onUpdated);
    window.addEventListener('branchChanged', onUpdated);
    return () => {
      window.removeEventListener('productsUpdated', onUpdated);
      window.removeEventListener('branchChanged', onUpdated);
    };
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/products`);
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} sản phẩm đã chọn?`)) return;
    try {
      await axios.post(`${API_BASE}/api/products/bulk-delete`, { ids: selectedIds });
      setSelectedIds([]);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi xóa hàng loạt');
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ sản phẩm trong kho. Bạn có chắc chắn không?')) return;
    try {
      await axios.delete(`${API_BASE}/api/products/clear-all/confirm`);
      setSelectedIds([]);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi xóa toàn bộ kho');
    }
  };

  const handleBulkUpdatePrice = async () => {
    if (selectedIds.length === 0) return;
    setUpdatingBulkPrice(true);
    try {
      await axios.post(`${API_BASE}/api/products/bulk-update-price`, {
        ids: selectedIds,
        type: bulkPriceType,
        value: bulkPriceValue
      });
      setShowBulkPriceModal(false);
      setSelectedIds([]);
      fetchProducts();
      alert('Đã cập nhật giá bán thành công!');
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi đổi giá hàng loạt');
    } finally {
      setUpdatingBulkPrice(false);
    }
  };

  const handleSaveProductEdit = async (e) => {
    e.preventDefault();
    if (!editProductModal) return;
    setSavingEdit(true);
    try {
      await axios.put(`${API_BASE}/api/products/${editProductModal.id}`, editProductModal);
      setEditProductModal(null);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu chỉnh sửa sản phẩm');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveVariantEdit = async (e) => {
    e.preventDefault();
    if (!editVariantModal) return;
    setSavingEdit(true);
    try {
      await axios.put(`${API_BASE}/api/products/variants/${editVariantModal.id}`, editVariantModal);
      setEditVariantModal(null);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu chỉnh sửa biến thể');
    } finally {
      setSavingEdit(false);
    }
  };
  const handleImageFileUpload = (e, onImageSelect) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelect(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const generateVariants = () => {
    if (attributes.length === 0 || !attributes[0].values) return;
    
    const parsedAttrs = attributes.filter(a => a.name.trim() !== '' && a.values.trim() !== '').map(a => ({
      name: a.name.trim(),
      values: a.values.split(',').map(v => v.trim()).filter(v => v !== '')
    }));

    if (parsedAttrs.length === 0) return;

    const cartesian = (arrays) => {
      return arrays.reduce((a, b) => {
        return a.map(x => b.map(y => x.concat([y]))).reduce((c, d) => c.concat(d), []);
      }, [[]]);
    };

    const valueArrays = parsedAttrs.map(a => a.values);
    const combinations = cartesian(valueArrays);

    const variants = combinations.map((combo, idx) => {
      let attrObj = {};
      parsedAttrs.forEach((attr, i) => {
        attrObj[attr.name] = combo[i];
      });
      
      const skuSuffix = combo.map(c => c.substring(0,3).toUpperCase()).join('-');
      return {
        sku: `SKU-${Math.floor(Math.random()*1000)}-${skuSuffix}`,
        attributes: attrObj,
        price: singlePrice,
        cost_price: singleCost,
        stock: 0
      };
    });

    setGeneratedVariants(variants);
  };

  useEffect(() => {
    if (hasVariants) generateVariants();
  }, [attributes, hasVariants]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (hasVariants && generatedVariants.length > 0) {
        await axios.post(`${API_BASE}/api/products/with-variants`, {
          name: form.name,
          category: form.category,
          image_url: form.image_url,
          variants: generatedVariants.map(v => ({
            ...v,
            price: Number(v.price),
            cost_price: Number(v.cost_price),
            stock: Number(v.stock)
          }))
        });
      } else {
        await axios.post(`${API_BASE}/api/products/with-variants`, {
          name: form.name,
          category: form.category,
          image_url: form.image_url,
          variants: [{
            sku: singleSku.trim() || `SKU-${Math.floor(10000 + Math.random()*90000)}`,
            barcode: singleBarcode.trim() || singleSku.trim(),
            attributes: { "Phiên bản": "Mặc định" },
            price: Number(singlePrice),
            cost_price: Number(singleCost),
            stock: Number(singleStock)
          }]
        });
      }

      setShowModal(false);
      resetForm();
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi lưu sản phẩm!');
    }
  };

  const resetForm = () => {
    setForm({ name: '', category: '', image_url: '' });
    setHasVariants(false);
    setAttributes([{ name: 'Màu sắc', values: 'Đỏ, Xanh' }]);
    setGeneratedVariants([]);
    setSinglePrice('0');
    setSingleCost('0');
    setSingleStock('0');
    setSingleSku('');
    setSingleBarcode('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này cùng tất cả biến thể?')) return;
    try {
      await axios.delete(`${API_BASE}/api/products/${id}`);
      fetchProducts();
    } catch (err) {
      console.error(err);
    }
  };

  const updateVariantField = (index, field, value) => {
    const newVariants = [...generatedVariants];
    newVariants[index][field] = value;
    setGeneratedVariants(newVariants);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importFile) return alert('Vui lòng chọn file Excel (.xlsx, .xls, .csv)');
    setImporting(true);
    try {
      const buf = await importFile.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows || rows.length < 2) {
        alert('File Excel trống hoặc không có dữ liệu sản phẩm!');
        return;
      }

      let headerIdx = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const r = rows[i] || [];
        const joined = r.map((x) => String(x || '').toLowerCase()).join(' ');
        if (joined.includes('tên hàng') || joined.includes('tên sản phẩm') || joined.includes('mã hàng') || joined.includes('giá bán')) {
          headerIdx = i;
          break;
        }
      }

      const headers = (rows[headerIdx] || []).map((h) => String(h || '').toLowerCase().trim());
      const findCol = (preds) => headers.findIndex((h) => preds.some((p) => (typeof p === 'function' ? p(h) : h.includes(p))));

      let colName = findCol([(h) => h === 'tên hàng', (h) => h === 'tên sản phẩm*', 'tên sản phẩm', 'tên hàng', 'tên thuốc']);
      if (colName === -1) colName = headers[0]?.includes('loại hàng') ? 3 : 0;

      const colSku = findCol([(h) => h === 'mã hàng', (h) => h === 'mã sku*', 'mã hàng', 'mã sku', (h) => h === 'sku', 'mã vạch', 'barcode']);
      const colCat = findCol(['nhóm hàng', 'loại sản phẩm', 'danh mục', 'phân loại']);
      const colPrice = findCol([(h) => h === 'giá bán', 'giá lẻ', 'giá bán', 'đơn giá']);
      const colCost = findCol([(h) => h === 'giá vốn', 'giá nhập', 'giá vốn']);
      const colStock = findCol([(h) => h === 'tồn kho', 'tồn kho', 'số lượng']);
      const colUnit = findCol([(h) => h === 'đvt', 'đơn vị tính', 'đvt']);
      const colBaseSku = findCol(['mã đvt cơ bản']);
      const colRatio = findCol([(h) => h === 'quy đổi', 'quy đổi']);
      const colImage = findCol(['hình ảnh', 'ảnh đại diện', (h) => h === 'ảnh']);
      const colLot1 = findCol([(h) => h === 'lô 1']);
      const colExp1 = findCol([(h) => h === 'hạn sử dụng 1']);
      const colQty1 = findCol([(h) => h === 'tồn 1']);

      const parseNum = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        if (!v) return 0;
        const cleaned = String(v).replace(/[^\d.-]/g, '');
        return Number(cleaned) || 0;
      };

      const excelDateToIso = (v) => {
        if (!v) return '';
        if (typeof v === 'number' && v > 20000 && v < 80000) {
          return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
        }
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return s.slice(0, 10);
      };

      const items = [];
      const batches = [];
      const units = [];

      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const baseName = colName !== -1 && r[colName] !== undefined ? String(r[colName]).trim() : '';
        if (!baseName) continue;

        const rawCat = colCat !== -1 && r[colCat] ? String(r[colCat]).trim() : 'THUỐC';
        const topCat = rawCat.split('>>')[0].trim() || 'THUỐC';
        const unit = colUnit !== -1 && r[colUnit] ? String(r[colUnit]).trim() : 'Hộp';
        const sku = colSku !== -1 && r[colSku] ? String(r[colSku]).trim() : `KV-${1000 + i}`;
        const baseSku = colBaseSku !== -1 && r[colBaseSku] ? String(r[colBaseSku]).trim() : '';
        const ratio = colRatio !== -1 ? Math.max(1, parseNum(r[colRatio])) : 1;
        const price = colPrice !== -1 ? Math.max(0, Math.round(parseNum(r[colPrice]))) : 0;
        const cost_price = colCost !== -1 ? Math.max(0, Math.round(parseNum(r[colCost]))) : 0;
        const stock = colStock !== -1 ? Math.max(0, Math.round(parseNum(r[colStock]))) : 0;
        const image_url = colImage !== -1 && r[colImage] ? String(r[colImage]).split(',')[0].trim() : '';

        const displayName = unit ? `${baseName} (${unit})` : baseName;
        const prodId = 1000 + items.length + 1;

        items.push({
          id: prodId,
          name: displayName,
          sku,
          price,
          cost_price,
          stock,
          category: topCat,
          base_unit: unit || 'Hộp',
          image_url
        });

        if (baseSku && ratio > 1) {
          units.push({
            id: units.length + 1,
            product_id: prodId,
            product_name: baseName,
            unit_name: unit || 'Hộp',
            ratio,
            price,
            barcode: sku
          });
        }

        if (!baseSku && colLot1 !== -1 && r[colLot1]) {
          batches.push({
            id: batches.length + 1,
            product_id: prodId,
            product_name: baseName,
            sku,
            batch_code: String(r[colLot1]).trim(),
            expiry_date: (colExp1 !== -1 ? excelDateToIso(r[colExp1]) : '') || '2027-12-31',
            quantity: colQty1 !== -1 ? Math.max(0, Math.round(parseNum(r[colQty1]))) : stock,
            cost_price,
            note: 'Nhập từ KiotViet'
          });
        }
      }

      if (items.length === 0) {
        alert('Không tìm thấy dòng sản phẩm hợp lệ trong file Excel!');
        return;
      }

      const res = await axios.post(`${API_BASE}/api/products/import-json`, {
        mode: items.length >= 500 ? 'replace' : 'merge',
        items,
        batches,
        units
      });

      alert(res.data.message || `Đã nhập thành công ${items.length.toLocaleString('vi-VN')} sản phẩm!`);
      setShowImportModal(false);
      setImportFile(null);
      setCurrentPage(1);
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Lỗi đọc hoặc nhập file Excel: ' + (err.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const formatPrice = (price) => new Intl.NumberFormat('vi-VN').format(price || 0) + ' đ';

  const qLower = searchQuery.toLowerCase().trim();
  const filteredProducts = products.filter((p) =>
    !qLower ||
    (p.name || '').toLowerCase().includes(qLower) ||
    (p.sku || '').toLowerCase().includes(qLower) ||
    (p.category || '').toLowerCase().includes(qLower)
  );
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="p-8 max-w-[1400px] mx-auto h-full flex flex-col relative bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Package className="w-8 h-8 text-blue-600" /> Hàng Hóa & Tồn Kho
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Quản lý Master Data hàng hóa, hỗ trợ biến thể SKU đa tầng.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowImportModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5"
          >
            <Package className="w-5 h-5" /> Nhập từ KiotViet/Sapo
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5"
          >
            <Plus className="w-5 h-5" /> Thêm Sản Phẩm
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap gap-4 items-center justify-between sticky top-0 z-20">
          <div className="relative w-full max-w-md">
            <Search className="w-5 h-5 absolute left-3.5 top-2.5 text-slate-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Tìm theo tên thuốc, mã SKU, danh mục..." 
              className="w-full pl-11 pr-4 py-2.5 bg-slate-100/80 rounded-xl border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-medium text-slate-700"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <span className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black rounded-xl">
              Tổng kho: {filteredProducts.length.toLocaleString('vi-VN')} sản phẩm
            </span>
            <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 flex items-center gap-2 transition-colors">
              <Filter className="w-4 h-4" /> Lọc Nâng Cao
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto bg-slate-50/50">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-black sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-2 py-4 w-8"></th>
                <th className="px-4 py-4">Sản Phẩm</th>
                <th className="px-4 py-4">Phân Loại</th>
                <th className="px-4 py-4">Mã SKU</th>
                <th className="px-4 py-4 text-right">Giá Bán</th>
                <th className="px-4 py-4 text-center">Tồn Kho</th>
                <th className="px-4 py-4 text-center">Trạng Thái</th>
                <th className="px-4 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr><td colSpan="9" className="text-center py-12 text-slate-500 font-medium">Đang tải dữ liệu hàng hóa...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-12 text-slate-500">
                  <div className="flex flex-col items-center py-8">
                    <Package className="w-12 h-12 text-slate-300 mb-3" />
                    Không tìm thấy sản phẩm nào.
                  </div>
                </td></tr>
              ) : (
                paginatedProducts.map(p => (
                  <React.Fragment key={p.id}>
                    {/* Parent Row */}
                    <tr 
                      className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors cursor-pointer group ${selectedIds.includes(p.id) ? 'bg-blue-50/40' : ''}`}
                      onClick={() => toggleRow(p.id)}
                    >
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(p.id)}
                          onChange={() => toggleSelectRow(p.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-4 text-slate-400 group-hover:text-blue-600 transition-colors">
                        {expandedRows[p.id] ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-1">{p.name}</div>
                            <div className="text-[11px] text-slate-400 font-medium mt-0.5">ĐVT: {p.base_unit || 'Hộp'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold uppercase tracking-wider">{p.category || 'Chưa phân loại'}</span>
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-500 text-sm font-semibold">{p.sku}</td>
                      <td className="px-4 py-4 text-right font-black text-blue-600">
                        {formatPrice(p.price)}
                      </td>
                      <td className="px-4 py-4 text-center font-black text-slate-700">
                        {p.stock}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 font-bold rounded-full text-[10px] uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Đang Bán
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => setBarcodeModal({ item: p, quantity: Math.max(1, p.stock || 5) })} 
                            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="In Tem Mã Vạch"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {p.description && (
                            <button 
                              onClick={() => { setSelectedDesc({ name: p.name, content: p.description }); setShowDescModal(true); }}
                              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Xem mô tả sản phẩm"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => setEditProductModal({ ...p })} 
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Chỉnh sửa sản phẩm"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Child Rows (Variants) */}
                    {expandedRows[p.id] && p.variants && p.variants.map((v, vidx) => (
                      <tr key={vidx} className="bg-slate-50 border-b border-slate-100">
                        <td className="px-4 py-3" colSpan="2"></td>
                        <td colSpan="2" className="px-4 py-3">
                          <div className="flex items-center gap-3 pl-4">
                            <div className="w-4 h-px bg-slate-300"></div>
                            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                              {(v.image_url || p.image_url) ? (
                                <img src={v.image_url || p.image_url} alt="Variant" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-300" />
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 items-center">
                              {Object.entries(v.attributes).map(([k, val]) => (
                                <span key={k} className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-700 shadow-2xs">
                                  {k}: <span className="text-blue-600">{val}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 font-semibold">{v.sku}</td>
                        <td className="px-4 py-3 text-right font-black text-blue-600">{formatPrice(v.price)}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-600">{v.stock}</td>
                        <td className="px-4 py-3 text-right" colSpan="2">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setVariantDetailModal({ parent: p, activeIdx: vidx })} 
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Xem Chi Tiết Phiên Bản (Chuẩn Sapo)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setBarcodeModal({ item: { ...v, name: `${p.name} - ${Object.values(v.attributes || {}).join(' ')}` }, quantity: Math.max(1, v.stock || 5) })} 
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="In Tem Mã Vạch Biến Thể"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setEditVariantModal({ ...v, parentName: p.name })} 
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Sửa biến thể"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredProducts.length > 0 && (
          <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="text-slate-600 font-medium">
              Hiển thị <span className="font-bold text-slate-800">{((safePage - 1) * pageSize + 1).toLocaleString('vi-VN')}</span> - <span className="font-bold text-slate-800">{Math.min(safePage * pageSize, filteredProducts.length).toLocaleString('vi-VN')}</span> trong tổng số <span className="font-black text-blue-600">{filteredProducts.length.toLocaleString('vi-VN')}</span> sản phẩm
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Trang trước
              </button>
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 font-black rounded-lg text-xs">
                Trang {safePage} / {totalPages.toLocaleString('vi-VN')}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Trang sau →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-800 animate-in slide-in-from-bottom-4">
          <span className="font-bold text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-400" /> Đã chọn <span className="text-blue-400 font-black">{selectedIds.length}</span> sản phẩm
          </span>
          <div className="h-4 w-px bg-slate-700"></div>
          <button 
            onClick={() => setShowBulkPriceModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-600/30"
          >
            <DollarSign className="w-4 h-4" /> Đổi Giá Hàng Loạt
          </button>
          <button 
            onClick={handleBulkDelete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md shadow-red-600/30"
          >
            <Trash2 className="w-4 h-4" /> Xóa Đã Chọn
          </button>
          <button 
            onClick={handleClearAll}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 hover:text-red-300 text-xs font-bold rounded-xl transition-all border border-slate-700"
          >
            Xóa toàn bộ kho
          </button>
          <button 
            onClick={() => setSelectedIds([])}
            className="text-slate-400 hover:text-white text-xs font-bold transition-colors ml-2"
          >
            Hủy chọn
          </button>
        </div>
      )}

      {/* Description Viewer Modal */}
      {showDescModal && selectedDesc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base line-clamp-1">
                <FileText className="w-5 h-5 text-blue-600 shrink-0" /> {selectedDesc.name}
              </h3>
              <button onClick={() => setShowDescModal(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg">✕</button>
            </div>
            <div className="p-6 overflow-auto flex-1 prose max-w-none text-slate-700 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: selectedDesc.content }}></div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 text-right">
              <button onClick={() => setShowDescModal(false)} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 lg:p-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="text-2xl font-black text-slate-800">Thêm Sản Phẩm Mới</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 p-2 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-auto flex flex-col lg:flex-row">
              {/* Left Column: Basic Info */}
              <div className="w-full lg:w-1/3 p-8 border-r border-slate-100 space-y-5 bg-slate-50/50">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Tên sản phẩm <span className="text-red-500">*</span></label>
                  <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" placeholder="Ví dụ: Áo thun nam Cotton" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Mã SKU</label>
                    <input type="text" value={singleSku} onChange={e => setSingleSku(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono font-bold text-slate-800 text-sm" placeholder="VD: CC-8670" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Mã Barcode</label>
                    <input type="text" value={singleBarcode} onChange={e => setSingleBarcode(e.target.value)} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono font-bold text-slate-800 text-sm" placeholder="VD: CC-8670" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Nhóm hàng / Danh mục</label>
                  <input type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" placeholder="Ví dụ: Thời trang" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Đơn vị tính</label>
                    <input type="text" value={form.unit || ''} onChange={e => setForm({...form, unit: e.target.value})} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-slate-800 text-sm" placeholder="VD: Cái, Hộp, Thùng" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Khối lượng (g)</label>
                    <input type="number" value={form.weight || ''} onChange={e => setForm({...form, weight: e.target.value})} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-slate-800 text-sm" placeholder="VD: 500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Hình ảnh sản phẩm</label>
                  <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-white">
                    <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                      {form.image_url ? (
                        <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5 transition-colors shadow-xs">
                        <Upload className="w-3.5 h-3.5" /> Tải ảnh từ máy tính
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleImageFileUpload(e, (url) => setForm({ ...form, image_url: url }))} 
                        />
                      </label>
                      {form.image_url && (
                        <button 
                          type="button" 
                          onClick={() => setForm({ ...form, image_url: '' })}
                          className="ml-2 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="pt-6 border-t border-slate-200">
                  <label className="flex items-start gap-3 cursor-pointer p-4 bg-blue-50 border border-blue-200 rounded-2xl hover:bg-blue-100 transition-colors group">
                    <div className="mt-0.5">
                      <input type="checkbox" checked={hasVariants} onChange={e => setHasVariants(e.target.checked)} className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                    </div>
                    <div>
                      <div className="font-black text-blue-900 text-base">Sản phẩm có nhiều Biến Thể</div>
                      <div className="text-sm text-blue-600/80 mt-0.5 font-medium">Sản phẩm có nhiều Màu sắc, Kích thước, Dung tích...</div>
                    </div>
                  </label>
                </div>

                {!hasVariants && (
                  <div className="space-y-5 pt-6 border-t border-slate-200">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">Giá bán lẻ (VNĐ)</label>
                      <input type="number" value={singlePrice} onChange={e => setSinglePrice(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-black text-blue-600 text-lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Giá vốn</label>
                        <input type="number" value={singleCost} onChange={e => setSingleCost(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Tồn kho</label>
                        <input type="number" value={singleStock} onChange={e => setSingleStock(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-black" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Variants Config */}
              <div className="w-full lg:w-2/3 p-8 bg-white">
                {hasVariants ? (
                  <div className="h-full flex flex-col space-y-6">
                    <div>
                      <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                        <Tags className="w-5 h-5 text-blue-600"/> Cấu hình Thuộc tính
                      </h3>
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                        {attributes.map((attr, idx) => (
                          <div key={idx} className="flex gap-4">
                            <div className="w-1/3">
                              <input type="text" value={attr.name} onChange={e => {
                                const newAttrs = [...attributes];
                                newAttrs[idx].name = e.target.value;
                                setAttributes(newAttrs);
                              }} placeholder="Tên Thuộc tính (VD: Màu sắc)" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm" />
                            </div>
                            <div className="flex-1">
                              <input type="text" value={attr.values} onChange={e => {
                                const newAttrs = [...attributes];
                                newAttrs[idx].values = e.target.value;
                                setAttributes(newAttrs);
                              }} placeholder="Các giá trị phân cách bằng dấu phẩy (VD: Đỏ, Xanh, Vàng)" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm" />
                            </div>
                            {idx === attributes.length - 1 && attributes.length < 3 && (
                              <button type="button" onClick={() => setAttributes([...attributes, { name: '', values: '' }])} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors">
                                <Plus className="w-5 h-5"/>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-[300px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="p-4 bg-slate-50 border-b border-slate-200 font-black text-slate-800 flex justify-between items-center">
                        <span>Danh sách Phiên bản (SKUs)</span>
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">{generatedVariants.length} Phiên bản</span>
                      </div>
                      <div className="flex-1 overflow-auto bg-slate-50/30">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead className="bg-white sticky top-0 shadow-sm">
                            <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                              <th className="p-3 border-b border-slate-200">Tên Phân Loại</th>
                              <th className="p-3 border-b border-slate-200">Mã SKU</th>
                              <th className="p-3 border-b border-slate-200 text-right">Giá bán</th>
                              <th className="p-3 border-b border-slate-200 text-center">Tồn kho</th>
                            </tr>
                          </thead>
                          <tbody>
                            {generatedVariants.map((v, idx) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                                <td className="p-3 font-bold text-slate-700">
                                  {Object.values(v.attributes).join(' - ')}
                                </td>
                                <td className="p-3">
                                  <input type="text" value={v.sku} onChange={(e) => updateVariantField(idx, 'sku', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-mono text-xs font-bold text-slate-600 focus:outline-none focus:border-blue-500" />
                                </td>
                                <td className="p-3">
                                  <input type="number" value={v.price} onChange={(e) => updateVariantField(idx, 'price', e.target.value)} className="w-28 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-right font-black text-blue-600" />
                                </td>
                                <td className="p-3">
                                  <input type="number" value={v.stock} onChange={(e) => updateVariantField(idx, 'stock', e.target.value)} className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-center font-bold" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 flex-col gap-4">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-slate-300" />
                    </div>
                    <p className="font-medium">Kích hoạt "Nhiều Biến Thể" để tạo tổ hợp Size, Màu sắc...</p>
                  </div>
                )}
              </div>
            </form>
            
            <div className="px-8 py-5 border-t border-slate-100 bg-white flex justify-end gap-4 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
              <button type="button" onClick={() => setShowModal(false)} className="px-8 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Đóng cửa sổ</button>
              <button onClick={handleSubmit} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all hover:-translate-y-0.5">
                Lưu Hệ Thống
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50 rounded-t-3xl">
              <div>
                <h2 className="text-xl font-black text-emerald-800">Nhập từ KiotViet/Sapo</h2>
                <p className="text-emerald-600 text-sm font-medium mt-1">Upload file Excel (.xlsx) xuất từ hệ thống cũ</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors">
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:bg-slate-50 transition-colors">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  onChange={e => setImportFile(e.target.files[0])}
                  className="hidden" 
                  id="excel-upload" 
                />
                <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                    <Package className="w-8 h-8" />
                  </div>
                  <span className="text-slate-700 font-bold text-lg mb-1">
                    {importFile ? importFile.name : 'Nhấn để chọn file Excel'}
                  </span>
                  <span className="text-slate-500 text-sm">Hỗ trợ định dạng .xlsx, .xls, .csv</span>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setShowImportModal(false)} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                  Hủy
                </button>
                <button 
                  onClick={handleImport} 
                  disabled={importing || !importFile}
                  className="px-6 py-3 font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-lg shadow-emerald-600/20"
                >
                  {importing ? 'Đang xử lý...' : 'Bắt đầu Nhập'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 lg:p-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" /> Chỉnh Sửa Sản Phẩm
              </h2>
              <button onClick={() => setEditProductModal(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg">✕</button>
            </div>
            
            <form onSubmit={handleSaveProductEdit} className="p-8 overflow-auto flex-1 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tên sản phẩm *</label>
                <input 
                  type="text"
                  value={editProductModal.name || ''}
                  onChange={e => setEditProductModal({ ...editProductModal, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Danh mục / Phân loại</label>
                  <input 
                    type="text"
                    value={editProductModal.category || ''}
                    onChange={e => setEditProductModal({ ...editProductModal, category: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Mã Sản Phẩm Mẹ (Product Code)</label>
                  <input 
                    type="text"
                    value={editProductModal.sku || ''}
                    onChange={e => setEditProductModal({ ...editProductModal, sku: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-mono text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Giá bán (đ)</label>
                  <input 
                    type="number"
                    value={editProductModal.price || 0}
                    onChange={e => setEditProductModal({ ...editProductModal, price: Number(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-bold text-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Giá vốn (đ)</label>
                  <input 
                    type="number"
                    value={editProductModal.cost_price || 0}
                    onChange={e => setEditProductModal({ ...editProductModal, cost_price: Number(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-medium text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Tồn kho</label>
                  <input 
                    type="number"
                    value={editProductModal.stock || 0}
                    onChange={e => setEditProductModal({ ...editProductModal, stock: Number(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Hình ảnh sản phẩm</label>
                <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl bg-slate-50/50">
                  <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
                    {editProductModal.image_url ? (
                      <img src={editProductModal.image_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-2 transition-colors shadow-sm">
                        <Upload className="w-4 h-4" /> Tải ảnh từ máy tính
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleImageFileUpload(e, (url) => setEditProductModal({ ...editProductModal, image_url: url }))} 
                        />
                      </label>
                      {editProductModal.image_url && (
                        <button 
                          type="button" 
                          onClick={() => setEditProductModal({ ...editProductModal, image_url: '' })}
                          className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                    <input 
                      type="text"
                      value={editProductModal.image_url || ''}
                      onChange={e => setEditProductModal({ ...editProductModal, image_url: e.target.value })}
                      placeholder="Hoặc dán link URL ảnh (https://...)"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Mô tả sản phẩm</label>
                <textarea 
                  rows="4"
                  value={editProductModal.description || ''}
                  onChange={e => setEditProductModal({ ...editProductModal, description: e.target.value })}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none text-sm text-slate-700 font-medium"
                ></textarea>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setEditProductModal(null)} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Hủy</button>
                <button type="submit" disabled={savingEdit} className="px-6 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/20">
                  {savingEdit ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Variant Modal */}
      {editVariantModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <Edit2 className="w-4 h-4 text-blue-600" /> Sửa Biến Thể: <span className="text-blue-600">{editVariantModal.parentName}</span>
              </h3>
              <button onClick={() => setEditVariantModal(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg">✕</button>
            </div>
            
            <form onSubmit={handleSaveVariantEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Mã SKU / Mã vạch biến thể (Barcode)</label>
                <input 
                  type="text"
                  value={editVariantModal.sku || ''}
                  onChange={e => setEditVariantModal({ ...editVariantModal, sku: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-mono text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Giá bán (đ)</label>
                  <input 
                    type="number"
                    value={editVariantModal.price || 0}
                    onChange={e => setEditVariantModal({ ...editVariantModal, price: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Giá vốn (đ)</label>
                  <input 
                    type="number"
                    value={editVariantModal.cost_price || 0}
                    onChange={e => setEditVariantModal({ ...editVariantModal, cost_price: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Tồn kho</label>
                  <input 
                    type="number"
                    value={editVariantModal.stock || 0}
                    onChange={e => setEditVariantModal({ ...editVariantModal, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Hình ảnh riêng biến thể</label>
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                  <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                    {editVariantModal.image_url ? (
                      <img src={editVariantModal.image_url} alt="Variant" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors shadow-xs">
                        <Upload className="w-3.5 h-3.5" /> Chọn ảnh từ máy
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleImageFileUpload(e, (url) => setEditVariantModal({ ...editVariantModal, image_url: url }))} 
                        />
                      </label>
                      {editVariantModal.image_url && (
                        <button 
                          type="button" 
                          onClick={() => setEditVariantModal({ ...editVariantModal, image_url: '' })}
                          className="px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                    <input 
                      type="text"
                      value={editVariantModal.image_url || ''}
                      onChange={e => setEditVariantModal({ ...editVariantModal, image_url: e.target.value })}
                      placeholder="Hoặc dán link URL (https://...)"
                      className="w-full px-2.5 py-1 rounded-md border border-slate-200 text-[11px] text-slate-600 outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setEditVariantModal(null)} className="px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl text-xs">Hủy</button>
                <button type="submit" disabled={savingEdit} className="px-5 py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl text-xs shadow-md shadow-blue-600/20">
                  {savingEdit ? 'Đang lưu...' : 'Lưu Biến Thể'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Printing Modal */}
      {barcodeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <Printer className="w-5 h-5 text-emerald-600" /> In Tem Mã Vạch Sản Phẩm
              </h3>
              <button onClick={() => setBarcodeModal(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sản phẩm</label>
                <div className="font-bold text-slate-800 text-sm">{barcodeModal.item.name}</div>
                <div className="font-mono text-xs text-blue-600 font-semibold mt-0.5">SKU: {barcodeModal.item.sku}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Số lượng tem cần in</label>
                <input 
                  type="number" 
                  min="1"
                  max="100"
                  value={barcodeModal.quantity || 1}
                  onChange={e => setBarcodeModal({ ...barcodeModal, quantity: Number(e.target.value) })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-800 outline-none focus:border-emerald-500"
                />
              </div>

              {/* Printable Barcode Label Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Xem Trước Mẫu Tem (Label Preview)</label>
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-center">
                  <div className="w-[200px] p-3 bg-white border border-slate-300 rounded-xl shadow-xs flex flex-col items-center">
                    <div className="font-black text-[11px] text-slate-800 line-clamp-1 uppercase">{barcodeModal.item.name}</div>
                    <div className="font-extrabold text-blue-600 text-xs my-1">{formatPrice(barcodeModal.item.price)}</div>
                    
                    {/* Simulated SVG Barcode Graphic */}
                    <div className="w-full flex justify-center py-1">
                      <svg className="w-40 h-10" viewBox="0 0 160 40">
                        <rect x="5" y="0" width="3" height="30" fill="#000"/>
                        <rect x="11" y="0" width="1" height="30" fill="#000"/>
                        <rect x="14" y="0" width="4" height="30" fill="#000"/>
                        <rect x="21" y="0" width="2" height="30" fill="#000"/>
                        <rect x="26" y="0" width="5" height="30" fill="#000"/>
                        <rect x="34" y="0" width="1" height="30" fill="#000"/>
                        <rect x="38" y="0" width="3" height="30" fill="#000"/>
                        <rect x="44" y="0" width="2" height="30" fill="#000"/>
                        <rect x="49" y="0" width="4" height="30" fill="#000"/>
                        <rect x="56" y="0" width="2" height="30" fill="#000"/>
                        <rect x="61" y="0" width="6" height="30" fill="#000"/>
                        <rect x="70" y="0" width="2" height="30" fill="#000"/>
                        <rect x="75" y="0" width="3" height="30" fill="#000"/>
                        <rect x="81" y="0" width="1" height="30" fill="#000"/>
                        <rect x="85" y="0" width="4" height="30" fill="#000"/>
                        <rect x="92" y="0" width="2" height="30" fill="#000"/>
                        <rect x="97" y="0" width="5" height="30" fill="#000"/>
                        <rect x="105" y="0" width="1" height="30" fill="#000"/>
                        <rect x="109" y="0" width="3" height="30" fill="#000"/>
                        <rect x="115" y="0" width="2" height="30" fill="#000"/>
                        <rect x="120" y="0" width="4" height="30" fill="#000"/>
                        <rect x="127" y="0" width="2" height="30" fill="#000"/>
                        <rect x="132" y="0" width="6" height="30" fill="#000"/>
                        <rect x="141" y="0" width="2" height="30" fill="#000"/>
                        <rect x="146" y="0" width="4" height="30" fill="#000"/>
                        <rect x="153" y="0" width="2" height="30" fill="#000"/>
                      </svg>
                    </div>
                    <div className="font-mono text-[10px] text-slate-600 tracking-wider font-bold">{barcodeModal.item.sku}</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setBarcodeModal(null)} className="px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl text-xs">Hủy</button>
                <button 
                  type="button" 
                  onClick={() => window.print()} 
                  className="px-6 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs shadow-md shadow-emerald-600/20 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> In ngay ({barcodeModal.quantity} tem)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Price Edit Modal */}
      {showBulkPriceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <DollarSign className="w-5 h-5 text-blue-600" /> Đổi Giá Hàng Loạt ({selectedIds.length} Sản Phẩm)
              </h3>
              <button onClick={() => setShowBulkPriceModal(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Phương thức thay đổi giá</label>
                <select 
                  value={bulkPriceType}
                  onChange={e => setBulkPriceType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-700 outline-none"
                >
                  <option value="fixed_add">Tăng thêm số tiền (+ VNĐ)</option>
                  <option value="fixed_sub">Giảm bớt số tiền (- VNĐ)</option>
                  <option value="percent_add">Tăng theo phần trăm (+ %)</option>
                  <option value="percent_sub">Giảm theo phần trăm (- %)</option>
                  <option value="set_exact">Thiết lập giá cố định mới (= VNĐ)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Giá trị điều chỉnh</label>
                <input 
                  type="number" 
                  value={bulkPriceValue}
                  onChange={e => setBulkPriceValue(e.target.value)}
                  placeholder="Ví dụ: 10000 hoặc 10"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-blue-600 text-lg outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowBulkPriceModal(false)} className="px-5 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl text-xs">Hủy</button>
                <button 
                  type="button" 
                  onClick={handleBulkUpdatePrice}
                  disabled={updatingBulkPrice}
                  className="px-6 py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl text-xs shadow-md shadow-blue-600/20"
                >
                  {updatingBulkPrice ? 'Đang cập nhật...' : 'Cập Nhật Giá Hàng Loạt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sapo-style Variant Detail Modal */}
      {variantDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 lg:p-8">
          <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" /> Chi tiết phiên bản
              </h2>
              <button 
                onClick={() => setVariantDetailModal(null)} 
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-auto flex flex-col lg:flex-row gap-6">
              {/* Left Column: List of Variants */}
              <div className="w-full lg:w-1/3 bg-white rounded-2xl border border-slate-200 p-4 shrink-0 space-y-3">
                <div className="font-bold text-slate-700 text-sm pb-2 border-b border-slate-100 flex justify-between items-center">
                  <span>Phiên bản ({variantDetailModal.parent?.variants?.length || 0})</span>
                  <span className="text-xs text-slate-400 font-normal">Chọn để xem chi tiết</span>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
                  {variantDetailModal.parent?.variants?.map((v, idx) => {
                    const isSelected = idx === variantDetailModal.activeIdx;
                    const variantTitle = Object.values(v.attributes || {}).join(' - ') || 'Phiên bản mặc định';
                    return (
                      <div 
                        key={idx}
                        onClick={() => setVariantDetailModal({ ...variantDetailModal, activeIdx: idx })}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                          isSelected 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20' 
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border flex items-center justify-center ${isSelected ? 'bg-white/20 border-white/30' : 'bg-slate-50 border-slate-200'}`}>
                          {(v.image_url || variantDetailModal.parent.image_url) ? (
                            <img src={v.image_url || variantDetailModal.parent.image_url} alt="Variant" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className={`w-4 h-4 ${isSelected ? 'text-white/60' : 'text-slate-300'}`} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs truncate">{variantTitle}</div>
                          <div className={`text-[11px] mt-0.5 font-medium ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                            Tồn kho: <span className="font-bold">{v.stock || 0}</span> | Có thể bán: <span className="font-bold">{v.stock || 0}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Active Variant Details */}
              {(() => {
                const activeVar = variantDetailModal.parent?.variants?.[variantDetailModal.activeIdx] || {};
                const variantTitle = Object.values(activeVar.attributes || {}).join(' - ') || 'Mặc định';
                const fullTitle = `${variantDetailModal.parent?.name || ''} - ${variantTitle}`;
                const variantImg = activeVar.image_url || variantDetailModal.parent?.image_url;

                return (
                  <div className="flex-1 space-y-6">
                    {/* Card 1: Thông tin chi tiết phiên bản */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
                      <h3 className="font-bold text-slate-800 text-sm mb-4 border-b border-slate-100 pb-3">
                        Thông tin chi tiết phiên bản
                      </h3>

                      <div className="flex flex-col sm:flex-row justify-between gap-6">
                        <div className="flex-1 space-y-3.5 text-xs text-slate-600">
                          <div className="flex items-start">
                            <span className="w-36 font-semibold text-slate-500 shrink-0">Tên phiên bản sản phẩm</span>
                            <span className="font-bold text-slate-800 flex-1 leading-relaxed">: {fullTitle}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-36 font-semibold text-slate-500 shrink-0">Mã SKU</span>
                            <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">: {activeVar.sku || 'Chưa tạo SKU'}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-36 font-semibold text-slate-500 shrink-0">Mã barcode</span>
                            <span className="font-mono font-bold text-slate-700">: {activeVar.sku || '---'}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-36 font-semibold text-slate-500 shrink-0">Khối lượng</span>
                            <span className="font-medium text-slate-700">: 0g</span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-36 font-semibold text-slate-500 shrink-0">Đơn vị tính</span>
                            <span className="font-medium text-slate-700">: ---</span>
                          </div>
                          <div className="flex items-center">
                            <span className="w-36 font-semibold text-slate-500 shrink-0">Phiên bản</span>
                            <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">: {variantTitle}</span>
                          </div>
                        </div>

                        {/* Large Image on Right */}
                        <div className="w-32 h-32 rounded-2xl border-2 border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                          {variantImg ? (
                            <img src={variantImg} alt="Variant" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-slate-300" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Giá sản phẩm (Bảng báo giá đa kênh) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
                      <h3 className="font-bold text-slate-800 text-sm mb-4 border-b border-slate-100 pb-3">
                        Giá sản phẩm
                      </h3>

                      <div className="grid grid-cols-2 sm:grid-cols-2 gap-y-3 gap-x-6 text-xs text-slate-600">
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">Giá bán lẻ:</span>
                          <span className="font-black text-blue-600">{formatPrice(activeVar.price || 0)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">Giá Sỉ thường:</span>
                          <span className="font-bold text-slate-700">{formatPrice((activeVar.price || 0) * 0.9)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">Giá Live:</span>
                          <span className="font-bold text-slate-700">{formatPrice((activeVar.price || 0) * 0.95)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">SỈ VIP KHÔNG V...:</span>
                          <span className="font-bold text-slate-700">{formatPrice((activeVar.price || 0) * 0.85)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">Giá Lazada:</span>
                          <span className="font-bold text-slate-700">{formatPrice(activeVar.price || 0)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">Giá Shopee Cuối:</span>
                          <span className="font-bold text-slate-700">{formatPrice(activeVar.price || 0)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-500">Giá nhập (Giá vốn):</span>
                          <span className="font-bold text-amber-600">{formatPrice(activeVar.cost_price || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
