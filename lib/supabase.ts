import { createBrowserClient } from '@supabase/ssr'

// Browser client — carries the logged-in user's session, so RLS policies
// apply. Drop-in replacement for the old anonymous client: all existing
// client-component imports keep working.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
