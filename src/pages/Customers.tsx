import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { formatDate } from '../lib/utils';

interface CustomerRow extends Profile {
  order_count?: number;
}

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_admin', false)
      .order('created_at', { ascending: false });

    if (!profiles) { setLoading(false); return; }

    // Get order counts per user
    const { data: orderCounts } = await supabase
      .from('orders')
      .select('user_id');

    const countMap: Record<string, number> = {};
    (orderCounts ?? []).forEach(o => {
      countMap[o.user_id] = (countMap[o.user_id] ?? 0) + 1;
    });

    setCustomers(profiles.map(p => ({ ...p, order_count: countMap[p.id] ?? 0 })));
    setLoading(false);
  }

  const filtered = customers.filter(c => {
    if (!search) return true;
    return (c.phone ?? '').includes(search) || (c.full_name ?? '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{customers.length} registered users</p>
        </div>
        <button onClick={loadCustomers} className="btn-ghost">🔄 Refresh</button>
      </div>

      <input
        className="input w-64"
        placeholder="Search by phone or name..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">Customer</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Orders</th>
                  <th className="table-th">Wallet Balance</th>
                  <th className="table-th">Language</th>
                  <th className="table-th">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                          {(c.full_name ?? c.phone ?? '?')[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium">{c.full_name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="table-td font-mono text-sm">{c.phone ?? '—'}</td>
                    <td className="table-td">
                      <span className={`font-semibold ${(c.order_count ?? 0) > 0 ? 'text-primary' : 'text-gray-400'}`}>
                        {c.order_count ?? 0}
                      </span>
                    </td>
                    <td className="table-td font-semibold">{c.wallet_balance?.toFixed(2)} SAR</td>
                    <td className="table-td">
                      <span className="badge bg-gray-100 text-gray-600">{c.language?.toUpperCase() ?? 'AR'}</span>
                    </td>
                    <td className="table-td text-xs text-gray-400">{formatDate(c.created_at)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="table-td text-center text-gray-400 py-12">No customers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
