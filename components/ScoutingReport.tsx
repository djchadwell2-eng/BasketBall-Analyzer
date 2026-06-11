'use client'

import { motion } from 'framer-motion'
import { Flame, Shield, Gauge, AlertTriangle, ClipboardList, Film } from 'lucide-react'
import type { TendencyItem, GameIdentity, RankedObservation, PatternInsight, StrategicAdjustment } from '@/lib/types'

interface Props {
  reportText: string
  gameIdentity: GameIdentity | null
  offensiveTendencies: TendencyItem[]
  defensiveTendencies: TendencyItem[]
  transitionAnalysis: string
  rankedObservations: RankedObservation[]
  patternInsights: PatternInsight[]
  strategicAdjustments?: StrategicAdjustment[]
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Switches to the Film Room tab and seeks the video there. */
function jumpToFilm(timestamp: number) {
  window.dispatchEvent(new CustomEvent('jumpToFilm', { detail: { timestamp } }))
}

const sectionReveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45, ease: [0.21, 0.6, 0.35, 1] as const },
}

function SectionHeading({ kicker, title, accent }: { kicker: string; title: string; accent: string }) {
  return (
    <div className="mb-6">
      <p className={`text-[11px] font-bold tracking-[0.28em] uppercase mb-1 ${accent}`}>{kicker}</p>
      <h2 className="font-display text-4xl font-bold tracking-tight text-white uppercase">{title}</h2>
    </div>
  )
}

