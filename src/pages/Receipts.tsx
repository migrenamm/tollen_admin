import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Receipt, Order } from '../types';
import { formatDate } from '../lib/utils';
import OrderReceipt from '../components/OrderReceipt';

type Filter = 'all' | 'unpaid' | 'paid';

interface ReceiptRow {
  receipt: Receipt;
  order: Order;
}

export default function Receipts() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { loadReceipts(); }, []);

  async function loadReceipts() {
    setLoading(true);
    const { data } = await supabase
      .from('receipts')
      .select(`
        *,
        order:orders(
          *,
          profiles!user_id(id, full_name, phone, referral_code),
          address:addresses(street, city, district),
          items:order_items(*)
        )
      `)
      .order('issued_at', { ascending: false })
      .limit(300);

    const result: ReceiptRow[] = (data ?? []).map((r: any) => ({
      receipt: {
        id: r.id,
        order_id: r.order_id,
        items_snapshot: r.items_snapshot,
        subtotal: r.subtotal,
        express_fee: r.express_fee,
        total: r.total,
        is_paid: r.is_paid,
        paid_at: r.paid_at,
        issued_by: r.issued_by,
        issued_at: r.issued_at,
        notes: r.notes,
      },
      order: r.order,
    }));

    setRows(result);
    setLoading(false);
  }

  async function markPaid(row: ReceiptRow) {
    setBusy(row.receipt.id);
    const now = new Date().toISOString();
    await supabase.from('receipts').update({ is_paid: true, paid_at: now }).eq('id', row.receipt.id);
    await supabase.from('orders').update({ is_paid: true, updated_at: now }).eq('id', row.order.id);
    setRows(prev => prev.map(r =>
      r.receipt.id === row.receipt.id
        ? { ...r, receipt: { ...r.receipt, is_paid: true, paid_at: now } }
        : r
    ));
    if (selected?.receipt.id === row.receipt.id) {
      setSelected(prev => prev ? { ...prev, receipt: { ...prev.receipt, is_paid: true, paid_at: now } } : prev);
    }
    setBusy(null);
  }

  const filtered = rows.filter(r => {
    if (filter === 'paid') return r.receipt.is_paid;
    if (filter === 'unpaid') return !r.receipt.is_paid;
    return true;
  });

  const unpaidCount = rows.filter(r => !r.receipt.is_paid).length;
  const paidCount = rows.filter(r => r.receipt.is_paid).length;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} total · {unpaidCount} unpaid</p>
        </div>
        <button onClick={loadReceipts} className="text-gray-400 hover:text-primary text-sm font-medium">
          🔄 Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([
          { key: 'all', label: `All (${rows.length})` },
          { key: 'unpaid', label: `⏳ Unpaid (${unpaidCount})` },
          { key: 'paid', label: `✅ Paid (${paidCount})` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === tab.key
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No receipts found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">Order</th>
                  <th className="table-th">Customer</th>
                  <th className="table-th">Subtotal</th>
                  <th className="table-th">Express</th>
                  <th className="table-th">Total</th>
                  <th className="table-th">Issued</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => {
                  const profile = (row.order.profiles as any);
                  const tNum = `#TOLL-${String(row.order.order_number).padStart(4, '0')}`;
                  return (
                    <tr key={row.receipt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td">
                        <span className="font-bold text-sm text-gray-900">{tNum}</span>
                      </td>
                      <td className="table-td">
                        <div className="font-medium text-sm">{profile?.full_name || '—'}</div>
                        <div className="text-xs text-gray-400">{profile?.phone}</div>
                      </td>
                      <td className="table-td text-sm">{row.receipt.subtotal.toFixed(2)} SAR</td>
                      <td className="table-td text-sm">
                        {row.receipt.express_fee > 0 ? `${row.receipt.express_fee.toFixed(2)} SAR` : '—'}
                      </td>
                      <td className="table-td font-bold text-gray-900">{row.receipt.total.toFixed(2)} SAR</td>
                      <td className="table-td text-xs text-gray-400">{formatDate(row.receipt.issued_at)}</td>
                      <td className="table-td">
                        {row.receipt.is_paid ? (
                          <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-semibold">✅ Paid</span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">⏳ Unpaid</span>
                        )}
                      </td>
                      <td className="table-td">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelected(row)}
                            className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-primary hover:text-white transition-colors"
                          >
                            View
                          </button>
                          {!row.receipt.is_paid && (
                            <button
                              onClick={() => markPaid(row)}
                              disabled={busy === row.receipt.id}
                              className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-lg font-semibold hover:bg-green-600 hover:text-white transition-colors disabled:opacity-50"
                            >
                              {busy === row.receipt.id ? '...' : 'Mark Paid'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt modal */}
      {selected && (
        <OrderReceipt
          order={selected.order}
          receipt={selected.receipt}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
