import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, StaffRole } from '../types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  roles: StaffRole[];
  isAdmin: boolean;
  isDelivery: boolean;
  isCleaner: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  isDelivery: false,
  isCleaner: false,
  loading: true,
  signOut: async () => {},
  updateProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfileAndRoles(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session?.user) fetchProfileAndRoles(session.user.id);
      else { setProfile(null); setRoles([]); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfileAndRoles(userId: string) {
    const [{ data: profileData }, { data: rolesData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);
    setProfile(profileData as Profile | null);
    setRoles((rolesData ?? []).map((r: any) => r.role as StaffRole));
    setLoading(false);
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!profile) return;
    await supabase.from('profiles').update(updates).eq('id', profile.id);
    setProfile({ ...profile, ...updates });
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // ignore network errors — clear local state regardless
    }
    setSession(null);
    setProfile(null);
    setRoles([]);
  }

  const isAdmin = roles.includes('admin');
  const isDelivery = roles.includes('delivery_man');
  const isCleaner = roles.includes('cleaner');

  return (
    <AuthContext.Provider value={{ session, profile, roles, isAdmin, isDelivery, isCleaner, loading, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
