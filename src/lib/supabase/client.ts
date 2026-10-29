import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/config';
import { Database } from '@/types/supabase';

export const createClient = () => {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};
