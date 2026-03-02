import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Category } from '../types';

type EditingPrice = { id: string; field: 'wash_price' | 'iron_price' | 'wash_iron_price'; value: string };
type CatalogTab = 'items' | 'categories';

const CATEGORY_TYPES = [
  { value: 'clothes_men', label: 'ملابس رجالي / Men Clothes' },
  { value: 'clothes_women', label: 'ملابس نسائي / Women Clothes' },
  { value: 'rugs', label: 'سجاد / Rugs' },
  { value: 'blankets', label: 'بطانيات / Blankets' },
  { value: 'premium', label: 'بريميوم / Premium' },
];

interface ItemForm {
  name_ar: string;
  name_en: string;
  category_id: string;
  wash_price: string;
  iron_price: string;
  wash_iron_price: string;
  image_url: string;
  sort_order: string;
}

interface CategoryForm {
  name_ar: string;
  name_en: string;
  type: string;
  image_url: string;
  sort_order: string;
}

const EMPTY_ITEM_FORM: ItemForm = {
  name_ar: '', name_en: '', category_id: '', wash_price: '0', iron_price: '0', wash_iron_price: '0', image_url: '', sort_order: '0',
};

const EMPTY_CAT_FORM: CategoryForm = {
  name_ar: '', name_en: '', type: 'clothes_men', image_url: '', sort_order: '0',
};

