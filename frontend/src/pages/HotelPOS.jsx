import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BedDouble, CreditCard, Plus, RefreshCw, Trash2, User, X } from 'lucide-react';
import API_BASE from '../config/api';

export default function HotelPOS() {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: '', type: 'Phòng', capacity: 2, price: '' });
  const [checkInForm, setCheckInForm] = useState({ guest_name: '', guest_phone: '', nights: 1, rate: '' });

  const activeByRoom = useMemo(() => new Map(bookings.map((booking) => [Number(booking.room_id), booking])), [bookings]);
  const selectedBooking = selectedRoom ? activeByRoom.get(Number(selectedRoom.id)) : null;

  const loadData = async () => {
    setLoading(true);
    try {
      const [roomRes, bookingRes] = await Promise.all([
        axios.get(`${API_BASE}/api/rooms`),
        axios.get(`${API_BASE}/api/rooms/bookings/active`),
      ]);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : []);
      setBookings(Array.isArray(bookingRes.data) ? bookingRes.data : []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được dữ liệu khách sạn.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!selectedRoom) return;
    setCheckInForm((current) => ({ ...current, rate: String(selectedRoom.price ?? 0) }));
  }, [selectedRoom]);

  const createRoom = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await axios.post(`${API_BASE}/api/rooms`, {
        ...roomForm,
        capacity: Number(roomForm.capacity) || 1,
        price: Number(roomForm.price) || 0,
      });
      setRoomForm({ name: '', type: 'Phòng', capacity: 2, price: '' });
      setShowRoomForm(false);
      setMessage('Đã tạo phòng.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Không tạo được phòng.');
    } finally { setBusy(false); }
  };

  const deleteRoom = async (room) => {
    if (!window.confirm(`Xóa “${room.name}”?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/rooms/${room.id}`);
      if (selectedRoom?.id === room.id) setSelectedRoom(null);
      setMessage('Đã xóa phòng.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Không xóa được phòng.');
    }
  };

  const checkIn = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await axios.post(`${API_BASE}/api/rooms/${selectedRoom.id}/check-in`, {
        ...checkInForm,
        nights: Number(checkInForm.nights),
        rate: Number(checkInForm.rate),
      });
      setMessage(`Đã nhận ${selectedRoom.name}.`);
      setCheckInForm({ guest_name: '', guest_phone: '', nights: 1, rate: String(selectedRoom.price ?? 0) });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Không nhận phòng được.');
    } finally { setBusy(false); }
  };

  const checkOut = async (paymentMethod) => {
    if (!selectedRoom || !selectedBooking) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await axios.post(`${API_BASE}/api/rooms/${selectedRoom.id}/check-out`, { payment_method: paymentMethod });
      setMessage(`Trả phòng thành công. Mã đơn: ${response.data.order_code}`);
      setSelectedRoom(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Không trả phòng được.');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-slate-800"><BedDouble className="h-6 w-6 text-cyan-600" /> Khách sạn / Phòng</h1>
            <p className="mt-1 text-sm text-slate-500">Booking được lưu trên máy chủ; tải lại trang không làm mất trạng thái phòng.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"><RefreshCw className="h-4 w-4" /> Làm mới</button>
            <button onClick={() => setShowRoomForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-black text-white"><Plus className="h-4 w-4" /> Thêm phòng</button>
          </div>
        </header>

        {(error || message) && <div className={`m-4 rounded-xl border px-4 py-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <div className="py-16 text-center text-sm font-semibold text-slate-500">Đang tải phòng…</div> : rooms.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <BedDouble className="mx-auto h-12 w-12 text-slate-300" />
              <h2 className="mt-3 font-black text-slate-700">Chưa có phòng</h2>
              <p className="mt-1 text-sm text-slate-500">AutoTax không tạo phòng mẫu. Hãy thêm phòng và giá thực tế của cơ sở.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rooms.map((room) => {
                const booking = activeByRoom.get(Number(room.id));
                const selected = Number(selectedRoom?.id) === Number(room.id);
                return (
                  <article key={room.id} onClick={() => setSelectedRoom(room)} className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition ${selected ? 'border-cyan-500 ring-2 ring-cyan-100' : 'border-slate-200 hover:border-cyan-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><h3 className="truncate font-black text-slate-800">{room.name}</h3><p className="text-xs font-semibold text-slate-400">{room.type || 'Phòng'} · {room.capacity || 1} khách</p></div>
                      <button onClick={(e) => { e.stopPropagation(); deleteRoom(room); }} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-2">
                      <div><div className="text-xs font-bold uppercase text-slate-400">Giá/đêm</div><div className="font-black text-cyan-700">{new Intl.NumberFormat('vi-VN').format(Number(room.price || 0))} đ</div></div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${booking ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'}`}>{booking ? 'Đang ở' : 'Trống'}</span>
                    </div>
                    {booking && <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><b>{booking.guest_name}</b> · {booking.nights} đêm</div>}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="w-full shrink-0 overflow-y-auto bg-white p-4 lg:w-[390px] lg:p-5">
        {!selectedRoom ? (
          <div className="flex h-full min-h-52 flex-col items-center justify-center text-center text-slate-400"><User className="mb-3 h-10 w-10 text-slate-200" /><b className="text-slate-600">Chọn một phòng</b><span className="mt-1 text-sm">để nhận phòng hoặc thanh toán.</span></div>
        ) : selectedBooking ? (
          <div>
            <h2 className="text-xl font-black text-slate-800">{selectedRoom.name}</h2>
            <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Khách</span><b>{selectedBooking.guest_name}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Điện thoại</span><b>{selectedBooking.guest_phone || '—'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Số đêm</span><b>{selectedBooking.nights}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Giá/đêm</span><b>{new Intl.NumberFormat('vi-VN').format(Number(selectedBooking.rate || 0))} đ</b></div>
              <div className="border-t border-slate-200 pt-3 text-right text-xl font-black text-cyan-700">{new Intl.NumberFormat('vi-VN').format(Number(selectedBooking.rate || 0) * Number(selectedBooking.nights || 1))} đ</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => checkOut('cash')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><CreditCard className="h-4 w-4" /> Tiền mặt</button>
              <button disabled={busy} onClick={() => checkOut('bank')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><CreditCard className="h-4 w-4" /> Chuyển khoản</button>
            </div>
          </div>
        ) : (
          <form onSubmit={checkIn} className="space-y-4">
            <div><h2 className="text-xl font-black text-slate-800">Nhận {selectedRoom.name}</h2><p className="mt-1 text-sm text-slate-500">Thông tin này được lưu vào booking trên server.</p></div>
            <input required value={checkInForm.guest_name} onChange={(e) => setCheckInForm({ ...checkInForm, guest_name: e.target.value })} placeholder="Tên khách" className="w-full rounded-xl border border-slate-200 px-4 py-3" />
            <input value={checkInForm.guest_phone} onChange={(e) => setCheckInForm({ ...checkInForm, guest_phone: e.target.value })} placeholder="Số điện thoại" className="w-full rounded-xl border border-slate-200 px-4 py-3" />
            <div className="grid grid-cols-2 gap-3"><input required type="number" min="1" max="365" value={checkInForm.nights} onChange={(e) => setCheckInForm({ ...checkInForm, nights: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3" /><input required type="number" min="0" value={checkInForm.rate} onChange={(e) => setCheckInForm({ ...checkInForm, rate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3" /></div>
            <button disabled={busy} className="w-full rounded-xl bg-cyan-600 px-5 py-3 font-black text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Nhận phòng'}</button>
          </form>
        )}
      </aside>

      {showRoomForm && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowRoomForm(false)}><form onSubmit={createRoom} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Thêm phòng</h2><button type="button" onClick={() => setShowRoomForm(false)}><X className="h-5 w-5" /></button></div><input required value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} placeholder="Tên phòng" className="w-full rounded-xl border px-4 py-3" /><input type="number" min="1" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} placeholder="Sức chứa" className="w-full rounded-xl border px-4 py-3" /><input required type="number" min="0" value={roomForm.price} onChange={(e) => setRoomForm({ ...roomForm, price: e.target.value })} placeholder="Giá/đêm" className="w-full rounded-xl border px-4 py-3" /><button disabled={busy} className="w-full rounded-xl bg-slate-900 px-5 py-3 font-black text-white">Lưu phòng</button></form></div>}
    </div>
  );
}
