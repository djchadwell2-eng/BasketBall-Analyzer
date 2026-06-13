'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { LogIn, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(
        /invalid/i.test(signInError.message)
          ? 'Email or password is incorrect.'
          : signInError.message
      )
      setLoading(false)
      return
    }
    router.push(searchParams.get('next') ?? '/analyze')
    router.refresh()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.21, 0.6, 0.35, 1] }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
          <span className="text-[11px] font-semibold text-orange-500/90 tracking-[0.22em] uppercase">
            Coaching staff only
          </span>
        </div>
        <h1 className="font-display text-5xl font-bold uppercase tracking-tight text-white leading-none">
          Film <span className="text-orange-500">Room</span>
        </h1>
      </div>

      <form
        onSubmit={handleSignIn}
        className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 space-y-4"
      >
        <div>
          <label htmlFor="email" className="block text-[10px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/40 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors"
            placeholder="coach@school.org"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-[10px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/40 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl text-sm font-semibold transition-colors"
        >
          <LogIn size={14} />
          {loading ? 'Signing in...' : 'Enter the Film Room'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-600 flex items-center justify-center gap-1.5">
        <Lock size={10} />
        Access is invite-only.{' '}
        <Link href="/#request-access" className="text-orange-500/80 hover:text-orange-400 transition-colors">
          Request an invite
        </Link>
      </p>
    </motion.div>
  )
}

export default function LoginPage() {
  return (
    <main className="relative min-h-screen bg-[#05080f] text-white flex items-center justify-center px-6">
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(251,146,60,0.14) 0%, rgba(234,88,12,0.05) 45%, transparent 70%)',
        }}
      />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
