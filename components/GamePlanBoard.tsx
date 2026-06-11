'use client'

import { motion } from 'framer-motion'
import { Swords, ShieldHalf, Timer, StickyNote, Film, Sparkles } from 'lucide-react'
import type { GamePlan, GamePlanKey } from '@/lib/types'

interface Props {
  gamePlan: GamePlan | null
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function jumpToFilm(timestamp: number) {
  window.dispatchEvent(new CustomEvent('jumpToFilm', { detail: { timestamp } }))
}

const cardReveal = {
  initial: { opacity: 0, y: 18, rotate: -0.4 },
  whileInView: { opacity: 1, y: 0, rotate: 0 },
  viewport: { once: true, margin: '-30px' },
  transition: { duration: 0.45, ease: [0.21, 0.6, 0.35, 1] as const },
}

function KeyColumn({
  label,
  sublabel,
  icon,
  keys,
  accent,
}: {
  label: string
  sublabel: string
  icon: React.ReactNode
  keys: GamePlanKey[]
  accent: { text: string; border: string; bg: string; numBg: string }
}) {
  if (keys.length === 0) return null
  return (
    <div>
      <div className="mb-5">
        <div className={`flex items-center gap-2 ${accent.text}`}>
          {icon}
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{label}</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">{sublabel}</p>
      </div>
      <div className="space-y-4">
        {keys.map((k, i) => (
          <motion.div
            key={i}
            {...cardReveal}
            transition={{ ...cardReveal.transition, delay: i * 0.08 }}
            className={`relative rounded-xl border ${accent.border} ${accent.bg} p-5 overflow-hidden`}
          >
            <div className="flex items-start gap-4">
              <span className={`shrink-0 w-9 h-9 rounded-lg ${accent.numBg} flex items-center justify-center font-display text-xl font-bold text-white`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-2xl font-semibold text-white uppercase tracking-wide leading-tight mb-1.5">
                  {k.title}
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed">{k.detail}</p>
                {k.supportingTimestamps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {k.supportingTimestamps.slice(0, 4).map(ts => (
                      <button
                        key={ts}
                        onClick={() => jumpToFilm(ts)}
                        className="flex items-center gap-1 font-mono text-[11px] text-gray-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] rounded-md px-2 py-1 transition-colors"
                      >
                        <Film size={9} />
                        {formatTimestamp(ts)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default function GamePlanBoard({ gamePlan }: Props) {
  if (!gamePlan) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center">
        <Sparkles size={20} className="mx-auto text-gray-600 mb-4" />
        <h2 className="font-display text-2xl font-bold uppercase text-gray-400 mb-2">No game plan yet</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          This analysis was created before game plans existed. Run a new analysis
          on this footage and the AI will build a plan for how to beat this team.
        </p>
      </div>
    )
  }

  return (
    <div className="relative max-w-5xl mx-auto whiteboard-grid rounded-3xl border border-white/[0.07] p-8 sm:p-12 grain overflow-hidden">

      {/* Corner glow so the board feels lit from above */}
      <div
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[260px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, transparent 65%)' }}
      />

      {/* ── Board header ───────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 text-center"
      >
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-orange-500 mb-2">
          The whiteboard
        </p>
        <h1 className="font-display text-6xl font-bold tracking-tight text-white uppercase leading-none">
          How to beat <span className="text-orange-500">this team</span>
        </h1>
        <div className="mt-4 mx-auto w-24 h-[3px] bg-gradient-to-r from-transparent via-orange-500 to-transparent rounded-full" />
      </motion.header>

      {/* ── Tempo strip ────────────────────────────────────────────── */}
      {gamePlan.tempoAdvice && (
        <motion.div
          {...cardReveal}
          className="relative mb-10 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-4 flex items-start gap-3"
        >
          <Timer size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-emerald-400 mb-1">Tempo</p>
            <p className="text-sm text-gray-200 leading-relaxed">{gamePlan.tempoAdvice}</p>
          </div>
        </motion.div>
      )}

      {/* ── Keys: attack & contain ─────────────────────────────────── */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
        <KeyColumn
          label="Attack them"
          sublabel="When you have the ball"
          icon={<Swords size={18} />}
          keys={gamePlan.offensiveKeys}
          accent={{
            text: 'text-orange-400',
            border: 'border-orange-500/25',
            bg: 'bg-orange-500/[0.05]',
            numBg: 'bg-orange-600',
          }}
        />
        <KeyColumn
          label="Take it away"
          sublabel="When they have the ball"
          icon={<ShieldHalf size={18} />}
          keys={gamePlan.defensiveKeys}
          accent={{
            text: 'text-sky-400',
            border: 'border-sky-500/25',
            bg: 'bg-sky-500/[0.05]',
            numBg: 'bg-sky-600',
          }}
        />
      </div>

      {/* ── Matchup notes ──────────────────────────────────────────── */}
      {gamePlan.matchupNotes.length > 0 && (
        <motion.div {...cardReveal} className="relative">
          <div className="flex items-center gap-2 text-amber-400 mb-4">
            <StickyNote size={15} />
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Notes for the locker room</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gamePlan.matchupNotes.map((note, i) => (
              <div
                key={i}
                className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4 text-sm text-gray-300 leading-relaxed"
                style={{ transform: `rotate(${i % 2 === 0 ? '-0.5' : '0.5'}deg)` }}
              >
                {note}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
