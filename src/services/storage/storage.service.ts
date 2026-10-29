import { createClient } from '@/lib/supabase/client';
import { AppError } from '@/utils/app-error';

export class StorageService {
  private bucket = 'kinetix-assets';

  async getFileUrl(path: string) {
    const supabase = createClient();
    const { data } = supabase.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  
  async deleteFile(path: string) {
    const supabase = createClient();
    const { error } = await supabase.storage.from(this.bucket).remove([path]);
    if (error) throw new AppError(`Failed to delete file: ${error.message}`);
  }
}

export const storageService = new StorageService();
