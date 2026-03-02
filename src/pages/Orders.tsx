import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Order, OrderStatus, Receipt, ReceiptItem, StaffProfile } from '../types';
import { formatDate } from '../lib/utils';
import { notifyUser } from '../lib/pushNotifications';
import QRScanner from '../components/QRScanner';
import OrderReceipt from '../components/OrderReceipt';

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  cleaning:  'bg-purple-100 text-purple-800',
  ready:     'bg-teal-100 text-teal-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const STATUS_TABS: (OrderStatus | 'all')[] = ['all', 'pending', 'confirmed', 'picked_up', 'cleaning', 'ready', 'delivered', 'cancelled'];

const SERVICE_LABEL: Record<string, string> = {
  wash: 'Wash', iron: 'Iron', wash_iron: 'Wash+Iron',
};

interface CatalogItem { id: string; name_ar: string; name_en: string; wash_price: number; iron_price: number; wash_iron_price: number; express_wash_price: number; express_iron_price: number; express_wash_iron_price: number; }
interface UnsortedItem { item_id: string; name_ar: string; name_en: string; quantity: number; unit_price: number; service_type: string; speed: 'normal' | 'express'; }

function priceForService(cat: CatalogItem, svc: string, speed: string = 'normal'): number {
  if (speed === 'express') {
    if (svc === 'iron') return +cat.express_iron_price;
    if (svc === 'wash_iron') return +cat.express_wash_iron_price;
    return +cat.express_wash_price;
  }
  if (svc === 'iron') return +cat.iron_price;
  if (svc === 'wash_iron') return +cat.wash_iron_price;
  return +cat.wash_price;
}

