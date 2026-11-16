import { create } from 'zustand';

// Basic business info only — see src/app/api/business/route.ts for why
// the deeper AI/competitor-analysis config isn't part of this.
export interface BusinessInfo {
  id: string;
  name: string;
  website_url: string | null;
  logo_asset_id: string | null;
  industry: string | null;
}

interface BusinessState {
  business: BusinessInfo | null;
  isLoading: boolean;
  error: string | null;
  setBusiness: (business: BusinessInfo) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// Not persisted — refetched on every app load/login so it never shows
// stale data left over from a previous session.
export const useBusinessStore = create<BusinessState>()((set) => ({
  business: null,
  isLoading: false,
  error: null,
  setBusiness: (business) => set({ business, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ business: null, isLoading: false, error: null }),
}));
