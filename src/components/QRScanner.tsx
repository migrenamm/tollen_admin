import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (result: string) => void;
  onClose: () => void;
  title?: string;
}

export default function QRScanner({ onScan, onClose, title = 'Scan QR Code' }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const scannerId = 'qr-reader-' + Math.random().toString(36).slice(2);
    const el = document.getElementById('qr-reader-container');
    if (el) el.id = scannerId;

    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decoded) => {
        scanner.stop().catch(() => {});
        onScan(decoded);
      },
      () => {}
    ).then(() => {
      setStarted(true);
    }).catch(() => {
      setError('Camera not available. Enter code manually.');
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-4">{error}</p>
            </div>
          ) : (
            <div id="qr-reader-container" className="w-full rounded-lg overflow-hidden" />
          )}

          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2 text-center">— or enter manually —</p>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="Enter code..."
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && manualCode.trim()) {
                    onScan(manualCode.trim());
                  }
                }}
              />
              <button
                onClick={() => manualCode.trim() && onScan(manualCode.trim())}
                className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
