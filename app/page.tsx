'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, useInView } from 'framer-motion'
import { Film, FileText, Crosshair, ArrowRight, CheckCircle2, Upload, BrainCircuit, Trophy } from 'lucide-react'

// Real 3D ball (three.js) — lazy-loaded so the headline renders instantly
// and the WebGL bundle arrives a beat later.
const Basketball3D = dynamic(() => import('@/components/Basketball3D'), { ssr: false })

// ─────────────────────────────────────────────────────────────────────────────
// Request access form
// ─────────────────────────────────────────────────────────────────────────────

function RequestAccessForm() {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Something went wrong.')
      }
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-3 justify-center py-6"
      >
        <CheckCircle2 size={20} className="text-emerald-400" />
        <p className="text-sm text-gray-200">
          You&apos;re on the list — we&apos;ll reach out when your spot opens up.
        </p>
      </motion.div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="coach@school.org"
          className="flex-1 bg-white/[0.05] border border-white/[0.1] focus:border-orange-500/50 rounded-xl px-5 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="group flex items-center justify-center gap-2 px-7 py-3.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl text-sm font-bold uppercase tracking-wide transition-colors"
        >
          {state === 'sending' ? 'Sending...' : 'Request access'}
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional: team / level you coach"
        className="w-full bg-white/[0.03] border border-white/[0.07] focus:border-orange-500/40 rounded-xl px-5 py-3 text-sm text-white placeholder-gray-700 outline-none transition-colors"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll-reveal helper
// ─────────────────────────────────────────────────────────────────────────────

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.6, 0.35, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  'Possession detection', 'Scouting reports', 'Game plans', 'Offensive tendencies',
  'Defensive keys', 'Transition analysis', 'Key moments', 'Coaching takeaways',
]

const FEATURES = [
  {
    Icon: Film,
    title: 'The Film Room',
    body: 'Every possession found, timed, and tagged. Click one — the video jumps there and the full breakdown is in front of you.',
    accent: 'text-orange-400 border-orange-500/25 bg-orange-500/[0.05]',
  },
  {
    Icon: FileText,
    title: 'The Scouting Report',
    body: 'Who this team is: pace, identity, offensive and defensive tendencies, and the weaknesses you can attack — written like a real scout wrote it.',
    accent: 'text-sky-400 border-sky-500/25 bg-sky-500/[0.05]',
  },
  {
    Icon: Crosshair,
    title: 'The Game Plan',
    body: 'A whiteboard for beating them: how to attack, what to take away, and how to control tempo — every key backed by film timestamps.',
    accent: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.05]',
  },
]

