import { createClient } from '@/lib/supabase/server';
import { AuthError } from '@/utils/app-error';

export async function getSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new AuthError(error.message);
  return session;
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AuthError('Not authenticated');
  return user;
}

export async function getProfile() {
  const user = await getUser();
  const supabase = await createClient();
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) throw new AuthError('Profile not found');
  return profile;
}
