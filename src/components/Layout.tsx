import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, roles, isAdmin, isDelivery, isCleaner, signOut, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    await updateProfile({ full_name: nameInput.trim() });
    setSavingName(false);
    setEditingName(false);
  }

  const adminNav = [
    { to: '/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/orders',    icon: '📋', label: 'Orders' },
    { to: '/customers', icon: '👥', label: 'Customers' },
    { to: '/catalog',   icon: '👕', label: 'Catalog' },
    { to: '/staff',     icon: '👤', label: 'Staff' },
    { to: '/receipts',  icon: '🧾', label: 'Receipts' },
    { to: '/support',   icon: '💬', label: 'Support' },
  ];

  const navItems = isAdmin ? adminNav : [
    ...(isDelivery ? [{ to: '/delivery', icon: '🚗', label: 'My Deliveries' }] : []),
    ...(isCleaner  ? [{ to: '/cleaner',  icon: '🧺', label: 'My Cleanings'  }] : []),
  ];

  const roleLabels: Record<string, string> = {
    admin: 'Admin', delivery_man: 'Delivery', cleaner: 'Cleaner',
  };

  const sidebar = (
    <aside className="w-60 flex-shrink-0 bg-slate-900 flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-lg">T</div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Tollen</p>
            <p className="text-xs text-slate-400">Staff Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + roles + sign out */}
      <div className="px-4 py-4 border-t border-slate-700">
        {editingName ? (
          <div className="mb-2">
            <input
              autoFocus
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary mb-1.5"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              placeholder="Your name..."
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="flex-1 text-xs py-1 bg-primary text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {savingName ? '...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-xs px-2 py-1 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 mb-1 group">
            <p className="text-xs text-slate-300 font-medium truncate flex-1">
              {profile?.full_name ?? profile?.phone ?? 'Staff'}
            </p>
            <button
              onClick={() => { setNameInput(profile?.full_name ?? ''); setEditingName(true); }}
              className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 text-xs"
              title="Edit name"
            >
              ✏️
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-1 mb-3">
          {roles.map(r => (
            <span key={r} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
              {roleLabels[r] ?? r}
            </span>
          ))}
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-sm text-slate-400 hover:text-red-400 transition-colors py-1"
        >
          🚪 Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        {sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 h-full">
            {sidebar}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-white font-bold text-sm">T</div>
            <span className="text-white font-bold text-sm">Tollen Staff</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-300 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
