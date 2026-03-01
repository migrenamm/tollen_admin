import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { formatDate } from '../lib/utils';

const SERVICE_LABEL: Record<string, string> = {
  wash: '🫧 Wash', iron: '👔 Iron', wash_iron: '🫧👔 Wash+Iron',
};

export default function CleanerDashboard() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) loadOrders();
  }, [profile?.id]);

  async function loadOrders() {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*, profiles!user_id(full_name, phone), items:order_items(*)')
      .eq('assigned_cleaner_id', profile.id)
      .eq('status', 'cleaning')
      .order('created_at', { ascending: true });
    setOrders((data ?? []) as Order[]);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white px-5 pt-8 pb-6">
        <h1 className="text-xl font-bold">My Cleanings</h1>
        <p className="text-sm text-white/70 mt-0.5">{profile?.full_name ?? 'Cleaner'}</p>
      </div>

      <div className="p-4 space-y-3 pb-8">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-600">
            {orders.length} active {orders.length === 1 ? 'order' : 'orders'}
          </p>
          <button onClick={loadOrders} className="text-xs text-gray-400 hover:text-primary font-medium">
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🧺</div>
            <p className="text-gray-400 font-medium">No orders in your cleaning queue</p>
          </div>
        ) : orders.map(order => {
          const customerProfile = (order.profiles as any);
          const items = (order as any).items ?? [];
          const tNum = `#TOLL-${String(order.order_number).padStart(4, '0')}`;
          const isExpanded = expanded === order.id;

          return (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                className="w-full text-left px-4 py-4"
                onClick={() => setExpanded(isExpanded ? null : order.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-gray-900">{tNum}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{customerProfile?.full_name ?? '—'}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {order.speed === 'express' && (
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">⚡ Express</span>
                      )}
                      {order.type === 'sorted' ? (
                        <span className="text-xs bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 font-semibold">👕 Sorted</span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">🧺 Unsorted</span>
                      )}
                      {order.service_type && (
                        <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-semibold">
                          {SERVICE_LABEL[order.service_type] ?? order.service_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400">{formatDate(order.created_at)}</span>
                    <span className="text-primary text-lg">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
                  {order.notes && (
                    <div className="bg-amber-50 rounded-xl px-3 py-2 text-sm text-amber-700">
                      📝 {order.notes}
                    </div>
                  )}

                  {order.type === 'sorted' && items.length > 0 ? (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Items</p>
                      <div className="space-y-1.5">
                        {items.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <div>
                              <span className="text-gray-800">{item.item_name_ar}</span>
                              <span className="text-gray-400 text-xs ml-2">× {item.quantity}</span>
                            </div>
                            <span className="text-xs text-blue-600 font-semibold">
                              {SERVICE_LABEL[item.service_type] ?? item.service_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : order.type === 'unsorted' ? (
                    <div className="bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-500 text-center">
                      Unsorted bag — items counted by admin
                    </div>
                  ) : null}

                  <div className="bg-purple-50 rounded-xl px-3 py-2.5 text-sm text-purple-700 text-center font-semibold">
                    🧺 In Progress — Admin will scan QR when done
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
