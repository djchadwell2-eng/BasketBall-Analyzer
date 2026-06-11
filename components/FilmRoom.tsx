'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Eye, ArrowRight, Target, Zap, RefreshCw } from 'lucide-react'

// These types are re-exported here because several pages/components import
// them from './FilmRoom' — keep them in sync with lib/types.ts.
export interface SequenceResult {
  sequenceIndex: number
  possessionId: number
  timestampStart: number
  timestampEnd: number
  playType: string
  whatHappened: string
  whatItMeans: string
  whyItMatters: string
  coachingPoint: string
  patternContext: string
  directionHint: 'left' | 'right' | 'center' | 'unknown'
  tags: string[]
  actionTypes: string[]
  outcome: 'made' | 'missed' | 'turnover' | 'defensive-stop' | 'unknown'
  summary: string
  coachingTakeaway: string
  thumbnail: string
}

export interface BasketballEvent {
  type: string
  confidence: 'high' | 'medium' | 'low'
  relatedSequenceId: number
  metadata: {
    direction?: 'left' | 'right' | 'center'
    shotZone?: string
    transition?: boolean
    outcome?: string
  }
}

export interface PossessionResult {
  possessionId: number
  possessionType:
    | 'transition' | 'half_court' | 'defensive_sequence' | 'special_situation'
    | 'pick_and_roll' | 'isolation' | 'post_up' | 'scramble'
    | 'early_offense' | 'late_clock' | 'baseline_out_of_bounds' | 'sideline_out_of_bounds'
  startTimestamp: number
  endTimestamp: number
  summary: string
  coachingInsight: string
  keyObservations: string[]
  outcome: string
  metadata: {
    directionHint: 'left' | 'right' | 'center' | 'unknown'
    actionTypes: string[]
  }
  tacticalTags: string[]
  paceProfile: 'fast' | 'medium' | 'slow'
  confidence: 'high' | 'medium' | 'low'
  events: BasketballEvent[]
  sequences: SequenceResult[]
  importanceScore?: number
}

interface Props {
  videoUrl: string | null
  sequences: SequenceResult[]
  possessions?: PossessionResult[]
  reportText?: string
  model?: string
  frameCount?: number
  analyzedAt?: string
}

// ── Lookup tables ─────────────────────────────────────────────────────────────

const POSSESSION_TYPE_LABELS: Record<string, string> = {
  'transition': 'Transition',
  'half_court': 'Half Court',
  'defensive_sequence': 'Defense',
  'special_situation': 'Special',
  'pick_and_roll': 'Pick & Roll',
  'isolation': 'Isolation',
  'post_up': 'Post Up',
  'scramble': 'Scramble',
  'early_offense': 'Early Offense',
  'late_clock': 'Late Clock',
  'baseline_out_of_bounds': 'BLOB',
  'sideline_out_of_bounds': 'SLOB',
}

