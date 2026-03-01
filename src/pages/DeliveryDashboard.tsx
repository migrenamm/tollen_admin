import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { notifyUser } from '../lib/pushNotifications';
import QRScanner from '../components/QRScanner';

type Tab = 'pickup' | 'delivery';

export default function DeliveryDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('pickup');
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
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

    const [pickupRes, deliveryRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, profiles!user_id(id, full_name, phone, referral_code), address:addresses(street, city, district)')
        .eq('assigned_delivery_id', profile.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*, profiles!user_id(id, full_name, phone, referral_code), address:addresses(street, city, district)')
        .eq('final_delivery_id', profile.id)
        .eq('status', 'ready')
        .eq('is_paid', true)
        .order('created_at', { ascending: false }),
    ]);

    setPickupOrders((pickupRes.data ?? []) as Order[]);
    setDeliveryOrders((deliveryRes.data ?? []) as Order[]);
    setLoading(false);
  }

  function openScanner(orderId: string, mode: 'pickup' | 'delivery') {
    setScanOrderId(orderId);
    setScanMode(mode);
  }

  async function handleScan(scannedCode: string) {
    setScanOrderId(null);
    setScanMode(null);
    if (!scanOrderId || !scanMode) return;

    const orderList = scanMode === 'pickup' ? pickupOrders : deliveryOrders;
    const order = orderList.find(o => o.id === scanOrderId);
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

    setBusy(scanOrderId);

    if (scanMode === 'pickup') {
      await supabase.from('orders').update({
        status: 'picked_up',
        picked_up_confirmed_by: profile?.id,
        updated_at: new Date().toISOString(),
      }).eq('id', scanOrderId);

      await notifyUser(
        (order.profiles as any)?.id ?? '',
        'تم الاستلام',
        'ملابسك وصلت وسيبدأ التنظيف قريباً',
        scanOrderId
      );

      setPickupOrders(prev => prev.filter(o => o.id !== scanOrderId));
    } else {
      await supabase.from('orders').update({
        status: 'delivered',
        updated_at: new Date().toISOString(),
      }).eq('id', scanOrderId);

      await notifyUser(
        (order.profiles as any)?.id ?? '',
        'تم التوصيل',
        'تم توصيل طلبك بنجاح. شكراً لاستخدامك تولن!',
        scanOrderId
      );

      setDeliveryOrders(prev => prev.filter(o => o.id !== scanOrderId));
    }

    setBusy(null);
  }

  const activeOrders = tab === 'pickup' ? pickupOrders : deliveryOrders;

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
          className={`flex-1 py-3.5 text-sm font-bold transition-colors border-b-2 ${
            tab === 'pickup' ? 'border-primary text-primary' : 'border-transparent text-gray-400'
          }`}
        >
          استلام ({pickupOrders.length})
        </button>
        <button
          onClick={() => setTab('delivery')}
          className={`flex-1 py-3.5 text-sm font-bold transition-colors border-b-2 ${
            tab === 'delivery' ? 'border-primary text-primary' : 'border-transparent text-gray-400'
          }`}
        >
          توصيل ({deliveryOrders.length})
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
            <div className="text-4xl mb-3">{tab === 'pickup' ? '🚗' : '✅'}</div>
            <p className="text-gray-400 font-medium">
              {tab === 'pickup' ? 'No pickups assigned' : 'No deliveries assigned'}
            </p>
          </div>
        ) : activeOrders.map(order => {
          const customerProfile = (order.profiles as any);
          const address = (order as any).address;
          const tNum = `#TOLL-${String(order.order_number).padStart(4, '0')}`;
          const isBusy = busy === order.id;

          return (
            <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-gray-900">{tNum}</div>
                  <div className="text-sm text-gray-600 mt-0.5">{customerProfile?.full_name ?? '—'}</div>
                  <div className="text-xs text-gray-400">{customerProfile?.phone ?? '—'}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
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

              {address && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                  📍 {address.street}, {address.district}, {address.city}
                </div>
              )}

              <button
                onClick={() => openScanner(order.id, tab)}
                disabled={isBusy}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isBusy ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <>
                    <span>📷</span>
                    <span>{tab === 'pickup' ? 'Scan Customer QR — Confirm Pickup' : 'Scan Customer QR — Confirm Delivery'}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* QR Scanner */}
      {scanOrderId && scanMode && (
        <QRScanner
          title={tab === 'pickup' ? 'Scan Customer QR — Pickup' : 'Scan Customer QR — Delivery'}
          onScan={handleScan}
          onClose={() => { setScanOrderId(null); setScanMode(null); }}
        />
      )}
    </div>
  );
}
