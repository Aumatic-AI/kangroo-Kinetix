import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

// Combines the two tables that together describe "who is this user, and
// what can they do": profiles (name/email/avatar) and business_users
// (their role + which business they belong to — the authoritative role
// now, not profiles.role, since role is a per-membership thing).
export async function GET() {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("business_users")
      .select("business_id, role, joined_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: "Failed to fetch business membership" }, { status: 500 });
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
        businessId: membership?.business_id ?? null,
        role: membership?.role ?? null,
        joinedAt: membership?.joined_at ?? null,
      },
    });
  } catch (error: any) {
    console.error("[PROFILE_GET]", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