const POSSESSION_TYPE_COLORS: Record<string, string> = {
  'transition':             'text-sky-400 bg-sky-500/10 border-sky-500/20',
  'half_court':             'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'defensive_sequence':     'text-red-400 bg-red-500/10 border-red-500/20',
  'special_situation':      'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'pick_and_roll':          'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'isolation':              'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'post_up':                'text-red-400 bg-red-500/10 border-red-500/20',
  'scramble':               'text-pink-400 bg-pink-500/10 border-pink-500/20',
  'early_offense':          'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  'late_clock':             'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'baseline_out_of_bounds': 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  'sideline_out_of_bounds': 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

const OUTCOME_META: Record<string, { label: string; dot: string; text: string }> = {
  'made':           { label: 'Made',     dot: 'bg-emerald-400', text: 'text-emerald-400' },
  'missed':         { label: 'Missed',   dot: 'bg-red-400',     text: 'text-red-400' },
  'turnover':       { label: 'Turnover', dot: 'bg-amber-400',   text: 'text-amber-400' },
  'defensive-stop': { label: 'Stop',     dot: 'bg-sky-400',     text: 'text-sky-400' },
}

const FILTERS: { id: string; label: string }[] = [
  { id: 'all',            label: 'All' },
  { id: 'made',           label: 'Made' },
  { id: 'missed',         label: 'Missed' },
  { id: 'turnover',       label: 'TO' },
  { id: 'defensive-stop', label: 'Stops' },
]

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function badgeClass(type: string): string {
  return POSSESSION_TYPE_COLORS[type] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
}

// ── Detail panel sections ─────────────────────────────────────────────────────

function BreakdownRow({ icon, label, text, accent }: {
  icon: React.ReactNode
  label: string
  text: string
  accent?: boolean
}) {
  if (!text) return null
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5 ${accent ? 'text-orange-400' : 'text-gray-500'}`}>
        {icon}
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase">{label}</span>
      </div>
      <p className={`text-sm leading-relaxed ${accent ? 'text-orange-200' : 'text-gray-300'}`}>
        {text}
      </p>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilmRoom({ videoUrl, sequences, possessions = [], model, frameCount, analyzedAt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [selectedId, setSelectedId] = useState<number | null>(possessions[0]?.possessionId ?? null)
  const [filter, setFilter] = useState('all')
  const [videoError, setVideoError] = useState(false)

  // Cross-tab "jump to film": the Scouting Report / Game Plan dispatch
  // seekFilm with a timestamp after AnalysisTabs switches back to this tab.
  useEffect(() => {
    function handleSeekFilm(e: Event) {
      const { timestamp } = (e as CustomEvent<{ timestamp: number }>).detail
      if (videoRef.current) {
        videoRef.current.currentTime = timestamp
        videoRef.current.play()
      }
      const hit = possessions.find(p => timestamp >= p.startTimestamp && timestamp <= p.endTimestamp)
        ?? possessions.find(p => p.startTimestamp >= timestamp)
      if (hit) setSelectedId(hit.possessionId)
    }
    window.addEventListener('seekFilm', handleSeekFilm)
    return () => window.removeEventListener('seekFilm', handleSeekFilm)
  }, [possessions])

  // ONE click: seek the video to the possession AND show its full breakdown
  // in the panel under the video. Nothing toggles, nothing collapses, the
  // video position is never reset by UI state.
  function selectPossession(pos: PossessionResult) {
    setSelectedId(pos.possessionId)
    if (videoRef.current) {
      videoRef.current.currentTime = pos.startTimestamp
      videoRef.current.play()
    }
  }

  const filtered = useMemo(
    () => (filter === 'all' ? possessions : possessions.filter(p => p.outcome === filter)),
    [possessions, filter]
  )

  const selected = possessions.find(p => p.possessionId === selectedId) ?? null
  // Each possession carries one deep-pass sequence with the rich breakdown
  const seq = selected?.sequences[0] ?? null
  const offenseObs = selected?.keyObservations.find(o => o.startsWith('OFFENSE: '))?.slice(9) ?? null
  const defenseObs = selected?.keyObservations.find(o => o.startsWith('DEFENSE: '))?.slice(9) ?? null
  const outcome = selected ? OUTCOME_META[selected.outcome] ?? null : null

  // Legacy fallback: very old analyses have sequences but no possessions
  if (possessions.length === 0 && sequences.length > 0) {
    return (
      <div className="text-center py-16 text-sm text-gray-500">
        This game was analyzed with an older pipeline — re-analyze the footage to
        get the full Film Room experience.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-8 items-start">

      {/* ── Left — video + broadcast detail panel ─────────────────── */}
      <div className="space-y-5 min-w-0">

        {videoUrl && !videoError ? (
          <motion.video
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            ref={videoRef}
            src={videoUrl}
            controls
            onError={() => setVideoError(true)}
            className="w-full rounded-2xl bg-black shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]"
          />
        ) : (
          <div className="w-full aspect-video rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-gray-500">Video unavailable</p>
            {videoError && (
              <p className="text-[11px] text-gray-600 text-center px-6">
                Make sure the Supabase Storage &ldquo;videos&rdquo; bucket is set to public.
              </p>
            )}
          </div>
        )}

        {/* Meta line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 font-mono">
          {model && <span>{model}</span>}
          {possessions.length > 0 && <><span className="text-gray-700">·</span><span>{possessions.length} possessions</span></>}
          {frameCount !== undefined && frameCount > 0 && <><span className="text-gray-700">·</span><span>{frameCount}s of film</span></>}
          {analyzedAt && (
            <><span className="text-gray-700">·</span>
            <span>{new Date(analyzedAt).toLocaleDateString()}</span></>
          )}
        </div>

        {/* ── Broadcast lower-third: the selected possession ───────── */}
        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.possessionId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.015] overflow-hidden"
            >
              {/* Header strip */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06] bg-black/30">
                <span className="font-display text-2xl font-bold text-orange-500 leading-none">
                  #{selected.possessionId + 1}
                </span>
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border ${badgeClass(selected.possessionType)}`}>
                  {POSSESSION_TYPE_LABELS[selected.possessionType] ?? selected.possessionType}
                </span>
                {outcome && (
                  <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${outcome.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${outcome.dot}`} />
                    {outcome.label}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-gray-500">
                  {formatTimestamp(selected.startTimestamp)} → {formatTimestamp(selected.endTimestamp)}
                </span>
              </div>

              <div className="p-5 space-y-5">
                {/* Coaching insight — the headline, finally readable */}
                {selected.coachingInsight && (
                  <p className="text-[15px] font-semibold text-white leading-relaxed">
                    {selected.coachingInsight}
                  </p>
                )}

                {/* Rich deep-pass breakdown */}
                {seq && (seq.whatHappened || seq.whatItMeans || seq.whyItMatters || seq.coachingPoint) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-1">
                    <BreakdownRow icon={<Eye size={11} />} label="What happened" text={seq.whatHappened} />
                    <BreakdownRow icon={<ArrowRight size={11} />} label="What it means" text={seq.whatItMeans} />
                    <BreakdownRow icon={<Target size={11} />} label="Why it matters" text={seq.whyItMatters} />
                    <BreakdownRow icon={<Zap size={11} />} label="Coaching point" text={seq.coachingPoint} accent />
                  </div>
                )}

                {seq?.patternContext && (
                  <BreakdownRow icon={<RefreshCw size={11} />} label="Pattern context" text={seq.patternContext} />
                )}

                {/* Offense / defense observation strip */}
                {(offenseObs || defenseObs) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {offenseObs && (
                      <div className="rounded-lg bg-amber-500/[0.05] border border-amber-500/15 px-4 py-3">
                        <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-amber-400 mb-1">Offense</p>
                        <p className="text-[13px] text-gray-300 leading-relaxed">{offenseObs}</p>
                      </div>
                    )}
                    {defenseObs && (
                      <div className="rounded-lg bg-sky-500/[0.05] border border-sky-500/15 px-4 py-3">
                        <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-sky-400 mb-1">Defense</p>
                        <p className="text-[13px] text-gray-300 leading-relaxed">
                          {defenseObs.replace(/=/g, ': ').replace(/, /g, ' · ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Right — possession rail ───────────────────────────────── */}
      <div className="lg:sticky lg:top-6 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-xl font-bold uppercase tracking-wide text-white">
            Possessions
          </p>
          <span className="text-[10px] text-gray-600 font-mono">{filtered.length}/{possessions.length}</span>
        </div>

        {/* Outcome filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all ${
                filter === f.id
                  ? 'border-orange-500/50 bg-orange-500/15 text-orange-300'
                  : 'border-white/[0.08] text-gray-500 hover:text-gray-300 hover:border-white/20'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="scroll-rail space-y-1.5 lg:max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          {filtered.map((pos, i) => {
            const isSelected = pos.possessionId === selectedId
            const meta = OUTCOME_META[pos.outcome] ?? null
            return (
              <motion.button
                key={pos.possessionId}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.4) }}
                onClick={() => selectPossession(pos)}
                className={`relative w-full text-left rounded-xl border px-3.5 py-3 transition-all duration-150 group ${
                  isSelected
                    ? 'border-orange-500/40 bg-orange-500/[0.07]'
                    : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.15] hover:bg-white/[0.04]'
                }`}
              >
                {/* Selected edge bar */}
                {isSelected && (
                  <motion.span
                    layoutId="possession-edge"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-orange-500"
                    style={{ boxShadow: '0 0 10px rgba(249,115,22,0.6)' }}
                  />
                )}

                <div className="flex items-center gap-2.5">
                  <span className={`font-display text-lg font-bold leading-none w-7 shrink-0 ${isSelected ? 'text-orange-400' : 'text-white/25 group-hover:text-white/50'} transition-colors`}>
                    {pos.possessionId + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${badgeClass(pos.possessionType)}`}>
                        {POSSESSION_TYPE_LABELS[pos.possessionType] ?? pos.possessionType}
                      </span>
                      {(pos.importanceScore ?? 0) >= 8 && (
                        <span className="text-[8px] font-bold tracking-wider uppercase text-orange-400">★ Key</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[10px] text-gray-600">
                        {formatTimestamp(pos.startTimestamp)}
                      </span>
                      {meta && (
                        <span className={`flex items-center gap-1 text-[9px] font-bold uppercase ${meta.text}`}>
                          <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <Play size={11} className={`shrink-0 transition-colors ${isSelected ? 'text-orange-400' : 'text-gray-700 group-hover:text-gray-400'}`} />
                </div>
              </motion.button>
            )
          })}

          {filtered.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-8">
              No possessions with this outcome.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
