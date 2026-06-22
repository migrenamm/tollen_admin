import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (result: string) => void;
  onClose: () => void;
  title?: string;
}

export default function QRScanner({ onScan, onClose, title = 'Scan QR Code' }: Props) {
  // Stable, unique container id per component instance. Created once so it
  // survives React StrictMode's double-mount and never collides with another
  // QRScanner rendered elsewhere on the page.
  const [readerId] = useState(() => 'qr-reader-' + Math.random().toString(36).slice(2));
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode(readerId);
    let scanned = false;
    let started = false;
    // Tracks whether this effect run has been cleaned up. Under StrictMode the
    // first run is torn down before camera permission resolves; we must not
    // leave a started scanner attached to an unmounted node.
    let cancelled = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          if (scanned) return;
          scanned = true;
          scanner.stop().catch(() => {});
          onScanRef.current(decoded);
        },
        () => {}
      )
      .then(() => {
        started = true;
        // Effect was cleaned up while permission was still pending — stop now
        // that the camera has actually started, otherwise it streams into a
        // detached node (the white-screen bug).
        if (cancelled) scanner.stop().catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setError('Camera not available. Enter code manually.');
      });

    return () => {
      cancelled = true;
      // Only stop a scanner that finished starting; stopping a still-pending
      // scanner throws and leaves the stream half-initialized.
      if (started && !scanned) scanner.stop().catch(() => {});
    };
  }, [readerId]);

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
            <div id={readerId} className="w-full rounded-lg overflow-hidden" />
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
