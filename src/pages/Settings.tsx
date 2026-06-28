import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import { supabase } from '../lib/supabase';

type ZonePoint = [number, number];

const CENTER: ZonePoint = [21.4611, 39.9074];

function ZoneClickHandler({ onAdd }: { onAdd: (p: ZonePoint) => void }) {
  useMapEvents({ click: e => onAdd([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export default function Settings() {
  // ── Share message ──────────────────────────────────────────────────────────
  const [shareMessage, setShareMessage] = useState('');
  const [original, setOriginal] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Service zone ───────────────────────────────────────────────────────────
  const [zonePoints, setZonePoints] = useState<ZonePoint[]>([]);
  const [origZone, setOrigZone] = useState<ZonePoint[]>([]);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneSaved, setZoneSaved] = useState(false);

  // ── Legal documents (Terms / Privacy, EN + AR) ───────────────────────────────
  type Legal = { terms_en: string; terms_ar: string; privacy_en: string; privacy_ar: string };
  const EMPTY_LEGAL: Legal = { terms_en: '', terms_ar: '', privacy_en: '', privacy_ar: '' };
  const [legal, setLegal] = useState<Legal>(EMPTY_LEGAL);
  const [legalOriginal, setLegalOriginal] = useState<Legal>(EMPTY_LEGAL);
  const [legalSaving, setLegalSaving] = useState(false);
  const [legalSaved, setLegalSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('settings').select('value').eq('key', 'share_message').single(),
      supabase.from('settings').select('value').eq('key', 'service_zone').maybeSingle(),
      supabase.from('settings').select('key, value')
        .in('key', ['terms_en', 'terms_ar', 'privacy_en', 'privacy_ar']),
    ]).then(([{ data: sm }, { data: sz }, { data: legalRows }]) => {
      const val = sm?.value ?? '';
      setShareMessage(val);
      setOriginal(val);
      if (sz?.value) {
        try {
          const parsed = JSON.parse(sz.value);
          if (Array.isArray(parsed)) { setZonePoints(parsed); setOrigZone(parsed); }
        } catch {}
      }
      const loaded: Legal = { ...EMPTY_LEGAL };
      for (const row of legalRows ?? []) {
        if (row.key in loaded) (loaded as any)[row.key] = row.value ?? '';
      }
      setLegal(loaded);
      setLegalOriginal(loaded);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    await supabase
      .from('settings')
      .upsert({ key: 'share_message', value: shareMessage, updated_at: new Date().toISOString() });
    setOriginal(shareMessage);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function saveZone() {
    setZoneSaving(true);
    await supabase
      .from('settings')
      .upsert({ key: 'service_zone', value: JSON.stringify(zonePoints), updated_at: new Date().toISOString() });
    setOrigZone([...zonePoints]);
    setZoneSaving(false);
    setZoneSaved(true);
    setTimeout(() => setZoneSaved(false), 2500);
  }

  const isDirty = shareMessage !== original;
  const isZoneDirty = JSON.stringify(zonePoints) !== JSON.stringify(origZone);
  const isLegalDirty = JSON.stringify(legal) !== JSON.stringify(legalOriginal);

  async function saveLegal() {
    setLegalSaving(true);
    const now = new Date().toISOString();
    await supabase.from('settings').upsert([
      { key: 'terms_en',   value: legal.terms_en,   updated_at: now },
      { key: 'terms_ar',   value: legal.terms_ar,   updated_at: now },
      { key: 'privacy_en', value: legal.privacy_en, updated_at: now },
      { key: 'privacy_ar', value: legal.privacy_ar, updated_at: now },
    ]);
    setLegalOriginal(legal);
    setLegalSaving(false);
    setLegalSaved(true);
    setTimeout(() => setLegalSaved(false), 2500);
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-1">Settings</h1>
      <p className="text-xs md:text-sm text-slate-500 mb-6 md:mb-8">App-wide configuration editable without a code release.</p>

      {/* ── Share Message ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 mb-6">
        <h2 className="text-base font-semibold text-slate-700 mb-1">Share / Referral Message</h2>
        <p className="text-xs text-slate-400 mb-4">
          Shown when a user taps "Share Code" in the wallet or home screen.
          Use <code className="bg-slate-100 px-1 rounded">{'{CODE}'}</code> as the placeholder for the referral code.
          You can add the App Store / Play Store link here once you have it.
        </p>

        <textarea
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent leading-relaxed"
          rows={5}
          value={shareMessage}
          onChange={e => setShareMessage(e.target.value)}
          disabled={loading}
          dir="auto"
          placeholder="e.g. Join Tollen! Use my code {CODE} to get a discount. Download: https://..."
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
          <p className="text-xs text-slate-400">
            Tip: once your app is live on stores, add the download link and save — no code change needed.
          </p>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty || loading}
            className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-opacity flex-shrink-0 self-end sm:self-auto"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Service Zone ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-1">Service Zone</h2>
        <p className="text-xs text-slate-400 mb-4">
          Draw the boundary of the neighbourhood you serve. Customers will see this highlighted on the map
          when adding a new address, and any pin outside this zone will be rejected.
        </p>

        {/* Instruction banner */}
        <div className="flex flex-wrap items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs text-primary font-semibold flex-1">
            🖱️ Click on the map to add boundary points &nbsp;·&nbsp; Click a numbered dot to remove it
          </p>
          <span className="text-xs font-bold text-slate-500 shrink-0">
            {zonePoints.length === 0
              ? 'No zone defined yet'
              : `${zonePoints.length} point${zonePoints.length === 1 ? '' : 's'} · ${zonePoints.length >= 3 ? 'polygon ready' : 'need 3+ points to close'}`}
          </span>
        </div>

        {/* Map */}
        <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 360 }}>
          <MapContainer center={CENTER} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <ZoneClickHandler onAdd={p => setZonePoints(prev => [...prev, p])} />

            {/* Connect the first two points with a dashed line */}
            {zonePoints.length === 2 && (
              <Polyline
                positions={zonePoints}
                pathOptions={{ color: '#2D9B8A', weight: 2, dashArray: '6 4' }}
              />
            )}

            {/* Closed polygon once we have 3+ points */}
            {zonePoints.length >= 3 && (
              <Polygon
                positions={zonePoints}
                pathOptions={{ color: '#2D9B8A', weight: 2.5, fillColor: '#2D9B8A', fillOpacity: 0.13 }}
              />
            )}

            {/* Numbered vertex dots — click to remove that vertex */}
            {zonePoints.map((pt, i) => (
              <CircleMarker
                key={i}
                center={pt}
                radius={10}
                pathOptions={{ color: 'white', weight: 2.5, fillColor: '#2D9B8A', fillOpacity: 1 }}
                eventHandlers={{ click: () => setZonePoints(prev => prev.filter((_, j) => j !== i)) }}
              >
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            onClick={() => setZonePoints(prev => prev.slice(0, -1))}
            disabled={zonePoints.length === 0}
            className="px-3 py-2 text-sm font-semibold border border-slate-200 text-slate-600 rounded-xl disabled:opacity-30 hover:border-slate-300 transition-colors"
          >
            ↩ Undo last
          </button>
          <button
            onClick={() => setZonePoints([])}
            disabled={zonePoints.length === 0}
            className="px-3 py-2 text-sm font-semibold border border-red-200 text-red-500 rounded-xl disabled:opacity-30 hover:bg-red-50 transition-colors"
          >
            ✕ Clear all
          </button>

          {origZone.length > 0 && JSON.stringify(zonePoints) !== JSON.stringify(origZone) && (
            <button
              onClick={() => setZonePoints([...origZone])}
              className="px-3 py-2 text-sm font-semibold border border-slate-200 text-slate-500 rounded-xl hover:border-slate-300 transition-colors"
            >
              ↺ Reset to saved
            </button>
          )}

          <button
            onClick={saveZone}
            disabled={zoneSaving || !isZoneDirty}
            className="ml-auto px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-opacity"
          >
            {zoneSaving ? 'Saving…' : zoneSaved ? '✓ Zone saved' : 'Save Zone'}
          </button>
        </div>

        {zonePoints.length === 0 && origZone.length > 0 && (
          <p className="text-xs text-red-500 mt-2">
            ⚠️ You cleared the zone. Save to remove the restriction, or reset to restore it.
          </p>
        )}
      </div>

      {/* ── Legal Documents ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 mt-6">
        <h2 className="text-base font-semibold text-slate-700 mb-1">Legal Documents</h2>
        <p className="text-xs text-slate-400 mb-4">
          Terms of Service and Privacy Policy shown in the app's Account screen.
          Each user sees the version matching their app language. Plain text —
          blank lines separate paragraphs. Saves take effect immediately.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Terms of Service — English</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent leading-relaxed"
              rows={10}
              dir="ltr"
              value={legal.terms_en}
              onChange={e => setLegal(v => ({ ...v, terms_en: e.target.value }))}
              disabled={loading}
              placeholder="Enter the English Terms of Service…"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">شروط الخدمة — العربية</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent leading-relaxed"
              rows={10}
              dir="rtl"
              value={legal.terms_ar}
              onChange={e => setLegal(v => ({ ...v, terms_ar: e.target.value }))}
              disabled={loading}
              placeholder="أدخل شروط الخدمة بالعربية…"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Privacy Policy — English</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent leading-relaxed"
              rows={10}
              dir="ltr"
              value={legal.privacy_en}
              onChange={e => setLegal(v => ({ ...v, privacy_en: e.target.value }))}
              disabled={loading}
              placeholder="Enter the English Privacy Policy…"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">سياسة الخصوصية — العربية</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent leading-relaxed"
              rows={10}
              dir="rtl"
              value={legal.privacy_ar}
              onChange={e => setLegal(v => ({ ...v, privacy_ar: e.target.value }))}
              disabled={loading}
              placeholder="أدخل سياسة الخصوصية بالعربية…"
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={saveLegal}
            disabled={legalSaving || !isLegalDirty || loading}
            className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-opacity"
          >
            {legalSaving ? 'Saving…' : legalSaved ? '✓ Saved' : 'Save Legal Documents'}
          </button>
        </div>
      </div>
    </div>
  );
}
