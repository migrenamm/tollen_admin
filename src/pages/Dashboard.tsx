import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Order, DashboardStats } from '../types';
import StatCard from '../components/StatCard';
import { formatDistanceToNow } from '../lib/utils';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  cleaning:  'bg-purple-100 text-purple-800',
  ready:     'bg-teal-100 text-teal-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      { count: ordersToday },
      { data: revToday },
      { count: pendingCount },
      { count: totalCustomers },
      { count: totalOrders },
      { data: allRev },
      { data: recent },
    ] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
      supabase.from('orders').select('total').gte('created_at', todayStart.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', false),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('total').neq('status', 'cancelled'),
      supabase.from('orders')
        .select('id, order_number, status, type, total, created_at, speed, profiles!user_id(phone, full_name)')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    const revenueToday = (revToday ?? []).reduce((s, o) => s + (o.total ?? 0), 0);
    const revenueAllTime = (allRev ?? []).reduce((s, o) => s + (o.total ?? 0), 0);

    setStats({
      totalOrdersToday: ordersToday ?? 0,
      revenueToday,
      pendingOrders: pendingCount ?? 0,
      totalCustomers: totalCustomers ?? 0,
      totalOrdersAllTime: totalOrders ?? 0,
      revenueAllTime,
    });

    setRecentOrders((recent ?? []) as unknown as Order[]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welcome back — here's what's happening today</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📦" label="Orders Today"     value={stats?.totalOrdersToday ?? 0} color="teal" />
        <StatCard icon="💰" label="Revenue Today"    value={`${stats?.revenueToday.toFixed(0)} SAR`} color="coral" />
        <StatCard icon="⏳" label="Pending Orders"   value={stats?.pendingOrders ?? 0} color="blue" />
        <StatCard icon="👥" label="Total Customers"  value={stats?.totalCustomers ?? 0} color="purple" />
      </div>

      {/* All-time row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <p className="font-bold text-gray-900">{stats?.totalOrdersAllTime.toLocaleString()}</p>
            <p className="text-xs text-gray-500">All-time Orders</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="text-2xl">💳</span>
          <div>
            <p className="font-bold text-gray-900">{stats?.revenueAllTime.toFixed(0)} SAR</p>
            <p className="text-xs text-gray-500">All-time Revenue</p>
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          <a href="/orders" className="text-sm text-primary hover:underline">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Order</th>
                <th className="table-th">Customer</th>
                <th className="table-th">Type</th>
                <th className="table-th">Total</th>
                <th className="table-th">Status</th>
                <th className="table-th">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentOrders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td font-mono text-sm font-semibold text-primary">
                    #{`TOLL-${String((order as any).order_number).padStart(4, '0')}`}
                  </td>
                  <td className="table-td">{(order.profiles as any)?.phone ?? '—'}</td>
                  <td className="table-td capitalize">{order.type}</td>
                  <td className="table-td font-semibold">{order.total} SAR</td>
                  <td className="table-td">
                    <span className={`badge ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="table-td text-gray-400 text-xs">{formatDistanceToNow(order.created_at)}</td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
