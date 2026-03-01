import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Item, Category } from '../types';

type EditingItem = { id: string; field: 'wash_price' | 'iron_price' | 'wash_iron_price'; value: string };

export default function Catalog() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [editing, setEditing] = useState<EditingItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

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

  async function toggleItem(id: string, is_active: boolean) {
    await supabase.from('items').update({ is_active: !is_active }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !is_active } : i));
  }

  async function savePrice() {
    if (!editing) return;
    const val = parseFloat(editing.value);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    await supabase.from('items').update({ [editing.field]: val }).eq('id', editing.id);
    setItems(prev => prev.map(i => i.id === editing.id ? { ...i, [editing.field]: val } : i));
    setEditing(null);
    setSaving(false);
  }

  const filtered = items.filter(i => {
    const matchCat = filterCat === 'all' || i.category_id === filterCat;
    const matchSearch = !search || i.name_ar.includes(search) || i.name_en.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} items across {categories.length} categories</p>
        </div>
        <button onClick={loadData} className="btn-ghost">🔄 Refresh</button>
      </div>

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
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">Item</th>
                  <th className="table-th">Category</th>
                  <th className="table-th">Wash (SAR)</th>
                  <th className="table-th">Iron (SAR)</th>
                  <th className="table-th">Wash+Iron (SAR)</th>
                  <th className="table-th">Orders</th>
                  <th className="table-th">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(item => {
                  const cat = item.categories as any;
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}>
                      <td className="table-td">
                        <div className="font-medium text-gray-900">{item.name_ar}</div>
                        <div className="text-xs text-gray-400">{item.name_en}</div>
                      </td>
                      <td className="table-td text-xs text-gray-500">{cat?.name_ar ?? '—'}</td>

                      {(['wash_price', 'iron_price', 'wash_iron_price'] as const).map(field => (
                        <td key={field} className="table-td">
                          {editing?.id === item.id && editing.field === field ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                className="input w-20 py-1 px-2 text-sm"
                                value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') savePrice(); if (e.key === 'Escape') setEditing(null); }}
                                autoFocus
                              />
                              <button onClick={savePrice} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">✓</button>
                              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditing({ id: item.id, field, value: String(item[field]) })}
                              className="font-semibold text-gray-700 hover:text-primary hover:underline"
                            >
                              {item[field]}
                            </button>
                          )}
                        </td>
                      ))}

                      <td className="table-td text-gray-500">{item.order_count}</td>
                      <td className="table-td">
                        <button
                          onClick={() => toggleItem(item.id, item.is_active)}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${item.is_active ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${item.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="table-td text-center text-gray-400 py-12">No items found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">💡 Click any price to edit inline. Press Enter to save.</p>
    </div>
  );
}
