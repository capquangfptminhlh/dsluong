import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config/api';
import { Image, Plus, Sparkles, Trash2, Users } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

export default function SpaPOS() {
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [products, setProducts] = useState([]);
  const [sessions, setSessions] = useState({});
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const [editingImageRoom, setEditingImageRoom] = useState(null);

  const services = useMemo(() => products.filter((p) => {
    const category = String(p.category || '').toLowerCase();
    return category.includes('dịch vụ') || category.includes('spa');
  }), [products]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, staffRes, productsRes, sessionsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/rooms`),
        axios.get(`${API_BASE}/api/staff`),
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/rooms/spa-sessions/active`),
      ]);
      setRooms(roomsRes.data);
      setStaff(staffRes.data);
      setProducts(productsRes.data);
      const byRoom = {};
      sessionsRes.data.forEach((session) => { byRoom[session.room_id] = session; });
      setSessions(byRoom);
    } catch (err) {
      alert(err.response?.data?.error || 'Không tải được dữ liệu Spa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectRoom = (room) => {
    setSelectedRoom(room);
    const current = sessions[room.id];
    setCart((current?.items || []).map((item) => ({
      id: item.id,
      service: { id: item.service_id, name: item.service_name, price: item.price },
      technician: item.staff_id ? { id: item.staff_id, name: item.staff_name } : null,
    })));
  };

  const addRoom = async () => {
    const name = window.prompt('Nhập tên giường hoặc phòng mới:');
    if (!name?.trim()) return;
    try {
      await axios.post(`${API_BASE}/api/rooms`, { name: name.trim(), type: 'Giường', capacity: 1 });
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể thêm giường/phòng.'); }
  };

  const deleteRoom = async (room, event) => {
    event.stopPropagation();
    if (!window.confirm(`Xóa "${room.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/rooms/${room.id}`);
      if (selectedRoom?.id === room.id) { setSelectedRoom(null); setCart([]); }
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể xóa giường/phòng.'); }
  };

  const chooseImage = (room, event) => {
    event.stopPropagation();
    setEditingImageRoom(room);
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file || !editingImageRoom) return;
    const reader = new FileReader();
    reader.onload = async (loaded) => {
      try {
        await axios.put(`${API_BASE}/api/rooms/${editingImageRoom.id}`, { ...editingImageRoom, image: loaded.target.result });
        await fetchData();
      } catch (err) { alert(err.response?.data?.error || 'Không thể lưu ảnh phòng.'); }
      finally { setEditingImageRoom(null); event.target.value = ''; }
    };
    reader.readAsDataURL(file);
  };

  const addService = (service) => {
    if (!selectedRoom) return;
    setCart((prev) => [...prev, { id: `new-${Date.now()}-${prev.length}`, service, technician: null }]);
  };

  const saveSession = async () => {
    if (!selectedRoom) return;
    try {
      await axios.put(`${API_BASE}/api/rooms/${selectedRoom.id}/spa-session`, {
        items: cart.map((item) => ({ service_id: item.service.id, staff_id: item.technician?.id || null })),
      });
      await fetchData();
      setSelectedRoom(null);
      setCart([]);
    } catch (err) { alert(err.response?.data?.error || 'Không thể lưu phiên phục vụ.'); }
  };

  const checkout = async (payment_method) => {
    if (!selectedRoom || cart.length === 0) return;
    try {
      const res = await axios.post(`${API_BASE}/api/rooms/${selectedRoom.id}/spa-checkout`, { payment_method });
      alert(`Thanh toán thành công ${money(res.data.total_amount)} đ`);
      setSelectedRoom(null);
      setCart([]);
      await fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Không thể thanh toán phiên Spa.'); }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row bg-slate-50 overflow-hidden">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <section className="flex-1 min-w-0 flex flex-col border-r border-slate-200">
        <header className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-rose-500" /> Sơ đồ Giường Spa</h2>
            <p className="text-xs text-slate-500 mt-1">Phiên phục vụ được lưu trên máy chủ, tải lại trang không mất dữ liệu.</p>
          </div>
          <button onClick={addRoom} className="px-3 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold flex items-center gap-1"><Plus className="w-4 h-4" /> Thêm giường</button>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {loading ? <div className="text-slate-400 py-16 text-center">Đang tải...</div> : rooms.length === 0 ? (
            <div className="text-center py-16 text-slate-400">Chưa có giường/phòng. Hãy tạo giường đầu tiên.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {rooms.map((room) => {
                const session = sessions[room.id];
                const active = !!session;
                return (
                  <button key={room.id} onClick={() => selectRoom(room)} className={`relative text-left h-36 p-4 rounded-2xl border-2 overflow-hidden bg-white ${selectedRoom?.id === room.id ? 'border-rose-500 ring-2 ring-rose-100' : active ? 'border-rose-200' : 'border-slate-100'}`}>
                    {room.image && <img src={room.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10" />}
                    <div className="relative z-10 flex justify-between gap-2">
                      <div className="font-black text-slate-800 truncate">{room.name}</div>
                      <div className="flex gap-1">
                        <span onClick={(e) => chooseImage(room, e)} className="p-1.5 rounded hover:bg-slate-100"><Image className="w-4 h-4 text-slate-400" /></span>
                        <span onClick={(e) => deleteRoom(room, e)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-4 h-4 text-slate-400" /></span>
                      </div>
                    </div>
                    <div className="relative z-10 mt-6 text-xs font-bold">
                      {active ? <><div className="text-rose-600">Đang phục vụ · {session.items.length} dịch vụ</div><div className="text-lg text-slate-800 mt-1">{money(session.total_amount)} đ</div></> : <span className="text-emerald-600">Đang trống</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="w-full lg:w-[440px] bg-white flex flex-col max-h-[55vh] lg:max-h-none">
        {!selectedRoom ? <div className="flex-1 grid place-items-center p-8 text-center text-slate-400"><div><Sparkles className="w-14 h-14 mx-auto mb-3 text-slate-200" /><b className="text-slate-600">Chọn một giường/phòng</b><p className="text-sm mt-1">Để thêm dịch vụ, gán KTV hoặc thanh toán.</p></div></div> : <>
          <div className="p-4 border-b bg-slate-50 flex justify-between"><div><b className="text-slate-800">{selectedRoom.name}</b><div className="text-xs text-slate-500">{sessions[selectedRoom.id] ? 'Đang phục vụ' : 'Phiên mới'}</div></div><button onClick={() => { setSelectedRoom(null); setCart([]); }} className="text-sm text-slate-500">Đóng</button></div>
          <div className="flex-1 overflow-auto p-4 space-y-5">
            <div><div className="text-xs font-black uppercase text-slate-400 mb-2">Dịch vụ</div>{services.length === 0 ? <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-xl">Chưa có sản phẩm thuộc danh mục “Dịch vụ” hoặc “Spa”.</div> : <div className="grid grid-cols-2 gap-2">{services.map((service) => <button key={service.id} onClick={() => addService(service)} className="p-3 text-left rounded-xl border hover:border-rose-400"><div className="font-bold text-sm truncate">{service.name}</div><div className="text-xs text-rose-600 font-bold mt-1">{money(service.price)} đ</div></button>)}</div>}</div>
            <div><div className="text-xs font-black uppercase text-slate-400 mb-2">Liệu trình hiện tại</div>{cart.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">Chưa có dịch vụ.</div> : <div className="space-y-2">{cart.map((item) => <div key={item.id} className="p-3 rounded-xl bg-slate-50 border relative"><button onClick={() => setCart((prev) => prev.filter((x) => x.id !== item.id))} className="absolute right-2 top-2 text-red-500">×</button><div className="font-bold text-sm pr-6">{item.service.name}</div><div className="text-xs font-bold text-slate-600 mt-1">{money(item.service.price)} đ</div><div className="flex items-center gap-2 mt-2"><Users className="w-4 h-4 text-slate-400" /><select value={item.technician?.id || ''} onChange={(e) => { const tech = staff.find((s) => s.id === Number(e.target.value)) || null; setCart((prev) => prev.map((x) => x.id === item.id ? { ...x, technician: tech } : x)); }} className="flex-1 border rounded-lg px-2 py-1.5 text-xs"><option value="">-- Chọn KTV --</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>)}</div>}</div>
          </div>
          <div className="p-4 border-t space-y-2"><div className="flex justify-between font-black text-lg"><span>Tổng</span><span>{money(cart.reduce((sum, item) => sum + Number(item.service.price || 0), 0))} đ</span></div><button onClick={saveSession} className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold">Lưu vào giường</button><div className="grid grid-cols-2 gap-2"><button disabled={!sessions[selectedRoom.id]} onClick={() => checkout('cash')} className="py-2.5 rounded-xl bg-emerald-600 disabled:bg-slate-200 text-white font-bold">Tiền mặt</button><button disabled={!sessions[selectedRoom.id]} onClick={() => checkout('bank')} className="py-2.5 rounded-xl bg-blue-600 disabled:bg-slate-200 text-white font-bold">Chuyển khoản</button></div></div>
        </>}
      </aside>
    </div>
  );
}
