// Creates (or resets) the single Kinetix login. Public signup is disabled.
// Usage: ADMIN_PASSWORD='...' node --env-file=.env.local scripts/create-admin-user.mjs [username-or-email]
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Idempotent.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ADMIN_PASSWORD;
const id = (process.argv[2] || 'kangrooo').trim().toLowerCase();
const email = id.includes('@') ? id : `${id}@kangrooo.com`;

if (!url || !key || !password) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ADMIN_PASSWORD');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const existing = list.users.find((u) => u.email?.toLowerCase() === email);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (error) throw error;
  console.log(`Updated password for ${email}`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Kangrooo' },
  });
  if (error) throw error;
  console.log(`Created ${email}`);
}
