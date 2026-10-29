import { createClient } from '@/lib/supabase/client';
import { AppError } from '@/utils/app-error';

export async function uploadFile(file: File, path: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('kinetix-assets')
    .upload(path, file, { upsert: true });

  if (error) throw new AppError(`Upload failed: ${error.message}`);
  return data;
}
