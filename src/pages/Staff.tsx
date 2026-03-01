import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StaffProfile, StaffRole } from '../types';

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: '🛡️ Admin',
  delivery_man: '🚗 Delivery Man',
  cleaner: '🧺 Cleaner',
};

const ROLE_COLORS: Record<StaffRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  delivery_man: 'bg-blue-100 text-blue-700',
  cleaner: 'bg-teal-100 text-teal-700',
};

const ALL_ROLES: StaffRole[] = ['delivery_man', 'cleaner', 'admin'];

interface CreateForm {
  name: string;
  email: string;
  password: string;
  roles: StaffRole[];
}

export default function Staff() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Create staff modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState<CreateForm>({ name: '', email: '', password: '', roles: ['delivery_man'] });

  // Edit name inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => { loadStaff(); }, []);

  async function loadStaff() {
    setLoading(true);
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, role, profiles!user_id(id, full_name, phone)');

    if (!data) { setLoading(false); return; }

    const map = new Map<string, StaffProfile>();
    for (const row of data) {
      const p = (row as any).profiles;
      if (!p) continue;
      const existing = map.get(p.id);
      if (existing) {
        existing.roles.push(row.role as StaffRole);
      } else {
        map.set(p.id, { id: p.id, full_name: p.full_name, phone: p.phone, roles: [row.role as StaffRole] });
      }
    }
    setStaff(Array.from(map.values()));
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim() || form.roles.length === 0) {
      setCreateError('Please fill in all fields and select at least one role.');
      return;
    }
    if (form.password.length < 6) {
      setCreateError('Password must be at least 6 characters.');
      return;
    }
    setCreating(true);
    setCreateError('');

    const { data, error } = await supabase.functions.invoke('create-staff', {
      body: { name: form.name.trim(), email: form.email.trim(), password: form.password.trim(), roles: form.roles },
    });

    if (error || data?.error) {
      setCreateError(data?.error ?? error?.message ?? 'Failed to create staff member.');
      setCreating(false);
      return;
    }

    setShowCreate(false);
    setForm({ name: '', email: '', password: '', roles: ['delivery_man'] });
    setCreating(false);
    await loadStaff();
  }

  async function toggleRole(userId: string, role: StaffRole, hasRole: boolean) {
    setBusy(`${userId}-${role}`);
    if (hasRole) {
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role);
    } else {
      await supabase.from('user_roles').insert({ user_id: userId, role });
    }
    await loadStaff();
    setBusy(null);
  }

  async function removeStaff(userId: string) {
    if (!confirm('Remove this staff member? They will lose all access to the dashboard.')) return;
    setBusy(`remove-${userId}`);
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await loadStaff();
    setBusy(null);
  }

  async function saveEditName() {
    if (!editingId || !editName.trim()) return;
    setSavingName(true);
    await supabase.from('profiles').update({ full_name: editName.trim() }).eq('id', editingId);
    setEditingId(null);
    setSavingName(false);
    await loadStaff();
  }

  function toggleFormRole(role: StaffRole) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create and manage staff accounts and roles</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm"
        >
          <span className="text-lg leading-none">+</span> Add Staff
        </button>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Current Staff ({staff.length})</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm">No staff members yet. Click "Add Staff" to create one.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {staff.map(member => (
              <div key={member.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    {editingId === member.id ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          autoFocus
                          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-primary"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') setEditingId(null); }}
                        />
                        <button
                          onClick={saveEditName}
                          disabled={savingName}
                          className="text-xs px-2 py-1 bg-primary text-white rounded-lg font-semibold disabled:opacity-50"
                        >
                          {savingName ? '...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-gray-900">
                          {member.full_name || <span className="text-gray-400 italic text-sm">No name set</span>}
                        </span>
                        <button
                          onClick={() => { setEditingId(member.id); setEditName(member.full_name ?? ''); }}
                          className="text-xs text-gray-300 hover:text-primary transition-colors"
                          title="Edit name"
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                    {member.phone && <div className="text-sm text-gray-500">{member.phone}</div>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {member.roles.map(r => (
                        <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ROLE_COLORS[r]}`}>
                          {ROLE_LABELS[r]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Role toggles + remove */}
                  <div className="flex flex-col gap-1.5 items-end shrink-0">
                    <div className="flex flex-col gap-1.5">
                      {ALL_ROLES.map(role => {
                        const has = member.roles.includes(role);
                        const isBusy = busy === `${member.id}-${role}`;
                        return (
                          <label key={role} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={!!busy}
                              onChange={() => toggleRole(member.id, role, has)}
                              className="w-4 h-4 accent-primary"
                            />
                            <span className="text-xs text-gray-600 w-24">{isBusy ? '...' : ROLE_LABELS[role]}</span>
                          </label>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => removeStaff(member.id)}
                      disabled={!!busy}
                      className="mt-1 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      {busy === `remove-${member.id}` ? 'Removing...' : '🗑 Remove'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Login info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">ℹ️ How staff log in</p>
        <p>Staff use this same URL with the email and password you set. Delivery staff see their pickup &amp; delivery jobs; cleaners see their cleaning queue.</p>
      </div>

      {/* Create Staff Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Create Staff Account</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="e.g. Ahmed Al-Rashidi"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (used to log in)</label>
                <input
                  type="email"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="staff@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="Minimum 6 characters"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role(s)</label>
                <div className="space-y-2">
                  {ALL_ROLES.map(role => (
                    <label key={role} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={form.roles.includes(role)}
                        onChange={() => toggleFormRole(role)}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ROLE_COLORS[role]}`}>
                        {ROLE_LABELS[role]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {role === 'delivery_man' && 'Sees pickup & delivery jobs'}
                        {role === 'cleaner' && 'Sees assigned cleaning queue'}
                        {role === 'admin' && 'Full dashboard access'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {createError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
