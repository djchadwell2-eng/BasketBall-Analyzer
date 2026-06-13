'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-all"
    >
      <LogOut size={11} />
      Sign out
    </button>
  )
}