export default function Orders() {
  const { profile: adminProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // Unsorted receipt entry state
  const [showUnsortedForm, setShowUnsortedForm] = useState(false);
  const [unsortedItems, setUnsortedItems] = useState<UnsortedItem[]>([]);
  const [unsortedNotes, setUnsortedNotes] = useState('');
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  // Assignment dropdown state
  const [pickupDeliveryId, setPickupDeliveryId] = useState('');
  const [cleanerId, setCleanerId] = useState('');
  const [finalDeliveryId, setFinalDeliveryId] = useState('');

  useEffect(() => {
    loadOrders();
    loadStaff();
    loadCatalogItems();
  }, []);

  async function loadOrders() {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        profiles!user_id(id, phone, full_name, referral_code),
        address:addresses(full_address, house_number, city, district),
        items:order_items(*, item_name_ar, item_name_en, quantity, unit_price, subtotal, service_type),
        receipt:receipts(*)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    setOrders((data ?? []) as Order[]);
    setLoading(false);
  }

  async function loadCatalogItems() {
    const { data } = await supabase
      .from('items')
      .select('id, name_ar, name_en, wash_price, iron_price, wash_iron_price, express_wash_price, express_iron_price, express_wash_iron_price')
      .eq('is_active', true)
      .order('name_ar');
    setCatalogItems((data ?? []) as CatalogItem[]);
  }

  async function loadStaff() {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, role, profiles!user_id(id, full_name, phone)')
      .in('role', ['delivery_man', 'cleaner']);
    if (!data) return;
    const map = new Map<string, StaffProfile>();
    for (const row of data) {
      const p = (row as any).profiles;
      if (!p) continue;
      const existing = map.get(p.id);
      if (existing) {
        existing.roles.push(row.role as any);
      } else {
        map.set(p.id, { id: p.id, full_name: p.full_name, phone: p.phone, roles: [row.role as any] });
      }
    }
    setStaffList(Array.from(map.values()));
  }

  function selectOrder(order: Order) {
    setSelectedOrder(order);
    setReceipt((order as any).receipt ?? null);
    setPickupDeliveryId('');
    setCleanerId('');
    setFinalDeliveryId('');
    setShowUnsortedForm(false);
    setUnsortedItems([]);
    setUnsortedNotes('');
  }

  // ── Status transitions ──────────────────────────────────────────

  async function confirmOrder() {
    if (!selectedOrder) return;
    setBusy(true);
    const now = new Date().toISOString();
    await supabase.from('orders').update({
      status: 'confirmed',
      confirmed_by: adminProfile?.id,
      updated_at: now,
    }).eq('id', selectedOrder.id);

    // Auto-generate receipt for sorted orders
    if (selectedOrder.type === 'sorted') {
      const items = (selectedOrder as any).items ?? [];
      const snapshot: ReceiptItem[] = items.map((i: any) => ({
        name_ar: i.item_name_ar,
        name_en: i.item_name_en,
        quantity: i.quantity,
        unit_price: i.unit_price,
        service_type: i.service_type,
        subtotal: i.subtotal,
      }));
      const subtotal = snapshot.reduce((s, i) => s + i.subtotal, 0);
      const express_fee = selectedOrder.speed === 'express' ? +(subtotal * 0.3).toFixed(2) : 0;
      const total = +(subtotal + express_fee).toFixed(2);
      const { data: rec } = await supabase.from('receipts').insert({
        order_id: selectedOrder.id,
        items_snapshot: snapshot,
        subtotal,
        express_fee,
        total,
        issued_by: adminProfile?.id,
      }).select().single();
      setReceipt(rec as Receipt);
    }

    await notifyUser(
      (selectedOrder.profiles as any)?.id ?? '',
      'تم تأكيد طلبك',
      `طلب #TOLL-${String(selectedOrder.order_number).padStart(4, '0')} تم تأكيده`,
      selectedOrder.id
    );
    refreshSelected({ status: 'confirmed', confirmed_by: adminProfile?.id });
    setBusy(false);
  }

  async function assignDelivery() {
    if (!selectedOrder || !pickupDeliveryId) return;
    setBusy(true);
    await supabase.from('orders').update({
      assigned_delivery_id: pickupDeliveryId,
      delivery_assigned_by: adminProfile?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedOrder.id);

    const staffMember = staffList.find(s => s.id === pickupDeliveryId);
    await notifyUser(
      (selectedOrder.profiles as any)?.id ?? '',
      'مندوب في الطريق',
      'مندوبنا في طريقه لاستلام ملابسك',
      selectedOrder.id
    );
    refreshSelected({ assigned_delivery_id: pickupDeliveryId });
    setPickupDeliveryId('');
    setBusy(false);
  }

  // For unsorted orders: show item entry form
  // For sorted orders: mark picked_up directly (delivery man scans via their own PWA view)
  function openPickedUpFlow() {
    if (!selectedOrder) return;
    if (selectedOrder.type === 'unsorted') {
      setShowUnsortedForm(true);
    }
  }

  async function submitUnsortedReceipt() {
    if (!selectedOrder || unsortedItems.length === 0) return;
    setBusy(true);
    const snapshot: ReceiptItem[] = unsortedItems.map(i => ({
      name_ar: i.name_ar,
      name_en: i.name_en,
      quantity: i.quantity,
      unit_price: i.unit_price,
      service_type: i.service_type as ReceiptItem['service_type'],
      subtotal: +(i.quantity * i.unit_price).toFixed(2),
      speed: i.speed,
    }));
    // Express fee applies only to express-speed items
    const subtotal = +snapshot.reduce((s, i) => s + i.subtotal, 0).toFixed(2);
    const expressBase = +snapshot.filter(i => i.speed === 'express').reduce((s, i) => s + i.subtotal, 0).toFixed(2);
    const express_fee = +(expressBase * 0.3).toFixed(2);
    const total = +(subtotal + express_fee).toFixed(2);

    const { data: rec } = await supabase.from('receipts').insert({
      order_id: selectedOrder.id,
      items_snapshot: snapshot,
      subtotal,
      express_fee,
      total,
      notes: unsortedNotes || null,
      issued_by: adminProfile?.id,
    }).select().single();

    // Status is already 'picked_up' — driver already set it when scanning customer QR.
    // Just create the receipt; do not change status or send a duplicate notification.

    setReceipt(rec as Receipt);
    setShowUnsortedForm(false);
    setUnsortedItems([]);
    setUnsortedNotes('');
    refreshSelected({});
    setBusy(false);
  }

  async function assignCleaner() {
    if (!selectedOrder || !cleanerId) return;
    setBusy(true);
    await supabase.from('orders').update({
      assigned_cleaner_id: cleanerId,
      cleaner_assigned_by: adminProfile?.id,
      status: 'cleaning',
      updated_at: new Date().toISOString(),
    }).eq('id', selectedOrder.id);

    await notifyUser(
      (selectedOrder.profiles as any)?.id ?? '',
      'جاري التنظيف',
      'ملابسك قيد التنظيف الآن',
      selectedOrder.id
    );
    refreshSelected({ assigned_cleaner_id: cleanerId, status: 'cleaning' });
    setCleanerId('');
    setBusy(false);
  }

  // Admin scans the TOLL-XXXX QR on the bag to mark ready
  async function handleReadyScan(scanned: string) {
    setShowQRScanner(false);
    if (!selectedOrder) return;
    const expected = `TOLL-${String(selectedOrder.order_number).padStart(4, '0')}`;
    if (scanned.trim().toUpperCase() !== expected) {
      alert(`QR mismatch. Expected ${expected}, got ${scanned}`);
      return;
    }
    setBusy(true);
    await supabase.from('orders').update({
      status: 'ready',
      ready_confirmed_by: adminProfile?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedOrder.id);

    await notifyUser(
      (selectedOrder.profiles as any)?.id ?? '',
      'طلبك جاهز',
      `طلبك #${expected} جاهز وفي طريقه إليك`,
      selectedOrder.id
    );
    refreshSelected({ status: 'ready', ready_confirmed_by: adminProfile?.id });
    setBusy(false);
  }

  async function assignFinalDelivery() {
    if (!selectedOrder || !finalDeliveryId) return;
    if (!receipt?.is_paid) {
      alert('Cannot assign delivery — order has not been paid yet. Mark as paid first.');
      return;
    }
    setBusy(true);
    await supabase.from('orders').update({
      final_delivery_id: finalDeliveryId,
      final_delivery_assigned_by: adminProfile?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedOrder.id);

    await notifyUser(
      (selectedOrder.profiles as any)?.id ?? '',
      'في الطريق إليك',
      'مندوبنا في طريقه لتوصيل ملابسك',
      selectedOrder.id
    );
    refreshSelected({ final_delivery_id: finalDeliveryId });
    setFinalDeliveryId('');
    setBusy(false);
  }

  async function markPaid() {
    if (!selectedOrder || !receipt) return;
    setBusy(true);
    const now = new Date().toISOString();
    await supabase.from('receipts').update({ is_paid: true, paid_at: now }).eq('id', receipt.id);
    await supabase.from('orders').update({ is_paid: true, updated_at: now }).eq('id', selectedOrder.id);
    setReceipt(prev => prev ? { ...prev, is_paid: true, paid_at: now } : prev);
    refreshSelected({ is_paid: true });
    setBusy(false);
  }

  async function cancelOrder() {
    if (!selectedOrder) return;
    if (!confirm('Cancel this order?')) return;
    setBusy(true);
    await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', selectedOrder.id);
    refreshSelected({ status: 'cancelled' });
    setBusy(false);
  }

  function refreshSelected(patch: Partial<Order>) {
    setSelectedOrder(prev => prev ? { ...prev, ...patch } : prev);
    setOrders(prev => prev.map(o => o.id === selectedOrder?.id ? { ...o, ...patch } : o));
  }

  // ── Unsorted item form helpers ──────────────────────────────────

  function addUnsortedItem() {
    setUnsortedItems(prev => [...prev, { item_id: '', name_ar: '', name_en: '', quantity: 1, unit_price: 0, service_type: 'wash', speed: selectedOrder?.speed ?? 'normal' }]);
  }

  function updateUnsortedItem(idx: number, field: keyof UnsortedItem, value: string | number) {
    setUnsortedItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeUnsortedItem(idx: number) {
    setUnsortedItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Derived data ────────────────────────────────────────────────

  const filtered = orders.filter(o => {
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    const profile = (o.profiles as any);
    const phone = profile?.phone ?? '';
    const name = profile?.full_name ?? '';
    const trackNum = `TOLL-${String(o.order_number).padStart(4, '0')}`;
    const matchSearch = !search
      || phone.includes(search)
      || name.toLowerCase().includes(search.toLowerCase())
      || trackNum.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const deliveryStaff = staffList.filter(s => s.roles.includes('delivery_man'));
  const cleanerStaff = staffList.filter(s => s.roles.includes('cleaner'));

  const o = selectedOrder;
  const profile = o ? (o.profiles as any) : null;
  const trackingNum = o ? `TOLL-${String(o.order_number).padStart(4, '0')}` : '';

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Order List ── */}
      <div className={`flex flex-col border-r border-gray-100 bg-white ${selectedOrder ? 'hidden md:flex md:w-[420px] lg:w-[480px]' : 'flex-1'}`}>
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">Orders</h1>
            <button onClick={loadOrders} className="text-gray-400 hover:text-primary text-sm font-medium">
              🔄 Refresh
            </button>
          </div>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            placeholder="Search by phone, name or #TOLL..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b border-gray-100 flex-shrink-0">
          {STATUS_TABS.map(s => {
            const count = s === 'all' ? orders.length : orders.filter(o => o.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === s
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')} ({count})
              </button>
            );
          })}
        </div>

        {/* Order rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-12">No orders</p>
          ) : filtered.map(order => {
            const p = (order.profiles as any);
            const tNum = `#TOLL-${String(order.order_number).padStart(4, '0')}`;
            const isSelected = selectedOrder?.id === order.id;
            return (
              <button
                key={order.id}
                onClick={() => selectOrder(order)}
                className={`w-full text-left px-5 py-3.5 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-primary/5 border-r-2 border-primary' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-sm text-gray-900">{tNum}</span>
                      {order.speed === 'express' && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5 font-semibold">⚡</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{p?.full_name || p?.phone || '—'}</div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[order.status]}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400">{order.total} SAR</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-1">{formatDate(order.created_at)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Detail Panel ── */}
      {selectedOrder ? (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-2xl mx-auto p-5 space-y-4">
            {/* Back on mobile */}
            <button
              className="md:hidden text-sm text-primary font-semibold flex items-center gap-1 mb-1"
              onClick={() => setSelectedOrder(null)}
            >
              ← Back
            </button>

            {/* Order header */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">#{trackingNum}</h2>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLORS[o!.status]}`}>
                      {o!.status.replace('_', ' ')}
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      o!.type === 'unsorted' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
                    }`}>
                      {o!.type === 'unsorted' ? '🧺 Without Sorting' : '👕 Sorted'}
                    </span>
                    {o!.speed === 'express' && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-orange-100 text-orange-700">
                        ⚡ Express
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xl font-bold text-primary">{o!.total} SAR</div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatDate(o!.created_at)}</div>
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Customer</h3>
              <div className="font-semibold text-gray-900">{profile?.full_name ?? '—'}</div>
              <div className="text-sm text-gray-500">{profile?.phone ?? '—'}</div>
              {(o as any).address && (
                <div className="text-sm text-gray-500 mt-1">
                  {(o as any).address.full_address ?? (o as any).address.house_number}, {(o as any).address.district}, {(o as any).address.city}
                </div>
              )}
              {o!.notes && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-800">
                  <span className="font-semibold">📝 ملاحظات: </span>{o!.notes}
                </div>
              )}
            </div>

            {/* Items (sorted only) */}
            {o!.type === 'sorted' && (o as any).items && (o as any).items.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Items</h3>
                <div className="space-y-2">
                  {(o as any).items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <div>
                        <span className="text-gray-800">{item.item_name_ar}</span>
                        <span className="text-gray-400 text-xs ml-2">
                          × {item.quantity} · {SERVICE_LABEL[item.service_type] ?? item.service_type}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">{item.subtotal} SAR</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Actions Panel ── */}
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Actions</h3>

              {/* 1. Confirm (pending → confirmed) */}
              {o!.status === 'pending' && (
                <button
                  onClick={confirmOrder}
                  disabled={busy}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  ✅ Confirm Order
                </button>
              )}

              {/* 2. Assign pickup delivery man (confirmed, no assigned_delivery_id yet) */}
              {o!.status === 'confirmed' && !(o as any).assigned_delivery_id && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600">Assign Pickup Delivery Man</label>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      value={pickupDeliveryId}
                      onChange={e => setPickupDeliveryId(e.target.value)}
                    >
                      <option value="">Select staff...</option>
                      {deliveryStaff.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name || s.phone}</option>
                      ))}
                    </select>
                    <button
                      onClick={assignDelivery}
                      disabled={busy || !pickupDeliveryId}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}

              {/* Show assigned delivery man — waiting for driver to scan */}
              {(o as any).assigned_delivery_id && o!.status === 'confirmed' && (
                <div className="bg-blue-50 rounded-xl px-4 py-2.5 text-sm text-blue-700">
                  🚗 Pickup assigned to: <strong>{staffList.find(s => s.id === (o as any).assigned_delivery_id)?.full_name ?? 'Staff'}</strong>
                  <div className="text-xs text-blue-400 mt-0.5">⏳ Waiting for delivery man to scan customer QR...</div>
                </div>
              )}

              {/* 3. Driver has picked up — admin now sorts clothes and creates receipt */}
              {o!.status === 'picked_up' && o!.type === 'unsorted' && !receipt && (
                <div className="space-y-2">
                  <div className="bg-indigo-50 rounded-xl px-4 py-2.5 text-sm text-indigo-700">
                    📦 Clothes received at store — sort and create receipt before assigning cleaner.
                  </div>
                  <button
                    onClick={() => setShowUnsortedForm(true)}
                    disabled={busy}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    📋 فرز الملابس وإنشاء الفاتورة
                  </button>
                </div>
              )}

              {/* 4. Assign cleaner — only after receipt exists */}
              {o!.status === 'picked_up' && !(o as any).assigned_cleaner_id && receipt && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600">Assign Cleaner</label>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      value={cleanerId}
                      onChange={e => setCleanerId(e.target.value)}
                    >
                      <option value="">Select cleaner...</option>
                      {cleanerStaff.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name || s.phone}</option>
                      ))}
                    </select>
                    <button
                      onClick={assignCleaner}
                      disabled={busy || !cleanerId}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}

              {/* 5. Scan bag QR to mark ready (cleaning) */}
              {o!.status === 'cleaning' && (
                <button
                  onClick={() => setShowQRScanner(true)}
                  disabled={busy}
                  className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  📷 Scan Bag QR → Mark Ready
                </button>
              )}

              {/* 6. Mark as paid */}
              {receipt && !receipt.is_paid && (
                <button
                  onClick={markPaid}
                  disabled={busy}
                  className="w-full py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  💰 Mark as Paid
                </button>
              )}

              {/* 7. Assign final delivery (ready + paid) */}
              {o!.status === 'ready' && !(o as any).final_delivery_id && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-600 flex-1">Assign Final Delivery</label>
                    {!receipt?.is_paid && (
                      <span className="text-xs text-red-500 font-semibold">⚠️ Must be paid first</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                      value={finalDeliveryId}
                      onChange={e => setFinalDeliveryId(e.target.value)}
                      disabled={!receipt?.is_paid}
                    >
                      <option value="">Select staff...</option>
                      {deliveryStaff.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name || s.phone}</option>
                      ))}
                    </select>
                    <button
                      onClick={assignFinalDelivery}
                      disabled={busy || !finalDeliveryId || !receipt?.is_paid}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel */}
              {o!.status !== 'cancelled' && o!.status !== 'delivered' && (
                <button
                  onClick={cancelOrder}
                  disabled={busy}
                  className="w-full py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-semibold transition-colors"
                >
                  Cancel Order
                </button>
              )}
            </div>

            {/* Receipt */}
            {receipt && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Receipt</h3>
                  <div className="flex items-center gap-2">
                    {receipt.is_paid ? (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-1 font-semibold">✅ Paid</span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2.5 py-1 font-semibold">⏳ Unpaid</span>
                    )}
                    <button
                      onClick={() => setShowReceiptModal(true)}
                      className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                    >
                      🖨️ View & Print
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  {receipt.items_snapshot?.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-600">
                        {item.speed === 'express' && <span className="text-orange-500 mr-1">⚡</span>}
                        {item.name_ar} × {item.quantity}
                      </span>
                      <span className="text-gray-800">{item.subtotal.toFixed(2)} SAR</span>
                    </div>
                  ))}
                  {receipt.express_fee > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>رسوم المستعجل (30%)</span>
                      <span>{receipt.express_fee.toFixed(2)} SAR</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1 mt-1">
                    <span>Total</span>
                    <span className="text-primary">{receipt.total.toFixed(2)} SAR</span>
                  </div>
                </div>
              </div>
            )}

            {/* Assignment history */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Assignment History</h3>
              <div className="space-y-1.5 text-xs text-gray-500">
                {(o as any).confirmed_by && <div>✅ Confirmed by admin</div>}
                {(o as any).assigned_delivery_id && (
                  <div>🚗 Pickup: {staffList.find(s => s.id === (o as any).assigned_delivery_id)?.full_name ?? (o as any).assigned_delivery_id}</div>
                )}
                {(o as any).picked_up_confirmed_by && <div>📦 Picked up confirmed</div>}
                {(o as any).assigned_cleaner_id && (
                  <div>🧺 Cleaner: {staffList.find(s => s.id === (o as any).assigned_cleaner_id)?.full_name ?? (o as any).assigned_cleaner_id}</div>
                )}
                {(o as any).ready_confirmed_by && <div>✨ Ready confirmed (QR scan)</div>}
                {(o as any).final_delivery_id && (
                  <div>🚗 Final delivery: {staffList.find(s => s.id === (o as any).final_delivery_id)?.full_name ?? (o as any).final_delivery_id}</div>
                )}
                {o!.status === 'delivered' && <div>🎉 Delivered</div>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center text-gray-300">
          <div className="text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-lg font-medium">Select an order to view details</p>
          </div>
        </div>
      )}

      {/* ── Unsorted Receipt Entry Modal ── */}
      {showUnsortedForm && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900">فرز الملابس — #{trackingNum}</h3>
              <button onClick={() => setShowUnsortedForm(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {selectedOrder.speed === 'express' ? (
                <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 text-xs text-orange-700 font-semibold">
                  ⚡ طلب مستعجل — كل قطعة مستعجلة افتراضياً، يمكنك تغيير كل قطعة على حدة
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700 font-semibold">
                  💡 يمكنك تعيين بعض القطع كمستعجلة والأخرى عادية لإنشاء فاتورة مقسمة
                </div>
              )}
              <div className="space-y-3">
                {unsortedItems.map((item, i) => {
                  const catItem = catalogItems.find(c => c.id === item.item_id);
                  return (
                    <div key={i} className={`border rounded-xl p-3 space-y-2 ${item.speed === 'express' ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100 bg-gray-50'}`}>
                      {/* Catalog item selector */}
                      <div className="flex gap-2 items-center">
                        <select
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                          value={item.item_id}
                          onChange={e => {
                            const cat = catalogItems.find(c => c.id === e.target.value);
                            if (cat) {
                              setUnsortedItems(prev => prev.map((it, idx) => idx === i ? {
                                ...it, item_id: cat.id, name_ar: cat.name_ar, name_en: cat.name_en,
                                unit_price: priceForService(cat, it.service_type, it.speed),
                              } : it));
                            }
                          }}
                        >
                          <option value="">Select item from catalog...</option>
                          {catalogItems.map(c => (
                            <option key={c.id} value={c.id}>{c.name_ar} — {c.name_en}</option>
                          ))}
                        </select>
                        <button onClick={() => removeUnsortedItem(i)} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                      </div>
                      {/* Qty + service type */}
                      <div className="flex gap-2 items-center">
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-gray-500">Qty</label>
                          <input
                            type="number" min={1}
                            className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                            value={item.quantity}
                            onChange={e => updateUnsortedItem(i, 'quantity', +e.target.value)}
                          />
                        </div>
                        <select
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                          value={item.service_type}
                          onChange={e => {
                            const svc = e.target.value;
                            setUnsortedItems(prev => prev.map((it, idx) => idx === i ? {
                              ...it, service_type: svc,
                              unit_price: catItem ? priceForService(catItem, svc, it.speed) : it.unit_price,
                            } : it));
                          }}
                        >
                          <option value="wash">Wash</option>
                          <option value="iron">Iron</option>
                          <option value="wash_iron">Wash+Iron</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-gray-500">SAR</label>
                          <span className="w-20 border border-gray-100 bg-white rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 text-center">
                            {item.unit_price.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {/* Speed toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Speed:</span>
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                          <button
                            type="button"
                            className={`px-3 py-1.5 font-semibold transition-colors ${item.speed === 'normal' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            onClick={() => {
                              const cat = catalogItems.find(c => c.id === item.item_id);
                              setUnsortedItems(prev => prev.map((it, idx) => idx === i ? {
                                ...it, speed: 'normal',
                                unit_price: cat ? priceForService(cat, it.service_type, 'normal') : it.unit_price,
                              } : it));
                            }}
                          >
                            عادي
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1.5 font-semibold transition-colors ${item.speed === 'express' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            onClick={() => {
                              const cat = catalogItems.find(c => c.id === item.item_id);
                              setUnsortedItems(prev => prev.map((it, idx) => idx === i ? {
                                ...it, speed: 'express',
                                unit_price: cat ? priceForService(cat, it.service_type, 'express') : it.unit_price,
                              } : it));
                            }}
                          >
                            ⚡ مستعجل
                          </button>
                        </div>
                        <span className="text-xs text-gray-400 ml-auto">
                          Subtotal: {(item.quantity * item.unit_price).toFixed(2)} SAR
                        </span>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={addUnsortedItem}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-400 hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Item
                </button>
              </div>

              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
                rows={2}
                placeholder="Notes (optional)"
                value={unsortedNotes}
                onChange={e => setUnsortedNotes(e.target.value)}
              />

              {unsortedItems.length > 0 && (() => {
                const expressItems = unsortedItems.filter(it => it.speed === 'express' && it.item_id);
                const normalItems  = unsortedItems.filter(it => it.speed === 'normal'  && it.item_id);
                const expressBase  = expressItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
                const expressFee   = +(expressBase * 0.3).toFixed(2);
                const normalBase   = normalItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
                const hasMixed     = expressItems.length > 0 && normalItems.length > 0;
                const grandTotal   = +(expressBase + expressFee + normalBase).toFixed(2);
                return (
                  <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5">
                    {hasMixed && (
                      <div className="text-xs font-bold text-orange-600 bg-orange-50 rounded-lg px-2 py-1 mb-2">
                        📋 فاتورة مقسمة — سيتم إنشاء فاتورة واحدة بقسمين
                      </div>
                    )}
                    {expressItems.length > 0 && (
                      <>
                        <div className="flex justify-between text-orange-700 font-semibold">
                          <span>⚡ مستعجل ({expressItems.reduce((s, it) => s + it.quantity, 0)} قطعة)</span>
                          <span>{expressBase.toFixed(2)} SAR</span>
                        </div>
                        <div className="flex justify-between text-gray-500 text-xs">
                          <span>رسوم المستعجل (30%)</span>
                          <span>{expressFee.toFixed(2)} SAR</span>
                        </div>
                      </>
                    )}
                    {normalItems.length > 0 && (
                      <div className="flex justify-between text-gray-700 font-semibold">
                        <span>🕐 عادي ({normalItems.reduce((s, it) => s + it.quantity, 0)} قطعة)</span>
                        <span>{normalBase.toFixed(2)} SAR</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 border-t pt-1.5 mt-0.5">
                      <span>الإجمالي</span>
                      <span className="text-primary">{grandTotal.toFixed(2)} SAR</span>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={submitUnsortedReceipt}
                disabled={busy || unsortedItems.length === 0 || unsortedItems.some(it => !it.item_id)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'إنشاء الفاتورة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Scanner Modal ── */}
      {showQRScanner && (
        <QRScanner
          title={`Scan bag QR — ${trackingNum}`}
          onScan={handleReadyScan}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* ── Receipt Modal ── */}
      {showReceiptModal && selectedOrder && receipt && (
        <OrderReceipt
          order={selectedOrder}
          receipt={receipt}
          onClose={() => setShowReceiptModal(false)}
        />
      )}
    </div>
  );
}
