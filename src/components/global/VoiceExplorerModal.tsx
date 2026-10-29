"use client";

import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Volume2, VolumeX, Check, Sparkles, Mic2, User, Globe, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const Spinner = ({ size = 24, color = "currentColor" }: { size?: number, color?: string }) => (
  <Loader2 size={size} color={color} className="animate-spin" />
);

interface Voice {
  voice_id: string;
  name: string;
  gender: string;
  accent: string;
  language: string;
  description: string;
  preview_url: string;
}

interface VoiceExplorerModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVoice: (voiceId: string, voiceLabel: string) => void;
  selectedVoiceId: string;
}

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic", bg: "Bulgarian", cs: "Czech", da: "Danish", de: "German",
  el: "Greek", en: "English", es: "Spanish", fi: "Finnish", fil: "Filipino",
  fr: "French", he: "Hebrew", hi: "Hindi", hr: "Croatian", hu: "Hungarian",
  id: "Indonesian", it: "Italian", ja: "Japanese", ko: "Korean", ms: "Malay",
  nl: "Dutch", no: "Norwegian", pl: "Polish", pt: "Portuguese", ro: "Romanian",
  ru: "Russian", sk: "Slovak", sv: "Swedish", ta: "Tamil", tr: "Turkish",
  uk: "Ukrainian", vi: "Vietnamese", zh: "Chinese",
};

// These always appear at the top, regardless of what the API returns
const PINNED_LANGUAGES = [
  { code: "en",      label: "English" },
  { code: "es",      label: "Spanish" },
  { code: "fr",      label: "French" },
  { code: "he",      label: "Hebrew" },
  { code: "tr",      label: "Turkish" },
];

// A curated common set — ElevenLabs' shared-voices search takes a free-text
// accent value with no fixed enum/list endpoint, so this isn't exhaustive,
// just the accents actually worth offering as one-click filters.
const ACCENT_OPTIONS = ["American", "British", "Australian", "Indian", "Irish", "Scottish", "Canadian", "South African"];

function getLanguageLabel(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code;
}

// Non-pinned language codes, alphabetised by display label
const OTHER_LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES)
  .filter((code) => !PINNED_LANGUAGES.some((p) => p.code === code))
  .sort((a, b) => getLanguageLabel(a).localeCompare(getLanguageLabel(b)));

