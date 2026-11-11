import { z } from "zod";

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Server-only secret — never present in the browser bundle (Next.js only
  // inlines NEXT_PUBLIC_* vars client-side), so this must stay optional here
  // even though every server-only consumer requires it via a `!` assertion.
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // AI providers (all routed through src/services/ai/orchestrator.ts)
  OPENAI_API_KEY: z.string().optional(),
  KIE_API_KEY: z.string().optional(),

  // Media rendering & publishing
  UPLOAD_POST_API_KEY: z.string().optional(),
  UPLOAD_POST_PROFILE: z.string().optional(),

  STORAGE_PROVIDER: z.enum(["supabase", "s3", "local"]).default("supabase"),

  // Background jobs (Inngest)
  INNGEST_EVENT_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z.string().optional(),

  // App Settings
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const _env = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  KIE_API_KEY: process.env.KIE_API_KEY,

  UPLOAD_POST_API_KEY: process.env.UPLOAD_POST_API_KEY,
  UPLOAD_POST_PROFILE: process.env.UPLOAD_POST_PROFILE,

  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,

  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,

  LOG_LEVEL: process.env.LOG_LEVEL,

  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
});

if (!_env.success) {
  console.error("❌ Invalid environment variables:");
  console.error(_env.error.format());
  throw new Error("Invalid environment variables");
}

export const env = _env.data;
