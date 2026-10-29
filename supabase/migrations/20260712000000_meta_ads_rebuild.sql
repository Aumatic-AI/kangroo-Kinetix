-- Meta Ads Module — Rebuild Schema
-- This replaces the legacy complex tables with highly optimized, flat tables for the new AI pipeline.

-- ============================================================
-- 1. COMPETITOR ADS (Deduplicated Gallery)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_competitor_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    competitor_name TEXT NOT NULL, 
    fingerprint TEXT NOT NULL, -- SHA256(ad_text + media_url)
    
    ad_text TEXT,
    media_url TEXT,
    format TEXT,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_count INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    
    UNIQUE(brand_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_meta_comp_ads_brand ON public.meta_competitor_ads(brand_id, seen_count DESC);

-- ============================================================
-- 2. SELF-AD METRICS (Nightly Sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_self_ad_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    meta_ad_id TEXT NOT NULL,
    
    spend NUMERIC(10,2) DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    date DATE NOT NULL,
    
    UNIQUE(meta_ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_meta_self_metrics_date ON public.meta_self_ad_metrics(meta_ad_id, date DESC);

-- ============================================================
-- 3. AI INTELLIGENCE (Weekly Insight Reports)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_ad_intelligence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL, -- 'competitor' or 'self'
    
    insights JSONB NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. AD CREATIVES (Generation & Library)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_ad_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    
    status TEXT DEFAULT 'pending', -- 'pending' | 'review' | 'approved'
    
    -- Creation Config
    type TEXT,
    duration TEXT,
    audio_style TEXT,
    video_style TEXT,
    language TEXT,
    character_type TEXT,
    voice_id TEXT,
    idea_prompt TEXT,      
    
    -- AI Output
    ad_script JSONB,
    media_urls JSONB,      
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