const STEPS = [
  { Icon: Upload, title: 'Upload the film', body: 'Your phone recording or Hudl export. Full games welcome.' },
  { Icon: BrainCircuit, title: 'AI breaks it down', body: 'Watches every possession — video, audio, and scoreboard — like a tireless assistant coach.' },
  { Icon: Trophy, title: 'Walk in prepared', body: 'Scouting report and game plan in hand before your next practice.' },
]

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-[#05080f] text-white overflow-x-clip">

      {/* ── Atmosphere ─────────────────────────────────────────────── */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(251,146,60,0.16) 0%, rgba(234,88,12,0.06) 45%, transparent 72%)',
          zIndex: 0,
        }}
      />
      {/* Court center-circle lines */}
      <svg
        className="absolute top-[8%] right-[-220px] w-[640px] h-[640px] pointer-events-none opacity-[0.06]"
        viewBox="0 0 100 100" fill="none" stroke="white"
      >
        <circle cx="50" cy="50" r="48" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="16" strokeWidth="0.6" />
        <path d="M2 50 H98" strokeWidth="0.6" />
      </svg>

      {/* ── Nav ────────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="font-display text-xl font-bold uppercase tracking-wide">
            Film <span className="text-orange-500">Room</span>
          </span>
        </div>
        <Link
          href="/login"
          className="text-xs font-semibold text-gray-300 hover:text-white border border-white/15 hover:border-orange-500/50 px-4 py-2 rounded-full transition-all"
        >
          Coach sign in
        </Link>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-14 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-12 items-center">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[11px] font-bold tracking-[0.3em] uppercase text-orange-500 mb-5"
            >
              AI scouting for youth &amp; HS basketball
            </motion.p>

            <h1 className="font-display font-bold uppercase leading-[0.88] tracking-tight">
              {['Game film in.', 'Game plan out.'].map((line, i) => (
                <span key={line} className="block overflow-hidden">
                  <motion.span
                    initial={{ y: '110%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease: [0.21, 0.6, 0.35, 1] }}
                    className={`block text-[clamp(3rem,9vw,7rem)] ${i === 1 ? 'text-orange-500' : 'text-white'}`}
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.5 }}
              className="mt-6 text-base sm:text-lg text-gray-400 leading-relaxed max-w-xl"
            >
              Upload a game. The AI watches every possession — then hands you the
              scouting report and the plan to beat the team on the other side.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.62 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <a
                href="#request-access"
                className="group flex items-center gap-2 px-7 py-4 bg-orange-600 hover:bg-orange-500 rounded-xl text-sm font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_35px_rgba(234,88,12,0.4)]"
              >
                Request access
                <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
              </a>
              <Link
                href="/login"
                className="px-7 py-4 border border-white/15 hover:border-white/30 rounded-xl text-sm font-semibold text-gray-300 hover:text-white transition-all"
              >
                I have an invite
              </Link>
            </motion.div>
          </div>

          {/* The ball */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.21, 0.6, 0.35, 1] }}
            className="flex items-center justify-center"
          >
            <Basketball3D />
          </motion.div>
        </div>
      </section>

      {/* ── Ticker ─────────────────────────────────────────────────── */}
      <div className="relative z-10 border-y border-orange-500/20 bg-orange-500/[0.04] py-3.5 overflow-hidden -rotate-1 scale-[1.02]">
        <div className="marquee-track flex whitespace-nowrap w-max">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center font-display text-lg font-semibold uppercase tracking-wider text-orange-400/90">
              <span className="px-6">{item}</span>
              <span className="text-orange-600">●</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-24">
        <Reveal>
          <h2 className="font-display text-5xl sm:text-6xl font-bold uppercase tracking-tight text-center mb-3">
            Three tabs. <span className="text-orange-500">Total clarity.</span>
          </h2>
          <p className="text-center text-gray-500 text-sm mb-14">What you open the morning after game night.</p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map(({ Icon, title, body, accent }, i) => (
            <Reveal key={title} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className={`h-full rounded-2xl border p-7 ${accent}`}
              >
                <Icon size={22} className="mb-5" />
                <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-white mb-2.5">
                  {title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {STEPS.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.12} className="relative">
              <span className="font-display text-8xl font-bold text-white/[0.05] absolute -top-7 -left-2 select-none">
                {i + 1}
              </span>
              <div className="relative pt-6">
                <Icon size={18} className="text-orange-400 mb-3" />
                <h3 className="font-display text-xl font-bold uppercase tracking-wide mb-1.5">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Request access ─────────────────────────────────────────── */}
      <section id="request-access" className="relative z-10 max-w-3xl mx-auto px-6 pb-28 scroll-mt-10">
        <Reveal>
          <div className="relative rounded-3xl border border-orange-500/25 bg-gradient-to-b from-orange-500/[0.08] to-transparent p-10 sm:p-12 overflow-hidden">
            <div
              className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[240px] pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.18) 0%, transparent 65%)' }}
            />
            <div className="relative">
              <h2 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-tight text-center mb-3">
                Get in the <span className="text-orange-500">room</span>
              </h2>
              <p className="text-center text-sm text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
                Access is invite-only while we work with our first group of coaches.
                Drop your email and we&apos;ll save you a seat.
              </p>
              <RequestAccessForm />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-gray-600">
          <span className="font-display uppercase tracking-wide text-gray-500">
            Film <span className="text-orange-500/70">Room</span>
          </span>
          <span>Built by a coach&apos;s corner, for coaches.</span>
        </div>
      </footer>
    </main>
  )
}
