import { create } from 'zustand';

// Combines profiles + business_users — see src/app/api/profile/route.ts.
// role/businessId/joinedAt come from business_users (the membership row),
// not profiles.role — role is a per-business-membership thing now.
export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  businessId: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | null;
  joinedAt: string | null;
}

interface UserState {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  setProfile: (profile: UserProfile) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// Not persisted — refetched on every app load/login so a different user
// signing in on the same device never briefly sees the previous user's data.
export const useUserStore = create<UserState>()((set) => ({
  profile: null,
  isLoading: false,
  error: null,
  setProfile: (profile) => set({ profile, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ profile: null, isLoading: false, error: null }),
}));
