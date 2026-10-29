import { create } from 'zustand';

export interface BusinessService {
  name: string;
  /** Optional — lets AI-facing features (e.g. Outreach draft generation)
   * know what this service actually means for this business, not just its
   * bare name. Nothing requires filling it in. */
  description?: string | null;
}

export interface OutreachSettings {
  daily_limit: number;
  timezone: string;
  days: number[];
  send_window: { from: string; to: string };
}

// Basic business info only — see src/app/api/business/route.ts for why
// the deeper AI/competitor-analysis config isn't part of this.
export interface BusinessInfo {
  id: string;
  name: string;
  website_url: string | null;
  logo_asset_id: string | null;
  industry: string | null;
  services: BusinessService[];
  outreach_settings: OutreachSettings;
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
