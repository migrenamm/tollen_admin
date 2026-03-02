import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { notifyUser } from '../lib/pushNotifications';
import QRScanner from '../components/QRScanner';

type Tab = 'pickup' | 'delivery' | 'done';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  picked_up: { label: '✅ Picked Up', cls: 'bg-indigo-100 text-indigo-700' },
  cleaning:  { label: '🧺 Cleaning',  cls: 'bg-purple-100 text-purple-700' },
  ready:     { label: '✨ Ready',     cls: 'bg-teal-100 text-teal-700' },
  delivered: { label: '✅ Delivered', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: '❌ Cancelled', cls: 'bg-red-100 text-red-700' },
};

export default function DeliveryDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('pickup');
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [doneOrders, setDoneOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanOrderId, setScanOrderId] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'pickup' | 'delivery' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) loadOrders();
  }, [profile?.id]);

  async function loadOrders() {
    if (!profile?.id) return;
    setLoading(true);

    const sel = '*, profiles!user_id(id, full_name, phone, referral_code), address:addresses(full_address, house_number, city, district)';

    const [pickupRes, deliveryRes, donePickupRes, doneFinalRes] = await Promise.all([
      supabase
        .from('orders').select(sel)
        .eq('assigned_delivery_id', profile.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
      supabase
        .from('orders').select(sel)
        .eq('final_delivery_id', profile.id)
        .eq('status', 'ready')
        .eq('is_paid', true)
        .order('created_at', { ascending: false }),
      // History: pickup jobs completed (order moved past 'confirmed')
      supabase
        .from('orders').select(sel)
        .eq('assigned_delivery_id', profile.id)
        .neq('status', 'confirmed')
        .order('updated_at', { ascending: false })
        .limit(40),
      // History: final delivery jobs completed
      supabase
        .from('orders').select(sel)
        .eq('final_delivery_id', profile.id)
        .eq('status', 'delivered')
        .order('updated_at', { ascending: false })
        .limit(40),
    ]);

    setPickupOrders((pickupRes.data ?? []) as Order[]);
    setDeliveryOrders((deliveryRes.data ?? []) as Order[]);

    // Merge & deduplicate history (same order may appear in both if same driver did pickup + delivery)
    const allDone = [...(donePickupRes.data ?? []), ...(doneFinalRes.data ?? [])] as Order[];
    const seen = new Set<string>();
    const deduped = allDone.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    deduped.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setDoneOrders(deduped);

    setLoading(false);
  }

  function openScanner(orderId: string, mode: 'pickup' | 'delivery') {
    setScanOrderId(orderId);
    setScanMode(mode);
  }

  async function handleScan(scannedCode: string) {
    // Capture local copies before clearing state to avoid stale-closure issues
    const orderId = scanOrderId;
    const mode = scanMode;
    setScanOrderId(null);
    setScanMode(null);
    if (!orderId || !mode) return;

    const orderList = mode === 'pickup' ? pickupOrders : deliveryOrders;
    const order = orderList.find(o => o.id === orderId);
    if (!order) return;

    const customerReferralCode = (order.profiles as any)?.referral_code;
    if (!customerReferralCode) {
      alert('Could not verify customer — no referral code found.');
      return;
    }

    if (scannedCode.trim() !== customerReferralCode.trim()) {
      alert('QR code does not match this customer. Please try again.');
      return;
    }

    setBusy(orderId);

    try {
      if (mode === 'pickup') {
        await supabase.from('orders').update({
          status: 'picked_up',
          picked_up_confirmed_by: profile?.id,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);

        await notifyUser(
          (order.profiles as any)?.id ?? '',
          'تم الاستلام',
          'ملابسك وصلت وسيبدأ التنظيف قريباً',
          orderId
        );

        setPickupOrders(prev => prev.filter(o => o.id !== orderId));
        // Move to history immediately
        setDoneOrders(prev => [{ ...order, status: 'picked_up' } as Order, ...prev]);
      } else {
        await supabase.from('orders').update({
          status: 'delivered',
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);

        await notifyUser(
          (order.profiles as any)?.id ?? '',
          'تم التوصيل',
          'تم توصيل طلبك بنجاح. شكراً لاستخدامك تولن!',
          orderId
        );

        setDeliveryOrders(prev => prev.filter(o => o.id !== orderId));
        // Move to history immediately
        setDoneOrders(prev => [{ ...order, status: 'delivered' } as Order, ...prev]);
      }
    } catch (err) {
      console.error('handleScan error:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const activeOrders = tab === 'pickup' ? pickupOrders : tab === 'delivery' ? deliveryOrders : doneOrders;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white px-5 pt-8 pb-6">
        <h1 className="text-xl font-bold">My Tasks</h1>
        <p className="text-sm text-white/70 mt-0.5">{profile?.full_name ?? 'Delivery Staff'}</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
        <button
          onClick={() => setTab('pickup')}
          className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-1 ${
            tab === 'pickup' ? 'border-primary text-primary' : 'border-transparent text-gray-400'
          }`}
        >
          استلام
          {pickupOrders.length > 0 && (
            <span className="bg-primary text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{pickupOrders.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('delivery')}
          className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-1 ${
            tab === 'delivery' ? 'border-primary text-primary' : 'border-transparent text-gray-400'
          }`}
        >
          توصيل
          {deliveryOrders.length > 0 && (
            <span className="bg-primary text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{deliveryOrders.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('done')}
          className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-1 ${
            tab === 'done' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'
          }`}
        >
          مكتمل
          {doneOrders.length > 0 && (
            <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{doneOrders.length}</span>
          )}
        </button>
      </div>

      {/* Order Cards */}
      <div className="p-4 space-y-3 pb-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{tab === 'pickup' ? '🚗' : tab === 'delivery' ? '📦' : '✅'}</div>
            <p className="text-gray-400 font-medium">
              {tab === 'pickup' ? 'No pickups assigned' : tab === 'delivery' ? 'No deliveries assigned' : 'No completed jobs yet'}
            </p>
          </div>
        ) : (
          <>
            {tab === 'done' && (
              <div className="flex items-center justify-between pb-1">
                <p className="text-xs text-gray-400 font-medium">{doneOrders.length} completed jobs</p>
                <button onClick={loadOrders} className="text-xs text-gray-400 hover:text-primary font-medium">🔄 Refresh</button>
              </div>
            )}
            {activeOrders.map(order => {
              const customerProfile = (order.profiles as any);
              const address = (order as any).address;
              const tNum = `#TOLL-${String(order.order_number).padStart(4, '0')}`;
              const isBusy = busy === order.id;
              const statusInfo = STATUS_LABEL[order.status];

              return (
                <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-gray-900">{tNum}</div>
                      <div className="text-sm text-gray-600 mt-0.5">{customerProfile?.full_name ?? '—'}</div>
                      <div className="text-xs text-gray-400">{customerProfile?.phone ?? '—'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {tab === 'done' && statusInfo && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      )}
                      {order.speed === 'express' && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">⚡ Express</span>
                      )}
                      <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${
                        order.type === 'unsorted' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
                      }`}>
                        {order.type === 'unsorted' ? '🧺 No Sort' : '👕 Sorted'}
                      </span>
                    </div>
                  </div>

                  {address ? (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                      📍 {[address.full_address ?? address.house_number, address.district, address.city].filter(Boolean).join(', ')}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                      📍 No address on file
                    </div>
                  )}

                  {tab !== 'done' && (
                    <button
                      onClick={() => openScanner(order.id, tab as 'pickup' | 'delivery')}
                      disabled={isBusy}
                      className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isBusy ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <span>📷</span>
                          <span>{tab === 'pickup' ? 'Scan Customer QR — Confirm Pickup' : 'Scan Customer QR — Confirm Delivery'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* QR Scanner */}
      {scanOrderId && scanMode && (
        <QRScanner
          title={scanMode === 'pickup' ? 'Scan Customer QR — Pickup' : 'Scan Customer QR — Delivery'}
          onScan={handleScan}
          onClose={() => { setScanOrderId(null); setScanMode(null); }}
        />
      )}
    </div>
  );
}