export default function Catalog() {
  const [tab, setTab] = useState<CatalogTab>('items');
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [editingPrice, setEditingPrice] = useState<EditingPrice | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Item modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM);
  const [itemError, setItemError] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);

  // Category modal
  const [showAddCat, setShowAddCat] = useState(false);
  const [catForm, setCatForm] = useState<CategoryForm>(EMPTY_CAT_FORM);
  const [catError, setCatError] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: cats }, { data: itms }] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('items').select('*, categories!category_id(name_ar, name_en)').order('sort_order'),
    ]);
    setCategories(cats ?? []);
    setItems((itms ?? []) as Item[]);
    setLoading(false);
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  async function toggleItem(id: string, is_active: boolean) {
    await supabase.from('items').update({ is_active: !is_active }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !is_active } : i));
  }

  async function savePrice() {
    if (!editingPrice) return;
    const val = parseFloat(editingPrice.value);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    await supabase.from('items').update({ [editingPrice.field]: val }).eq('id', editingPrice.id);
    setItems(prev => prev.map(i => i.id === editingPrice.id ? { ...i, [editingPrice.field]: val } : i));
    setEditingPrice(null);
    setSaving(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    setBusy(`item-${id}`);
    await supabase.from('items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
    setBusy(null);
  }

  async function handleCreateItem() {
    if (!itemForm.name_ar.trim() || !itemForm.name_en.trim() || !itemForm.category_id) {
      setItemError('Please fill in Arabic name, English name, and select a category.');
      return;
    }
    setCreatingItem(true);
    setItemError('');
    const { error } = await supabase.from('items').insert({
      name_ar: itemForm.name_ar.trim(),
      name_en: itemForm.name_en.trim(),
      category_id: itemForm.category_id,
      wash_price: parseFloat(itemForm.wash_price) || 0,
      iron_price: parseFloat(itemForm.iron_price) || 0,
      wash_iron_price: parseFloat(itemForm.wash_iron_price) || 0,
      image_url: itemForm.image_url.trim() || null,
      sort_order: parseInt(itemForm.sort_order) || 0,
      is_active: true,
      order_count: 0,
    });
    if (error) {
      setItemError(error.message);
      setCreatingItem(false);
      return;
    }
    setShowAddItem(false);
    setItemForm(EMPTY_ITEM_FORM);
    setCreatingItem(false);
    await loadData();
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async function toggleCategory(id: string, is_active: boolean) {
    await supabase.from('categories').update({ is_active: !is_active }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: !is_active } : c));
  }

  async function deleteCategory(id: string) {
    const hasItems = items.some(i => i.category_id === id);
    if (hasItems) {
      alert('This category still has items. Delete or move all items first.');
      return;
    }
    if (!confirm('Delete this category? This cannot be undone.')) return;
    setBusy(`cat-${id}`);
    await supabase.from('categories').delete().eq('id', id);
    setCategories(prev => prev.filter(c => c.id !== id));
    setBusy(null);
  }

  async function handleCreateCategory() {
    if (!catForm.name_ar.trim() || !catForm.name_en.trim() || !catForm.type) {
      setCatError('Please fill in all name fields and select a type.');
      return;
    }
    setCreatingCat(true);
    setCatError('');
    const { error } = await supabase.from('categories').insert({
      name_ar: catForm.name_ar.trim(),
      name_en: catForm.name_en.trim(),
      type: catForm.type,
      image_url: catForm.image_url.trim() || null,
      sort_order: parseInt(catForm.sort_order) || 0,
      is_active: true,
    });
    if (error) {
      setCatError(error.message);
      setCreatingCat(false);
      return;
    }
    setShowAddCat(false);
    setCatForm(EMPTY_CAT_FORM);
    setCreatingCat(false);
    await loadData();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredItems = items.filter(i => {
    const matchCat = filterCat === 'all' || i.category_id === filterCat;
    const matchSearch = !search || i.name_ar.includes(search) || i.name_en.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} items · {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAddCat(true); setCatError(''); }}
            className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-xl text-sm font-semibold hover:bg-primary/5 transition-colors"
          >
            + Category
          </button>
          <button
            onClick={() => { setShowAddItem(true); setItemError(''); setItemForm({ ...EMPTY_ITEM_FORM, category_id: categories[0]?.id ?? '' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('items')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'items' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
        >
          Items ({items.length})
        </button>
        <button
          onClick={() => setTab('categories')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'categories' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
        >
          Categories ({categories.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'items' ? (
        /* ── ITEMS TAB ── */
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <input
              className="input w-56"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="input w-52" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name_ar} / {c.name_en}</option>
              ))}
            </select>
          </div>

          {/* Category chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCat('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterCat === 'all' ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary'}`}
            >
              All ({items.length})
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setFilterCat(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterCat === c.id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary hover:text-primary'}`}
              >
                {c.name_ar} ({items.filter(i => i.category_id === c.id).length})
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">Item</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Wash (SAR)</th>
                    <th className="table-th">Iron (SAR)</th>
                    <th className="table-th">Wash+Iron (SAR)</th>
                    <th className="table-th">🔥 Orders</th>
                    <th className="table-th">Active</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredItems.map(item => {
                    const cat = item.categories as any;
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}>
                        <td className="table-td">
                          <div className="flex items-center gap-2.5">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name_en} className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0">👕</div>
                            )}
                            <div>
                              <div className="font-medium text-gray-900">{item.name_ar}</div>
                              <div className="text-xs text-gray-400">{item.name_en}</div>
                            </div>
                          </div>
                        </td>
                        <td className="table-td text-xs text-gray-500">{cat?.name_ar ?? '—'}</td>

                        {(['wash_price', 'iron_price', 'wash_iron_price'] as const).map(field => (
                          <td key={field} className="table-td">
                            {editingPrice?.id === item.id && editingPrice.field === field ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  className="input w-20 py-1 px-2 text-sm"
                                  value={editingPrice.value}
                                  onChange={e => setEditingPrice({ ...editingPrice, value: e.target.value })}
                                  onKeyDown={e => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') setEditingPrice(null); }}
                                  autoFocus
                                />
                                <button onClick={savePrice} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">✓</button>
                                <button onClick={() => setEditingPrice(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingPrice({ id: item.id, field, value: String(item[field]) })}
                                className="font-semibold text-gray-700 hover:text-primary hover:underline"
                              >
                                {item[field]}
                              </button>
                            )}
                          </td>
                        ))}

                        <td className="table-td">
                          <span className={`text-sm font-bold ${item.order_count > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {item.order_count > 0 ? `🔥 ${item.order_count}` : '—'}
                          </span>
                        </td>
                        <td className="table-td">
                          <button
                            onClick={() => toggleItem(item.id, item.is_active)}
                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${item.is_active ? 'bg-primary' : 'bg-gray-200'}`}
                          >
                            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${item.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="table-td">
                          <button
                            onClick={() => deleteItem(item.id)}
                            disabled={busy === `item-${item.id}`}
                            className="text-red-400 hover:text-red-600 transition-colors text-sm disabled:opacity-50"
                            title="Delete item"
                          >
                            {busy === `item-${item.id}` ? '...' : '🗑'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr><td colSpan={8} className="table-td text-center text-gray-400 py-12">No items found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400">💡 Click any price to edit inline. Press Enter to save. 🔥 = order count (الأكثر طلباً)</p>
        </>
      ) : (
        /* ── CATEGORIES TAB ── */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">Category</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Sort</th>
                  <th className="table-th">Items</th>
                  <th className="table-th">Active</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map(cat => (
                  <tr key={cat.id} className={`hover:bg-gray-50 transition-colors ${!cat.is_active ? 'opacity-50' : ''}`}>
                    <td className="table-td">
                      <div className="flex items-center gap-2.5">
                        {cat.image_url ? (
                          <img src={cat.image_url} alt={cat.name_en} className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-base shrink-0">📂</div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{cat.name_ar}</div>
                          <div className="text-xs text-gray-400">{cat.name_en}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-td text-xs text-gray-500">
                      {CATEGORY_TYPES.find(t => t.value === cat.type)?.label ?? cat.type}
                    </td>
                    <td className="table-td text-sm text-gray-500">{cat.sort_order}</td>
                    <td className="table-td text-sm text-gray-600 font-semibold">
                      {items.filter(i => i.category_id === cat.id).length}
                    </td>
                    <td className="table-td">
                      <button
                        onClick={() => toggleCategory(cat.id, cat.is_active)}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${cat.is_active ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${cat.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="table-td">
                      <button
                        onClick={() => deleteCategory(cat.id)}
                        disabled={busy === `cat-${cat.id}`}
                        className="text-red-400 hover:text-red-600 transition-colors text-sm disabled:opacity-50"
                        title="Delete category"
                      >
                        {busy === `cat-${cat.id}` ? '...' : '🗑'}
                      </button>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={6} className="table-td text-center text-gray-400 py-12">No categories yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ADD ITEM MODAL ── */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add New Item</h2>
              <button onClick={() => setShowAddItem(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arabic Name *</label>
                  <input
                    autoFocus
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="مثال: قميص"
                    value={itemForm.name_ar}
                    onChange={e => setItemForm(f => ({ ...f, name_ar: e.target.value }))}
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">English Name *</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. Shirt"
                    value={itemForm.name_en}
                    onChange={e => setItemForm(f => ({ ...f, name_en: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={itemForm.category_id}
                  onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))}
                >
                  <option value="">Select a category...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name_ar} / {c.name_en}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Wash (SAR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    value={itemForm.wash_price}
                    onChange={e => setItemForm(f => ({ ...f, wash_price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Iron (SAR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    value={itemForm.iron_price}
                    onChange={e => setItemForm(f => ({ ...f, iron_price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Wash+Iron (SAR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    value={itemForm.wash_iron_price}
                    onChange={e => setItemForm(f => ({ ...f, wash_iron_price: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input
                  type="url"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="https://..."
                  value={itemForm.image_url}
                  onChange={e => setItemForm(f => ({ ...f, image_url: e.target.value }))}
                />
                {itemForm.image_url && (
                  <img src={itemForm.image_url} alt="preview" className="mt-2 h-16 w-16 object-cover rounded-lg border border-gray-100" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={itemForm.sort_order}
                  onChange={e => setItemForm(f => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
            </div>

            {itemError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{itemError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAddItem(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateItem}
                disabled={creatingItem}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingItem ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CATEGORY MODAL ── */}
      {showAddCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add New Category</h2>
              <button onClick={() => setShowAddCat(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arabic Name *</label>
                  <input
                    autoFocus
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="مثال: قمصان"
                    value={catForm.name_ar}
                    onChange={e => setCatForm(f => ({ ...f, name_ar: e.target.value }))}
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">English Name *</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    placeholder="e.g. Shirts"
                    value={catForm.name_en}
                    onChange={e => setCatForm(f => ({ ...f, name_en: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={catForm.type}
                  onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))}
                >
                  {CATEGORY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input
                  type="url"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="https://..."
                  value={catForm.image_url}
                  onChange={e => setCatForm(f => ({ ...f, image_url: e.target.value }))}
                />
                {catForm.image_url && (
                  <img src={catForm.image_url} alt="preview" className="mt-2 h-16 w-16 object-cover rounded-lg border border-gray-100" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={catForm.sort_order}
                  onChange={e => setCatForm(f => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
            </div>

            {catError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{catError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAddCat(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={creatingCat}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingCat ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