function TendencyColumn({
  label,
  icon,
  items,
  accentText,
  accentBar,
}: {
  label: string
  icon: React.ReactNode
  items: TendencyItem[]
  accentText: string
  accentBar: string
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className={`flex items-center gap-2 mb-5 ${accentText}`}>
        {icon}
        <span className="font-display text-xl font-bold uppercase tracking-wide">{label}</span>
      </div>
      <ol className="space-y-5">
        {items.map((t, i) => (
          <motion.li
            key={i}
            {...sectionReveal}
            transition={{ ...sectionReveal.transition, delay: i * 0.06 }}
            className="flex gap-4"
          >
            <span className="font-display text-3xl font-bold text-white/15 leading-none w-9 shrink-0 text-right">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 mb-1.5">
                <h3 className="text-[15px] font-semibold text-white leading-snug">{t.name}</h3>
                {t.significance === 'high' && (
                  <span className={`shrink-0 h-1.5 w-8 rounded-full ${accentBar}`} />
                )}
              </div>
              {t.description !== t.name && (
                <p className="text-sm text-gray-400 leading-relaxed">{t.description}</p>
              )}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

export default function ScoutingReport({
  reportText,
  gameIdentity,
  offensiveTendencies,
  defensiveTendencies,
  transitionAnalysis,
  rankedObservations,
  patternInsights,
}: Props) {
  // The narrative arrives as markdown beginning "## Scouting Report" — the
  // masthead below replaces that heading.
  const narrativeParagraphs = reportText
    .replace(/^##\s*Scouting Report\s*/i, '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith('>'))

  const weaknesses = gameIdentity?.primaryWeaknesses ?? []
  const hasAnything =
    narrativeParagraphs.length > 0 ||
    offensiveTendencies.length > 0 ||
    defensiveTendencies.length > 0 ||
    rankedObservations.length > 0

  if (!hasAnything) {
    return (
      <div className="py-24 text-center text-gray-500 text-sm">
        No scouting synthesis was generated for this game.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Masthead ──────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.21, 0.6, 0.35, 1] }}
        className="mb-12 pb-8 border-b border-white/[0.08]"
      >
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-orange-500 mb-2">
          Confidential · Coaching Staff Only
        </p>
        <h1 className="font-display text-7xl font-bold tracking-tight text-white uppercase leading-[0.9]">
          Scouting<br />
          <span className="text-orange-500">Report</span>
        </h1>
      </motion.header>

      {/* ── Identity strip ────────────────────────────────────────── */}
      {gameIdentity && (
        <motion.section {...sectionReveal} className="mb-14">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.08]">
            <div className="bg-[#0a0e16] p-5">
              <div className="flex items-center gap-1.5 text-orange-400 mb-2">
                <Gauge size={12} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Pace</span>
              </div>
              <p className="font-display text-3xl font-bold uppercase text-white">{gameIdentity.pace}</p>
            </div>
            <div className="bg-[#0a0e16] p-5">
              <div className="flex items-center gap-1.5 text-amber-400 mb-2">
                <Flame size={12} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Offensive identity</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{gameIdentity.offensiveIdentity || '—'}</p>
            </div>
            <div className="bg-[#0a0e16] p-5">
              <div className="flex items-center gap-1.5 text-sky-400 mb-2">
                <Shield size={12} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Defensive identity</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{gameIdentity.defensiveIdentity || '—'}</p>
            </div>
          </div>
        </motion.section>
      )}

      {/* ── Narrative ─────────────────────────────────────────────── */}
      {narrativeParagraphs.length > 0 && (
        <motion.section {...sectionReveal} className="mb-16">
          <SectionHeading kicker="The story of the game" title="Game Narrative" accent="text-orange-500" />
          <div className="space-y-5">
            {narrativeParagraphs.map((p, i) => (
              <p
                key={i}
                className={`text-[15px] leading-[1.85] text-gray-300 ${
                  i === 0
                    ? 'first-letter:font-display first-letter:text-6xl first-letter:font-bold first-letter:text-orange-500 first-letter:float-left first-letter:mr-3 first-letter:leading-[0.8] first-letter:mt-1'
                    : ''
                }`}
              >
                {p}
              </p>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Tendencies ────────────────────────────────────────────── */}
      {(offensiveTendencies.length > 0 || defensiveTendencies.length > 0) && (
        <section className="mb-16">
          <motion.div {...sectionReveal}>
            <SectionHeading kicker="What they do, every time" title="Tendencies" accent="text-orange-500" />
          </motion.div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <TendencyColumn
              label="Offense"
              icon={<Flame size={16} />}
              items={offensiveTendencies}
              accentText="text-amber-400"
              accentBar="bg-amber-400"
            />
            <TendencyColumn
              label="Defense"
              icon={<Shield size={16} />}
              items={defensiveTendencies}
              accentText="text-sky-400"
              accentBar="bg-sky-400"
            />
          </div>
          {transitionAnalysis && (
            <motion.div
              {...sectionReveal}
              className="mt-10 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5"
            >
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-emerald-400 mb-2">
                Transition game
              </p>
              <p className="text-sm text-gray-300 leading-relaxed">{transitionAnalysis}</p>
            </motion.div>
          )}
        </section>
      )}

      {/* ── Exploitable weaknesses ────────────────────────────────── */}
      {weaknesses.length > 0 && (
        <motion.section {...sectionReveal} className="mb-16">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6">
            <div className="flex items-center gap-2 mb-4 text-red-400">
              <AlertTriangle size={15} />
              <span className="font-display text-xl font-bold uppercase tracking-wide">Exploitable</span>
            </div>
            <ul className="space-y-3">
              {weaknesses.map((w, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-300 leading-relaxed">
                  <span className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-red-400" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      )}

      {/* ── Coaching takeaways ────────────────────────────────────── */}
      {rankedObservations.length > 0 && (
        <section className="mb-16">
          <motion.div {...sectionReveal}>
            <SectionHeading kicker="What to do about it" title="Coaching Takeaways" accent="text-orange-500" />
          </motion.div>
          <ol className="space-y-4">
            {rankedObservations.map((obs, i) => (
              <motion.li
                key={obs.rank}
                {...sectionReveal}
                transition={{ ...sectionReveal.transition, delay: i * 0.05 }}
                className="group flex gap-5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-orange-500/25 hover:bg-orange-500/[0.03] transition-colors p-5"
              >
                <span className="font-display text-5xl font-bold leading-none text-orange-500/25 group-hover:text-orange-500/50 transition-colors shrink-0 w-14">
                  {String(obs.rank).padStart(2, '0')}
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <ClipboardList size={13} className="text-orange-400 shrink-0" />
                    <h3 className="text-[15px] font-semibold text-white">{obs.title}</h3>
                    {obs.tacticalSignificance === 'primary' && (
                      <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border text-orange-400 bg-orange-500/10 border-orange-500/20">
                        Priority
                      </span>
                    )}
                  </div>
                  {obs.detailedObservation !== obs.title && (
                    <p className="text-sm text-gray-400 leading-relaxed">{obs.detailedObservation}</p>
                  )}
                </div>
              </motion.li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Key moments → film ────────────────────────────────────── */}
      {patternInsights.length > 0 && (
        <section className="mb-8">
          <motion.div {...sectionReveal}>
            <SectionHeading kicker="Watch these back" title="Key Moments" accent="text-orange-500" />
          </motion.div>
          <div className="space-y-2.5">
            {patternInsights.map((km, i) => {
              const ts = km.supportingTimestamps[0]
              return (
                <motion.button
                  key={i}
                  {...sectionReveal}
                  transition={{ ...sectionReveal.transition, delay: i * 0.05 }}
                  onClick={() => ts !== undefined && jumpToFilm(ts)}
                  disabled={ts === undefined}
                  className="w-full text-left flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] enabled:hover:border-orange-500/30 enabled:hover:bg-orange-500/[0.04] transition-all p-4 group disabled:cursor-default"
                >
                  {ts !== undefined && (
                    <span className="shrink-0 flex items-center gap-1.5 font-mono text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-1.5 group-hover:bg-orange-500/20 transition-colors">
                      <Film size={11} />
                      {formatTimestamp(ts)}
                    </span>
                  )}
                  <p className="text-sm text-gray-300 leading-relaxed">{km.description}</p>
                </motion.button>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] text-gray-600">
            Click a timestamp to jump the Film Room to that moment.
          </p>
        </section>
      )}
    </div>
  )
}
