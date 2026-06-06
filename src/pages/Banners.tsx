import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const LINK_ROUTES = [
  { label: 'No link (decorative)', value: '' },
  { label: '👕 Services (price list)', value: '/services' },
  { label: '🧺 Unsorted ordering', value: '/services/unsorted' },
  { label: '🎁 Bundles', value: '/bundles' },
  { label: '📋 My Orders', value: '/(tabs)/orders' },
  { label: '👛 Wallet', value: '/(tabs)/wallet' },
  { label: '👤 Account / Settings', value: '/(tabs)/account' },
  { label: '📍 Addresses', value: '/address' },
  { label: '💬 Support', value: '/support' },
  { label: '🛒 Cart', value: '/cart' },
];

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_route: string | null;
  sort_order: number;
  is_active: boolean;
}

interface BannerForm {
  title: string;
  image_url: string;
  link_route: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: BannerForm = {
  title: '',
  image_url: '',
  link_route: '',
  sort_order: '0',
  is_active: true,
};

async function uploadBannerImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('banners').upload(path, file, { upsert: true });
  if (error) { console.error('Upload error:', error); return null; }
  return `${SUPABASE_URL}/storage/v1/object/public/banners/${path}`;
}

function ImageUploader({ current, onChange }: { current: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadBannerImage(file);
    setUploading(false);
    if (url) onChange(url);
  }

  return (
    <div className="flex items-center gap-3">
      {current ? (
        <div className="relative">
          <img src={current} alt="preview" className="h-16 w-32 object-cover rounded-lg border border-gray-200" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
          >×</button>
        </div>
      ) : (
        <div
          onClick={() => ref.current?.click()}
          className="h-16 w-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary text-gray-400 text-xs text-center px-2"
        >
          {uploading ? 'Uploading...' : '📁 Upload image'}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

export default function Banners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true });
    setBanners(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    const nextOrder = banners.length > 0
      ? Math.max(...banners.map(b => b.sort_order)) + 1
      : 0;
    setForm({ ...EMPTY_FORM, sort_order: String(nextOrder) });
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(b: Banner) {
    setForm({
      title: b.title,
      image_url: b.image_url,
      link_route: b.link_route ?? '',
      sort_order: String(b.sort_order),
      is_active: b.is_active,
    });
    setEditingId(b.id);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.image_url) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      image_url: form.image_url,
      link_route: form.link_route || null,
      sort_order: parseInt(form.sort_order, 10) || 0,
      is_active: form.is_active,
    };
    if (editingId) {
      await supabase.from('banners').update(payload).eq('id', editingId);
    } else {
      await supabase.from('banners').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function handleDelete(b: Banner) {
    if (!confirm(`Delete banner "${b.title}"?`)) return;
    const storagePath = b.image_url.split('/banners/')[1];
    if (storagePath) await supabase.storage.from('banners').remove([storagePath]);
    await supabase.from('banners').delete().eq('id', b.id);
    load();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🖼️ Banners</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage the home screen image slider</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-primary text-white px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          + Add Banner
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No banners yet. Add one above.</div>
      ) : (
        <div className="space-y-3">
          {banners.map(b => (
            <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
              <img
                src={b.image_url}
                alt={b.title}
                className="w-24 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{b.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {b.link_route ? `→ ${b.link_route}` : 'No link'}
                  {' · '}order {b.sort_order}
                </p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {b.is_active ? 'Active' : 'Hidden'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(b)}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleDelete(b)}
                  className="text-sm px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">
              {editingId ? 'Edit Banner' : 'Add Banner'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Admin label</label>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="e.g. Summer Promo"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Image</label>
                <div className="mt-1">
                  <ImageUploader
                    current={form.image_url}
                    onChange={url => setForm(f => ({ ...f, image_url: url }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Opens screen (optional)</label>
                <select
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={form.link_route}
                  onChange={e => setForm(f => ({ ...f, link_route: e.target.value }))}
                >
                  {LINK_ROUTES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Order (lower = first)</label>
                <input
                  type="number"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Visible in app</span>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    form.is_active ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    form.is_active ? 'left-5' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.image_url}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Banner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
