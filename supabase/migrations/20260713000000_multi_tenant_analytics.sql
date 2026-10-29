-- 1. Add multi-tenant configuration fields to the brands table
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS target_countries JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS competitor_keywords JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS brand_voice TEXT,
ADD COLUMN IF NOT EXISTS core_offerings TEXT;

-- 2. Add scoring and classification fields to meta_competitor_ads
ALTER TABLE public.meta_competitor_ads
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS framework TEXT,
ADD COLUMN IF NOT EXISTS emotional_angles JSONB DEFAULT '[]'::jsonb;
