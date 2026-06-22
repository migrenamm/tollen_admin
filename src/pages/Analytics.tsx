import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';

// Forces Leaflet to recompute its size after the flex layout settles.
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 400);
    window.addEventListener('resize', fix);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', fix); };
  }, [map]);
  return null;
}

// ─── Label types ──────────────────────────────────────────────────────────────
interface LabelDef {
  key: string;
  emoji: string;
  name: string;
  color: string;
  bg: string;
  isPreset?: boolean;
}

const PRESET_LABELS: LabelDef[] = [
  { key: 'important', emoji: '⭐', name: 'Important',       color: '#f59e0b', bg: '#fef3c7', isPreset: true },
  { key: 'vip',       emoji: '💎', name: 'VIP',             color: '#8b5cf6', bg: '#ede9fe', isPreset: true },
  { key: 'attention', emoji: '🔔', name: 'Needs Attention', color: '#ef4444', bg: '#fee2e2', isPreset: true },
  { key: 'followup',  emoji: '📞', name: 'Follow Up',       color: '#3b82f6', bg: '#dbeafe', isPreset: true },
  { key: 'loyal',     emoji: '🏅', name: 'Loyal Customer',  color: '#10b981', bg: '#d1fae5', isPreset: true },
];

// ─── Leaflet icon setup ───────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeDropIcon(color: string, emoji: string) {
  return L.divIcon({
    html: `<div style="
        width:30px;height:30px;
        background:${color};
        border:3px solid white;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:0 3px 7px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
      "><span style="transform:rotate(45deg);font-size:14px;line-height:1">${emoji}</span></div>`,
    className: '',
    iconSize: [30, 42],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
    tooltipAnchor: [16, -14],
  });
}

const defaultIcon = new L.Icon.Default();

function hexBg(hex: string) { return hex + '22'; }

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomerPin {
  addressId: string;
  customerId: string;
  full_name: string | null;
  sex: string | null;
  age_group: string | null;
  family_status: string | null;
  residence_type: string | null;
  lat: number;
  lng: number;
  full_address: string | null;
  address_label: string | null;
  is_default: boolean;
  monthly_spend: number;
  hasOrdered: boolean;
  created_at: string;
  label: string | null;
}

type SexFilter      = 'all' | 'male' | 'female';
type HouseholdFilter = 'all' | 'single' | 'family' | 'business';
type ResidenceFilter = 'all' | 'temporary' | 'permanent';
type AgeGroupFilter = 'all' | 'under_18' | '18_24' | '25_34' | '35_44' | '45_54' | '55_plus';
type JoinedFilter   = 'all' | '1w' | '2w' | '3w' | '1m';
type OrderedFilter  = 'all' | 'ordered' | 'not_ordered';

const AGE_GROUP_LABELS: Record<AgeGroupFilter, string> = {
  all: 'All', under_18: 'Under 18', '18_24': '18–24', '25_34': '25–34',
  '35_44': '35–44', '45_54': '45–54', '55_plus': '55+',
};
const JOINED_LABELS: Record<JoinedFilter, string> = {
  all: 'All time', '1w': '1 week', '2w': '2 weeks', '3w': '3 weeks', '1m': '1 month',
};

function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

// ─── Small components ─────────────────────────────────────────────────────────
function Chip({ label, active, color, onDelete, onClick }: {
  label: string; active: boolean; color?: string; onDelete?: () => void; onClick: () => void;
}) {
  const activeStyle = active && color ? { background: color, borderColor: color, color: '#fff' } : undefined;
  const baseClass = `px-2.5 py-1 text-xs font-semibold border transition-all whitespace-nowrap`;
  const stateClass = active && !color
    ? 'bg-primary text-white border-primary'
    : !active
    ? 'bg-white text-slate-500 border-slate-200 hover:border-primary hover:text-primary'
    : '';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={onClick}
        style={activeStyle}
        className={`${baseClass} ${stateClass} ${onDelete ? 'rounded-l-full border-r-0' : 'rounded-full'}`}
      >{label}</button>
      {onDelete && (
        <button
          title="Delete label"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={active && color
            ? { background: color, borderColor: color, color: '#fff' }
            : { background: '#f1f5f9', borderColor: '#e2e8f0', color: '#94a3b8' }}
          className="px-1.5 py-1 rounded-r-full text-xs font-bold border hover:opacity-70 transition-all whitespace-nowrap"
        >×</button>
      )}
    </span>
  );
}

function FilterRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-14 shrink-0">{title}</span>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: '#f1f5f9', borderRadius: 20, padding: '2px 7px', fontSize: 11, color: '#475569', fontWeight: 500 }}>
      {children}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Analytics() {
  const [pins, setPins]           = useState<CustomerPin[]>([]);
  const [loading, setLoading]     = useState(true);
  const [customLabelDefs, setCustomLabelDefs] = useState<LabelDef[]>([]);
  const [serviceZone, setServiceZone] = useState<[number, number][]>([]);

  // Filter states
  const [sex,         setSex]         = useState<SexFilter>('all');
  const [household,   setHousehold]   = useState<HouseholdFilter>('all');
  const [residence,   setResidence]   = useState<ResidenceFilter>('all');
  const [ageGroup,    setAgeGroup]    = useState<AgeGroupFilter>('all');
  const [joined,      setJoined]      = useState<JoinedFilter>('all');
  const [ordered,     setOrdered]     = useState<OrderedFilter>('all');
  const [labelFilter, setLabelFilter] = useState<string>('all');

  // Add-label form
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newEmoji,     setNewEmoji]     = useState('');
  const [newName,      setNewName]      = useState('');
  const [newColor,     setNewColor]     = useState('#6366f1');

  const allLabels = useMemo<LabelDef[]>(
    () => [...PRESET_LABELS, ...customLabelDefs],
    [customLabelDefs],
  );

  // Icon cache — rebuilds only when label defs change
  const iconCache = useMemo<Record<string, L.DivIcon>>(() => {
    const cache: Record<string, L.DivIcon> = {};
    for (const l of allLabels) cache[l.key] = makeDropIcon(l.color, l.emoji);
    return cache;
  }, [allLabels]);

  function getLabelDef(key: string | null): LabelDef | null {
    if (!key) return null;
    return allLabels.find(l => l.key === key) ?? null;
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, sex, age_group, family_status, residence_type, created_at')
      .or('is_admin.is.null,is_admin.eq.false');

    if (!profiles?.length) { setLoading(false); return; }

    const ids = profiles.map(p => p.id);

    const [
      { data: addresses },
      { data: recentOrders },
      { data: allOrders },
      { data: labelRows },
      { data: settingsRow },
      { data: zoneRow },
    ] = await Promise.all([
      // Every address per user (not just default)
      supabase.from('addresses')
        .select('id, user_id, lat, lng, full_address, label, is_default')
        .in('user_id', ids).not('lat', 'is', null),
      // Last-30-day orders for spend calculation
      supabase.from('orders').select('user_id, total')
        .in('user_id', ids).neq('status', 'cancelled')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      // All-time orders to determine hasOrdered (just user_id)
      supabase.from('orders').select('user_id')
        .in('user_id', ids).neq('status', 'cancelled'),
      supabase.from('customer_labels').select('customer_id, label').in('customer_id', ids),
      supabase.from('settings').select('value').eq('key', 'custom_label_defs').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'service_zone').maybeSingle(),
    ]);

    // Load persisted custom label definitions
    if (settingsRow?.value) {
      try {
        const parsed = JSON.parse(settingsRow.value);
        if (Array.isArray(parsed)) setCustomLabelDefs(parsed);
      } catch { /* ignore malformed JSON */ }
    }

    // Load service zone boundary
    if (zoneRow?.value) {
      try {
        const parsed = JSON.parse(zoneRow.value);
        if (Array.isArray(parsed)) setServiceZone(parsed);
      } catch {}
    }

    const spendMap: Record<string, number> = {};
    for (const o of recentOrders ?? []) spendMap[o.user_id] = (spendMap[o.user_id] ?? 0) + (o.total ?? 0);

    const orderedSet = new Set<string>((allOrders ?? []).map(o => o.user_id));

    const labelMap: Record<string, string> = {};
    for (const l of labelRows ?? []) labelMap[l.customer_id] = l.label;

    const profileMap: Record<string, typeof profiles[number]> = {};
    for (const p of profiles) profileMap[p.id] = p;

    const result: CustomerPin[] = [];
    for (const a of addresses ?? []) {
      const p = profileMap[a.user_id];
      if (!p) continue;
      result.push({
        addressId:      a.id,
        customerId:     p.id,
        full_name:      p.full_name,
        sex:            p.sex,
        age_group:      p.age_group,
        family_status:  p.family_status,
        residence_type: p.residence_type,
        lat:            parseFloat(a.lat),
        lng:            parseFloat(a.lng),
        full_address:   a.full_address,
        address_label:  a.label,
        is_default:     a.is_default,
        monthly_spend:  spendMap[p.id] ?? 0,
        hasOrdered:     orderedSet.has(p.id),
        created_at:     p.created_at,
        label:          labelMap[p.id] ?? null,
      });
    }

    setPins(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Custom label CRUD ─────────────────────────────────────────────────────
  async function persistCustomLabels(defs: LabelDef[]) {
    await supabase.from('settings').upsert({
      key: 'custom_label_defs',
      value: JSON.stringify(defs),
      updated_at: new Date().toISOString(),
    });
  }

  async function addCustomLabel() {
    if (!newName.trim()) return;
    const emoji = newEmoji.trim() || '🏷️';
    const key = `custom_${Date.now()}`;
    const def: LabelDef = { key, emoji, name: newName.trim(), color: newColor, bg: hexBg(newColor) };
    const next = [...customLabelDefs, def];
    setCustomLabelDefs(next);
    await persistCustomLabels(next);
    setNewName(''); setNewEmoji(''); setNewColor('#6366f1');
    setShowAddLabel(false);
  }

  async function deleteCustomLabel(key: string) {
    const next = customLabelDefs.filter(l => l.key !== key);
    setCustomLabelDefs(next);
    await persistCustomLabels(next);
    // Remove label from any customer that was tagged with it
    await supabase.from('customer_labels').delete().eq('label', key);
    setPins(prev => prev.map(p => p.label === key ? { ...p, label: null } : p));
    if (labelFilter === key) setLabelFilter('all');
  }

  // ── Label mutation ────────────────────────────────────────────────────────
  async function setLabel(customerId: string, labelKey: string | null) {
    if (labelKey === null) {
      await supabase.from('customer_labels').delete().eq('customer_id', customerId);
    } else {
      await supabase.from('customer_labels').upsert({ customer_id: customerId, label: labelKey });
    }
    setPins(prev => prev.map(p => p.customerId === customerId ? { ...p, label: labelKey } : p));
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => pins.filter(p => {
    if (sex !== 'all' && p.sex !== sex) return false;
    if (household !== 'all' && p.family_status !== household) return false;
    if (residence !== 'all' && p.residence_type !== residence) return false;
    if (ageGroup !== 'all' && p.age_group !== ageGroup) return false;
    if (joined !== 'all') {
      const days = joined === '1w' ? 7 : joined === '2w' ? 14 : joined === '3w' ? 21 : 30;
      if (daysAgo(p.created_at) > days) return false;
    }
    if (ordered === 'ordered'     && !p.hasOrdered) return false;
    if (ordered === 'not_ordered' &&  p.hasOrdered) return false;
    if (labelFilter === 'saved' && !p.label) return false;
    if (labelFilter !== 'all' && labelFilter !== 'saved' && p.label !== labelFilter) return false;
    return true;
  }), [pins, sex, household, residence, ageGroup, joined, ordered, labelFilter]);

  // Count unique customers (not pins) that have a label
  const savedCount = useMemo(() => {
    const seen = new Set<string>();
    for (const p of pins) if (p.label) seen.add(p.customerId);
    return seen.size;
  }, [pins]);

  const center: [number, number] = [21.4611, 39.9074];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 md:px-5 pt-3 md:pt-4 pb-3 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 md:gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Customer Map</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              <span className="font-semibold text-primary">{filtered.length}</span> / {pins.length} customers · spend = last 30 days
            </p>
          </div>

          {/* Label filter chips */}
          <div className="flex gap-2 items-center flex-wrap">
            <Chip label="All"       active={labelFilter === 'all'}   onClick={() => setLabelFilter('all')} />
            <Chip
              label={`📌 Saved${savedCount ? ` (${savedCount})` : ''}`}
              active={labelFilter === 'saved'} color="#64748b"
              onClick={() => setLabelFilter('saved')}
            />
            {PRESET_LABELS.map(l => (
              <Chip key={l.key} label={`${l.emoji} ${l.name}`}
                active={labelFilter === l.key} color={l.color}
                onClick={() => setLabelFilter(l.key)} />
            ))}
            {/* Custom labels — with × to delete the label definition */}
            {customLabelDefs.map(l => (
              <Chip key={l.key} label={`${l.emoji} ${l.name}`}
                active={labelFilter === l.key} color={l.color}
                onClick={() => setLabelFilter(l.key)}
                onDelete={() => deleteCustomLabel(l.key)} />
            ))}
            <button
              onClick={() => setShowAddLabel(v => !v)}
              className="px-2.5 py-1 rounded-full text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:border-primary hover:text-primary transition-all whitespace-nowrap"
            >⊕ New label</button>
          </div>
        </div>

        {/* Add-label inline form */}
        {showAddLabel && (
          <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Emoji</span>
              <input
                className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                placeholder="🏷️"
                value={newEmoji}
                onChange={e => setNewEmoji(e.target.value)}
                maxLength={4}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-32">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Label name</span>
              <input
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. Gold Member"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomLabel(); if (e.key === 'Escape') setShowAddLabel(false); }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color</span>
              <input type="color"
                className="w-10 h-9 border border-slate-200 rounded-lg cursor-pointer p-0.5"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
              />
            </div>
            <button
              onClick={addCustomLabel}
              disabled={!newName.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >Add</button>
            <button
              onClick={() => setShowAddLabel(false)}
              className="px-3 py-2 text-slate-400 hover:text-slate-600 text-sm rounded-lg"
            >Cancel</button>
            {/* Live preview */}
            {newName.trim() && (
              <span style={{
                background: hexBg(newColor), color: newColor,
                border: `1.5px solid ${newColor}`, borderRadius: 20,
                padding: '3px 10px', fontSize: 12, fontWeight: 700,
              }}>
                {newEmoji || '🏷️'} {newName}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Filters ── (capped + scrollable on mobile so the map keeps usable height) */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex-shrink-0 flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto md:max-h-none md:overflow-visible">
        <div className="flex flex-wrap gap-3">
          <FilterRow title="Gender">
            {(['all', 'male', 'female'] as SexFilter[]).map(v => (
              <Chip key={v} label={v === 'all' ? 'All' : v === 'male' ? '👨 Male' : '👩 Female'}
                active={sex === v} onClick={() => setSex(v)} />
            ))}
          </FilterRow>
          <FilterRow title="House">
            {(['all', 'single', 'family', 'business'] as HouseholdFilter[]).map(v => (
              <Chip key={v}
                label={v === 'all' ? 'All' : v === 'single' ? '🧍 Single' : v === 'family' ? '👨‍👩‍👧 Family' : '🏢 Business'}
                active={household === v} onClick={() => setHousehold(v)} />
            ))}
          </FilterRow>
          <FilterRow title="Res.">
            {(['all', 'temporary', 'permanent'] as ResidenceFilter[]).map(v => (
              <Chip key={v} label={v === 'all' ? 'All' : v === 'temporary' ? '🧳 Temp' : '🏠 Perm'}
                active={residence === v} onClick={() => setResidence(v)} />
            ))}
          </FilterRow>
        </div>
        <div className="flex flex-wrap gap-3">
          <FilterRow title="Age">
            {(Object.keys(AGE_GROUP_LABELS) as AgeGroupFilter[]).map(v => (
              <Chip key={v} label={AGE_GROUP_LABELS[v]} active={ageGroup === v} onClick={() => setAgeGroup(v)} />
            ))}
          </FilterRow>
          <FilterRow title="Joined">
            {(Object.keys(JOINED_LABELS) as JoinedFilter[]).map(v => (
              <Chip key={v} label={JOINED_LABELS[v]} active={joined === v} onClick={() => setJoined(v)} />
            ))}
          </FilterRow>
        </div>
        <FilterRow title="Orders">
          <Chip label="All"             active={ordered === 'all'}         onClick={() => setOrdered('all')} />
          <Chip label="✅ Has ordered"   active={ordered === 'ordered'}     onClick={() => setOrdered('ordered')} />
          <Chip label="🆕 No orders yet" active={ordered === 'not_ordered'} onClick={() => setOrdered('not_ordered')} />
        </FilterRow>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Loading customer data…</p>
            </div>
          </div>
        )}

        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <MapResizer />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Service zone boundary overlay */}
          {serviceZone.length >= 3 && (
            <Polygon
              positions={serviceZone}
              pathOptions={{ color: '#2D9B8A', weight: 2.5, fillColor: '#2D9B8A', fillOpacity: 0.08, dashArray: '6 4' }}
            />
          )}

          {filtered.map(pin => {
            const lDef = getLabelDef(pin.label);
            const icon = lDef && iconCache[pin.label!] ? iconCache[pin.label!] : defaultIcon;

            return (
              <Marker key={pin.addressId} position={[pin.lat, pin.lng]} icon={icon}>
                {/* Always-visible spend bubble — no click needed */}
                <Tooltip permanent direction="right" offset={[-10, -14]} opacity={1} className="spend-bubble">
                  <span style={{
                    fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                    color: pin.monthly_spend > 0 ? '#15803d' : '#94a3b8',
                  }}>
                    {pin.monthly_spend > 0 ? `$${pin.monthly_spend.toFixed(0)} SAR` : '$0 SAR'}
                  </span>
                </Tooltip>

                {/* Click popup */}
                <Popup maxWidth={270} minWidth={230}>
                  <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                    {/* Name + label badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1e293b' }}>
                        {pin.full_name ?? 'Unknown'}
                      </p>
                      {lDef && (
                        <span style={{ background: lDef.bg, color: lDef.color, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px' }}>
                          {lDef.emoji} {lDef.name}
                        </span>
                      )}
                    </div>

                    {/* Address */}
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>
                      📍 {pin.address_label && (
                        <span style={{ fontWeight: 700, color: '#334155' }}>
                          {pin.address_label}
                          {pin.is_default && <span style={{ color: '#16a34a' }}> ★</span>}
                          {' · '}
                        </span>
                      )}
                      {pin.full_address ?? `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`}
                    </p>

                    {/* Spend */}
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                      padding: '6px 12px', marginBottom: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Monthly Spend</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>
                        {pin.monthly_spend.toFixed(0)} SAR
                      </span>
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                      {pin.sex && <Tag>{pin.sex === 'male' ? '👨 Male' : '👩 Female'}</Tag>}
                      {pin.family_status && (
                        <Tag>
                          {pin.family_status === 'single' ? '🧍 Single'
                            : pin.family_status === 'family' ? '👨‍👩‍👧 Family'
                            : '🏢 Business'}
                        </Tag>
                      )}
                      {pin.residence_type && <Tag>{pin.residence_type === 'temporary' ? '🧳 Temp' : '🏠 Perm'}</Tag>}
                      {pin.age_group && <Tag>🎂 {AGE_GROUP_LABELS[pin.age_group as AgeGroupFilter]}</Tag>}
                      <Tag>{pin.hasOrdered ? '✅ Has ordered' : '🆕 No orders yet'}</Tag>
                      <Tag>📅 {daysAgo(pin.created_at)}d ago</Tag>
                    </div>

                    {/* Label picker — preset + custom */}
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
                        Tag this customer
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {allLabels.map(l => (
                          <button
                            key={l.key}
                            onClick={() => setLabel(pin.customerId, pin.label === l.key ? null : l.key)}
                            style={{
                              background: pin.label === l.key ? l.color : l.bg,
                              color: pin.label === l.key ? '#fff' : l.color,
                              border: `1.5px solid ${l.color}`,
                              borderRadius: 20, padding: '3px 9px',
                              fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              transition: 'all .15s',
                            }}
                          >
                            {l.emoji} {l.name}
                          </button>
                        ))}
                        {pin.label && (
                          <button
                            onClick={() => setLabel(pin.customerId, null)}
                            style={{ background: '#f1f5f9', color: '#94a3b8', border: '1.5px solid #e2e8f0', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ✕ Remove tag
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {!loading && filtered.length === 0 && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-lg px-8 py-6 text-center">
              <p className="text-3xl mb-2">{pins.length === 0 ? '📍' : '🔍'}</p>
              <p className="font-semibold text-slate-700">
                {pins.length === 0 ? 'No customers with saved addresses yet' : 'No customers match these filters'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {pins.length === 0
                  ? 'Customers appear here once they pin their location in the app'
                  : 'Try removing one or more filters'}
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .spend-bubble.leaflet-tooltip {
          background: white !important;
          border: 1.5px solid #bbf7d0 !important;
          border-radius: 20px !important;
          padding: 2px 6px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.18) !important;
          white-space: nowrap !important;
        }
        .spend-bubble.leaflet-tooltip::before { display: none !important; }
      `}</style>
    </div>
  );
}
