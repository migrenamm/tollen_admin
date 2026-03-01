import { Order, Receipt } from '../types';

interface Props {
  order: Order;
  receipt: Receipt;
  onClose: () => void;
}

const SERVICE_LABEL: Record<string, string> = {
  wash: 'Wash', iron: 'Iron', wash_iron: 'Wash+Iron',
};

export default function OrderReceipt({ order, receipt, onClose }: Props) {
  const profile = order.profiles as any;
  const trackingNum = `TOLL-${String(order.order_number).padStart(4, '0')}`;
  const date = new Date(receipt.issued_at).toLocaleDateString('en-SA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto print:rounded-none print:max-h-none print:overflow-visible" id="receipt-print-area">
        {/* Close button (hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b print:hidden">
          <h3 className="font-bold text-gray-900">Receipt</h3>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold"
            >
              🖨️ Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
          </div>
        </div>

        {/* Receipt body */}
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="text-center border-b pb-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-xl mx-auto mb-2">T</div>
            <h2 className="text-xl font-bold text-gray-900">Tollen</h2>
            <p className="text-sm text-gray-400">Laundry On-Demand</p>
          </div>

          {/* Order info */}
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-gray-400">Order</p>
              <p className="font-bold text-gray-900">#{trackingNum}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400">Date</p>
              <p className="font-medium text-gray-700">{date}</p>
            </div>
          </div>

          {/* Customer */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <p className="text-gray-400 mb-1">Customer</p>
            <p className="font-semibold text-gray-900">{profile?.full_name ?? '—'}</p>
            <p className="text-gray-500">{profile?.phone ?? '—'}</p>
          </div>

          {/* Type badges */}
          <div className="flex gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
              order.type === 'unsorted' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
            }`}>
              {order.type === 'unsorted' ? '🧺 Without Sorting' : '👕 Sorted'}
            </span>
            {order.speed === 'express' && (
              <span className="text-xs px-2 py-1 rounded-full font-semibold bg-orange-100 text-orange-700">
                ⚡ Express
              </span>
            )}
          </div>

          {/* Items */}
          {receipt.items_snapshot && receipt.items_snapshot.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-2">
                {receipt.items_snapshot.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <div>
                      <span className="text-gray-800">{item.name_ar}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        × {item.quantity} · {SERVICE_LABEL[item.service_type]}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900">{item.subtotal.toFixed(2)} SAR</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="border-t pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>{receipt.subtotal.toFixed(2)} SAR</span>
            </div>
            {receipt.express_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Express Fee</span>
                <span>{receipt.express_fee.toFixed(2)} SAR</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-1 border-t">
              <span className="text-gray-900">Total</span>
              <span className="text-primary">{receipt.total.toFixed(2)} SAR</span>
            </div>
          </div>

          {/* Payment status */}
          <div className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${
            receipt.is_paid
              ? 'bg-green-50 text-green-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {receipt.is_paid ? '✅ Paid' : '⏳ Payment Pending'}
          </div>

          {receipt.notes && (
            <p className="text-xs text-gray-400 text-center">{receipt.notes}</p>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .fixed.inset-0 { display: flex !important; }
          #receipt-print-area { box-shadow: none !important; }
          .print\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
