import { createClient } from '@supabase/supabase-js'

// Returns a service-role Supabase client. Called inside request handlers so
// env vars are guaranteed to be loaded at call time, not module-eval time.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  return createClient(url, key)
}
