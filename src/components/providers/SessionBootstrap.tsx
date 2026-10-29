"use client";

import { useEffect } from "react";
import { useBusinessStore, useUserStore } from "@/store";

/**
 * Fetches the business + the current user's profile once per app load
 * (this component lives in the (app) layout, so it mounts on every full
 * page load and right after a successful login redirect) and populates
 * the two global Zustand stores. Renders nothing.
 */
export function SessionBootstrap() {
  const { setBusiness, setLoading: setBusinessLoading, setError: setBusinessError } = useBusinessStore();
  const { setProfile, setLoading: setProfileLoading, setError: setProfileError } = useUserStore();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBusinessLoading(true);
      try {
        const res = await fetch("/api/business");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Failed to load business");
        setBusiness(json.business);
      } catch (e: any) {
        if (!cancelled) setBusinessError(e.message || "Failed to load business");
      } finally {
        if (!cancelled) setBusinessLoading(false);
      }
    })();

    (async () => {
      setProfileLoading(true);
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Failed to load profile");
        setProfile(json.profile);
      } catch (e: any) {
        if (!cancelled) setProfileError(e.message || "Failed to load profile");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