export default function VoiceExplorerModal({
  isOpen,
  onOpenChange,
  onSelectVoice,
  selectedVoiceId
}: VoiceExplorerModalProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [accentFilter, setAccentFilter] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');

  // Audio preview state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Debounce the free-text search before it triggers an API call
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Any filter change means the current result set is stale — start over at page 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, genderFilter, accentFilter, languageFilter]);

  // Fetch from ElevenLabs' own shared-voices search whenever the modal is
  // open and any filter/page changes — search/gender/accent/language are
  // real API query params, not a client-side filter over a fetched batch.
  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      return;
    }
    const controller = new AbortController();
    const fetchVoices = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (genderFilter !== 'all') params.set('gender', genderFilter);
        if (accentFilter !== 'all') params.set('accent', accentFilter);
        if (languageFilter !== 'all') params.set('language', languageFilter);

        const res = await fetch(`/api/elevenlabs/voices?${params.toString()}`, { signal: controller.signal });
        const data = await res.json();
        if (data && data.voices) {
          setVoices(data.voices);
          setHasMore(!!data.hasMore);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') console.error("Failed to load voices:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchVoices();
    return () => controller.abort();
  }, [isOpen, debouncedSearch, genderFilter, accentFilter, languageFilter, page]);

  // Audio helpers
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingVoiceId(null);
  };

  const playPreview = (voiceId: string, previewUrl: string) => {
    if (!previewUrl) return;
    if (playingVoiceId === voiceId) { stopAudio(); return; }
    stopAudio();
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);
    audio.play().catch(() => setPlayingVoiceId(null));
    audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; };
  };

  useEffect(() => { return () => stopAudio(); }, []);

  const goToPage = (p: number) => {
    setPage(Math.max(1, p));
    gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setGenderFilter('all');
    setAccentFilter('all');
    setLanguageFilter('all');
  };

  const hasActiveFilters = searchQuery || genderFilter !== 'all' || accentFilter !== 'all' || languageFilter !== 'all';

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sd-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, backdropFilter: 'blur(8px)', backgroundColor: 'rgba(15, 23, 42, 0.4)' }} />

        <Dialog.Content
          className="sd-modal-content"
          style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10000,
            width: '95vw',
            maxWidth: '960px',
            minWidth: 0,
            height: '90vh',
            maxHeight: '820px',
            display: 'flex',
            flexDirection: 'column',
            padding: 'clamp(12px, 3vw, 24px)',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(2, 132, 199, 0.25)',
            border: '1px solid #cbd5e1',
            overflow: 'hidden',
          }}
        >
          {/* ── Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
            <div style={{ textAlign: 'left' }}>
              <Dialog.Title style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Sparkles size={20} color="#0284c7" />
                ElevenLabs Voice Explorer
              </Dialog.Title>
              <Dialog.Description style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', margin: 0 }}>
                {loading ? 'Loading voice library…' : `Page ${page} · ${voices.length} voice${voices.length === 1 ? '' : 's'} shown${hasMore ? ' · more available' : ''}`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                onClick={stopAudio}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* ── Search & Filters ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', background: '#f8fafc', padding: '14px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>

            {/* Search Input */}
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or description…"
                style={{ width: '100%', padding: '10px 12px 10px 38px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '10px', background: '#ffffff', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#0284c7'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>

            {/* Filter Row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>

              {/* Gender */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={12} color="#475569" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Gender</span>
                <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                  {(['all', 'male', 'female'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenderFilter(g)}
                      style={{
                        padding: '3px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: genderFilter === g ? '#ffffff' : 'transparent',
                        color: genderFilter === g ? '#0f172a' : '#64748b',
                        boxShadow: genderFilter === g ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        textTransform: 'capitalize', transition: 'all 0.15s'
                      }}
                    >
                      {g === 'all' ? 'All' : g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={12} color="#475569" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Language</span>
                <select
                  value={languageFilter}
                  onChange={e => setLanguageFilter(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#ffffff', color: '#0f172a', outline: 'none', fontWeight: 500, cursor: 'pointer' }}
                >
                  <option value="all">All Languages</option>
                  {PINNED_LANGUAGES.map(p => (
                    <option key={p.code} value={p.code}>{p.label}</option>
                  ))}
                  <option disabled>──────────</option>
                  {OTHER_LANGUAGE_CODES.map(code => (
                    <option key={code} value={code}>{getLanguageLabel(code)}</option>
                  ))}
                </select>
              </div>

              {/* Accent */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mic2 size={12} color="#475569" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Accent</span>
                <select
                  value={accentFilter}
                  onChange={e => setAccentFilter(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#ffffff', color: '#0f172a', outline: 'none', fontWeight: 500, cursor: 'pointer' }}
                >
                  <option value="all">All Accents</option>
                  {ACCENT_OPTIONS.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: '11px', fontWeight: 700, border: '1px solid #fca5a5', borderRadius: '8px', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* ── Voice Grid ── */}
          <div ref={gridRef} style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="sd-voice-explorer-grid">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
                <Spinner size={36} color="#0284c7" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Loading voice library from ElevenLabs…</span>
              </div>
            ) : voices.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', gap: '10px', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #cbd5e1' }}>
                <X size={28} color="#94a3b8" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>No voices match your filters.</span>
                <button onClick={clearFilters} style={{ background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: '12px' }}>
                {voices.map(voice => {
                  const isSelected = selectedVoiceId === voice.voice_id;
                  const isPlaying = playingVoiceId === voice.voice_id;

                  return (
                    <div
                      key={voice.voice_id}
                      className="sd-voice-card"
                      style={{
                        padding: '14px',
                        background: '#ffffff',
                        border: isSelected ? '2px solid #0284c7' : '1.5px solid #e2e8f0',
                        borderRadius: '14px',
                        boxShadow: isSelected ? '0 8px 20px -4px rgba(2,132,199,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                      }}
                    >
                      <div>
                        {/* Name + Badges */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{voice.name}</span>
                          <div style={{ display: 'flex', gap: '3px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', background: voice.gender === 'male' ? '#e0f2fe' : '#fce7f3', color: voice.gender === 'male' ? '#0369a1' : '#be185d' }}>
                              {voice.gender}
                            </span>
                            {voice.accent && voice.accent !== 'Global' && (
                              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', background: '#f0fdf4', color: '#15803d' }}>
                                {voice.accent}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Language tag */}
                        {voice.language && (
                          <div style={{ marginBottom: '6px' }}>
                            <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                              🌐 {getLanguageLabel(voice.language)}
                            </span>
                          </div>
                        )}

                        {/* Description */}
                        <p style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4', margin: '0 0 12px 0', minHeight: '30px' }}>
                          {voice.description}
                        </p>
                      </div>

                      {/* Footer Actions */}
                      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => playPreview(voice.voice_id, voice.preview_url)}
                          disabled={!voice.preview_url}
                          style={{
                            flex: 1, padding: '7px', borderRadius: '8px',
                            border: '1.5px solid #e2e8f0',
                            background: isPlaying ? 'rgba(2,132,199,0.08)' : '#ffffff',
                            color: isPlaying ? '#0284c7' : '#475569',
                            cursor: voice.preview_url ? 'pointer' : 'not-allowed',
                            fontSize: '11px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            transition: 'all 0.15s', opacity: voice.preview_url ? 1 : 0.45,
                          }}
                        >
                          {isPlaying ? <><VolumeX size={12} /> Stop</> : <><Volume2 size={12} /> Preview</>}
                        </button>

                        <button
                          type="button"
                          onClick={() => { onSelectVoice(voice.voice_id, `${voice.name} - ${voice.accent || voice.language}`); stopAudio(); }}
                          style={{
                            flex: 1.2, padding: '7px', borderRadius: '8px', border: 'none',
                            background: isSelected ? '#10b981' : '#0f172a',
                            color: '#ffffff', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            transition: 'all 0.15s',
                          }}
                        >
                          {isSelected ? <><Check size={12} /> Selected</> : <><Mic2 size={12} /> Use Voice</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Pagination — Previous/Next only, since ElevenLabs' shared-
              voices search returns a hasMore flag, not a total count, so
              there's no way to know the total page count to show numbered
              buttons for. ── */}
          {!loading && (page > 1 || hasMore) && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', color: page === 1 ? '#cbd5e1' : '#475569', cursor: page === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s' }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', minWidth: '48px', textAlign: 'center' }}>Page {page}</span>

              <button
                onClick={() => goToPage(page + 1)}
                disabled={!hasMore}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', color: !hasMore ? '#cbd5e1' : '#475569', cursor: !hasMore ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
