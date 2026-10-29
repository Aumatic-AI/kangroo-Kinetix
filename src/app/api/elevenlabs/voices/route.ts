import { NextResponse } from 'next/server';
import { env } from '@/config';

export async function GET(request: Request) {
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing ElevenLabs API Key" }, { status: 500 });
  }

  // search/gender/accent/language are forwarded straight to ElevenLabs'
  // own shared-voices search — VoiceExplorerModal relies on this endpoint
  // doing the actual filtering, not on filtering a locally-fetched batch.
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('page_size') || '10';
  const search = searchParams.get('search') || '';
  const gender = searchParams.get('gender') || '';
  const accent = searchParams.get('accent') || '';
  const language = searchParams.get('language') || '';

  try {
    const url = new URL("https://api.elevenlabs.io/v1/shared-voices");
    url.searchParams.set("page_size", pageSize);
    url.searchParams.set("page", page);
    url.searchParams.set("sort", "trending");
    if (search) url.searchParams.set("search", search);
    if (gender && gender !== 'all') url.searchParams.set("gender", gender);
    // ElevenLabs stores/matches accent lowercase (their own docs example shows
    // "accent": "american") — the frontend's accent options are capitalized
    // for display ("Indian", "South African"), so this must be lowercased
    // before being sent, or a case-sensitive mismatch silently returns zero
    // results even though matching voices exist.
    if (accent && accent !== 'all') url.searchParams.set("accent", accent.toLowerCase());
    if (language && language !== 'all') url.searchParams.set("language", language);

    const response = await fetch(url.toString(), {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[ElevenLabs] API Error: ${response.status}`, errorData);
      return NextResponse.json({ error: "Failed to fetch voices from ElevenLabs" }, { status: response.status });
    }

    const data = await response.json();
    const voices = data.voices || [];
    const hasMore = data.has_more !== undefined ? data.has_more : voices.length === parseInt(pageSize, 10);

    const formattedVoices = voices.map((v: any) => {
      const vGender = (v.labels?.gender || v.labels?.Gender || v.gender || "").toLowerCase() === "female" ? "female" : "male";
      const vAccent = v.labels?.accent || v.labels?.Accent || v.accent || "Global";
      const vLanguage = v.labels?.language || v.labels?.Language || v.language || "English";
      const vDescription = v.description || v.labels?.description || v.labels?.use_case || `${vAccent} ${vGender} voice`;

      return {
        voice_id: v.voice_id,
        name: v.name,
        gender: vGender,
        accent: vAccent,
        language: vLanguage,
        description: vDescription,
        preview_url: v.preview_url || "",
      };
    });

    return NextResponse.json({ voices: formattedVoices, hasMore });
  } catch (error: any) {
    console.error("[ElevenLabs] Error fetching voices:", error.message);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
