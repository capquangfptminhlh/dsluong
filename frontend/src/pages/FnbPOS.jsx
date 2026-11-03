import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config/api';
import { Utensils, BellRing, Plus, Trash2, Image, Edit3, ArrowRightLeft, X, Minus } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

export default function FnbPOS() {
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingImageTable, setEditingImageTable] = useState(null);
  const fileInputRef = useRef(null);

  const sessionByRoom = useMemo(() => Object.fromEntries(sessions.map((session) => [session.room_id, session])), [sessions]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [roomsRes, productsRes, sessionsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/rooms`),
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/fnb/sessions/active`),
      ]);
      setTables(roomsRes.data.filter((room) => ['Bàn', 'Phòng'].includes(room.type)));
      setMenu(productsRes.data);
      setSessions(sessionsRes.data);
      if (selectedTable) {
        const fresh = roomsRes.data.find((room) => room.id === selectedTable.id);
        if (fresh) setSelectedTable(fresh);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể tải dữ liệu F&B.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      axios.get(`${API_BASE}/api/rooms`),
      axios.get(`${API_BASE}/api/products`),
      axios.get(`${API_BASE}/api/fnb/sessions/active`),
    ]).then(([roomsRes, productsRes, sessionsRes]) => {
      if (!active) return;
      setTables(roomsRes.data.filter((room) => ['Bàn', 'Phòng'].includes(room.type)));
      setMenu(productsRes.data);
      setSessions(sessionsRes.data);
    }).catch((err) => {
      if (active) alert(err.response?.data?.error || 'Không thể tải dữ liệu F&B.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectTable = (table) => {
    setSelectedTable(table);
    const session = sessionByRoom[table.id];
    setCart((session?.items || []).map((item) => ({
      product_id: item.product_id,
      name: item.product_name,
      price: item.price,
      quantity: Number(item.quantity) || 1,
      note: item.note || '',
    })));
  };

  const addItem = (product) => {
    if (!selectedTable) return alert('Vui lòng chọn bàn trước.');
    setCart((current) => {
      const existing = current.find((item) => item.product_id === product.id);
      if (existing) return current.map((item) => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { product_id: product.id, name: product.name, price: Number(product.price) || 0, quantity: 1, note: '' }];
    });
  };

  const changeQuantity = (productId, delta) => {
    setCart((current) => current
      .map((item) => item.product_id === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  };

  const saveSession = async ({ kitchen = false } = {}) => {
    if (!selectedTable) return;
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/api/fnb/rooms/${selectedTable.id}/session`, {
        items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity, note: item.note })),
      });
      if (kitchen && cart.length) await axios.post(`${API_BASE}/api/fnb/rooms/${selectedTable.id}/kitchen`);
      await fetchData();
      if (kitchen) setSelectedTable(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể lưu order F&B.');
    } finally {
      setSaving(false);
    }
  };

  const checkout = async () => {
    if (!selectedTable || cart.length === 0) return;
    const session = sessionByRoom[selectedTable.id];
    if (!session) return alert('Hãy lưu order trước khi thanh toán.');
    setSaving(true);
    try {
      const result = await axios.post(`${API_BASE}/api/pos/checkout`, {
        fnb_session_id: session.id,
        cart: cart.map((item) => ({ id: item.product_id, quantity: item.quantity })),
        customer_name: 'Khách lẻ (F&B)',
        payment_method: 'cash',
      });
      await axios.post(`${API_BASE}/api/fnb/sessions/${session.id}/complete`, { order_code: result.data.order_code });
      alert(`Thanh toán thành công ${money(result.data.total_amount)} ₫`);
      setSelectedTable(null);
      setCart([]);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể thanh toán order F&B.');
    } finally {
      setSaving(false);
    }
  };

  const addTable = async () => {
    const name = prompt('Tên bàn/phòng mới:');
    if (!name?.trim()) return;
    try {
      await axios.post(`${API_BASE}/api/rooms`, { name: name.trim(), type: name.toLowerCase().includes('phòng') ? 'Phòng' : 'Bàn', capacity: 4 });
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể thêm bàn.'); }
  };

  const renameTable = async (table, event) => {
    event.stopPropagation();
    const name = prompt('Tên mới:', table.name);
    if (!name?.trim() || name.trim() === table.name) return;
    try {
      await axios.put(`${API_BASE}/api/rooms/${table.id}`, { ...table, name: name.trim() });
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể đổi tên bàn.'); }
  };

  const deleteTable = async (table, event) => {
    event.stopPropagation();
    if (!confirm(`Xóa "${table.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/rooms/${table.id}`);
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể xóa bàn.'); }
  };

  const transferTable = async (table, event) => {
    event.stopPropagation();
    const available = tables.filter((item) => item.id !== table.id && !sessionByRoom[item.id]);
    if (!available.length) return alert('Không có bàn trống để chuyển.');
    const targetName = prompt(`Chuyển sang bàn nào?\n${available.map((item) => item.name).join(', ')}`);
    if (!targetName?.trim()) return;
    const target = available.find((item) => item.name.toLowerCase() === targetName.trim().toLowerCase());
    if (!target) return alert('Không tìm thấy bàn đích.');
    try {
      await axios.post(`${API_BASE}/api/fnb/rooms/${table.id}/transfer`, { target_room_id: target.id });
      if (selectedTable?.id === table.id) setSelectedTable(target);
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể chuyển bàn.'); }
  };

  const chooseImage = (table, event) => {
    event.stopPropagation();
    setEditingImageTable(table);
    fileInputRef.current?.click();
  };

  const onImage = (event) => {
    const file = event.target.files?.[0];
    if (!file || !editingImageTable) return;
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        await axios.put(`${API_BASE}/api/rooms/${editingImageTable.id}`, { ...editingImageTable, image: loadEvent.target.result });
        await fetchData();
      } catch (err) { alert(err.response?.data?.error || 'Không thể cập nhật ảnh bàn.'); }
      finally { setEditingImageTable(null); event.target.value = ''; }
    };
    reader.readAsDataURL(file);
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-50 overflow-hidden">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onImage} />
      <section className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
          <div><h2 className="font-black text-slate-800 flex items-center gap-2"><Utensils className="w-5 h-5 text-orange-500" /> Sơ đồ Bàn / Phòng</h2><p className="text-xs text-slate-500 mt-1">Order được lưu trên server, không mất khi tải lại trang.</p></div>
          <button onClick={addTable} className="px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold flex gap-1.5 items-center"><Plus className="w-4 h-4" /> Thêm Bàn</button>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div> : tables.length === 0 ? <div className="py-16 text-center text-slate-500">Chưa có bàn. Bấm “Thêm Bàn” để bắt đầu.</div> :
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{tables.map((table) => {
              const session = sessionByRoom[table.id];
              return <div key={table.id} onClick={() => selectTable(table)} className={`relative min-h-28 p-3.5 rounded-xl border cursor-pointer overflow-hidden ${selectedTable?.id === table.id ? 'border-orange-500 ring-2 ring-orange-200 bg-white' : session ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                {table.image && <img src={table.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" />}
                <div className="relative flex justify-between gap-2"><div className="font-black text-slate-800 truncate">{table.name}</div><div className="flex shrink-0">
                  {session && <button onClick={(e) => transferTable(table, e)} className="p-1 text-orange-600" title="Chuyển bàn"><ArrowRightLeft className="w-3.5 h-3.5" /></button>}
                  <button onClick={(e) => renameTable(table, e)} className="p-1 text-slate-400" title="Đổi tên"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => chooseImage(table, e)} className="p-1 text-slate-400" title="Ảnh"><Image className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => deleteTable(table, e)} className="p-1 text-slate-400 hover:text-red-600" title="Xóa"><Trash2 className="w-3.5 h-3.5" /></button>
                </div></div>
                {session && <div className="relative mt-6 flex justify-between items-end"><span className="text-[10px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-700">{session.sent_to_kitchen ? 'Đã báo bếp' : 'Đang order'}</span><span className="font-black text-orange-700">{money(session.total_amount)}đ</span></div>}
              </div>;
            })}</div>}
        </div>
      </section>

      <aside className="w-full lg:w-[440px] bg-white flex flex-col max-h-[48vh] lg:max-h-none lg:h-full">
        {!selectedTable ? <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">Chọn một bàn để gọi món.</div> : <>
          <div className="p-4 border-b bg-slate-50 flex justify-between"><div><div className="font-black text-orange-700">{selectedTable.name}</div><div className="text-xs text-slate-500">{sessionByRoom[selectedTable.id] ? 'Đang có order' : 'Bàn trống'}</div></div><button onClick={() => setSelectedTable(null)}><X className="w-5 h-5 text-slate-400" /></button></div>
          <div className="p-3 border-b overflow-x-auto"><div className="flex gap-2">{menu.slice(0, 40).map((product) => <button key={product.id} onClick={() => addItem(product)} className="min-w-32 text-left p-2.5 border rounded-xl hover:border-orange-400"><div className="text-xs font-bold line-clamp-2">{product.name}</div><div className="text-xs text-orange-600 font-black mt-1">{money(product.price)}đ</div></button>)}</div></div>
          <div className="flex-1 overflow-auto p-3 space-y-2">{cart.length === 0 ? <div className="py-8 text-center text-slate-400 text-sm">Chưa có món</div> : cart.map((item) => <div key={item.product_id} className="border rounded-xl p-3"><div className="flex justify-between gap-2"><div className="font-bold text-sm">{item.name}</div><div className="font-black text-sm">{money(item.price * item.quantity)}đ</div></div><div className="flex gap-2 items-center mt-2"><button onClick={() => changeQuantity(item.product_id, -1)} className="p-1.5 border rounded"><Minus className="w-3 h-3" /></button><span className="font-bold">{item.quantity}</span><button onClick={() => changeQuantity(item.product_id, 1)} className="p-1.5 border rounded"><Plus className="w-3 h-3" /></button><input value={item.note} onChange={(e) => setCart((current) => current.map((row) => row.product_id === item.product_id ? { ...row, note: e.target.value } : row))} placeholder="Ghi chú bếp..." className="flex-1 min-w-0 px-2 py-1.5 border rounded text-xs" /></div></div>)}</div>
          <div className="p-4 border-t"><div className="flex justify-between mb-3"><span className="font-bold text-slate-500">Tổng</span><span className="text-xl font-black">{money(total)} ₫</span></div><div className="grid grid-cols-3 gap-2"><button disabled={saving} onClick={() => saveSession()} className="py-2.5 bg-slate-100 rounded-xl font-bold text-xs">Lưu order</button><button disabled={saving || !cart.length} onClick={() => saveSession({ kitchen: true })} className="py-2.5 bg-orange-100 text-orange-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1"><BellRing className="w-4 h-4" /> Báo bếp</button><button disabled={saving || !cart.length} onClick={checkout} className="py-2.5 bg-orange-600 text-white rounded-xl font-bold text-xs">Thanh toán</button></div></div>
        </>}
      </aside>
    </div>
  );
}