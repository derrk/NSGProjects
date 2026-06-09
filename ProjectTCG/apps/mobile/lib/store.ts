import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));

interface ScanState {
  activeMode: 'inventory' | 'trade_in' | 'buylist' | 'retail_pricing' | null;
  setActiveMode: (mode: ScanState['activeMode']) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  activeMode: null,
  setActiveMode: (activeMode) => set({ activeMode }),
}));
