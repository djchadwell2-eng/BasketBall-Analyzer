'use client'

import { useRef, useState, useEffect } from 'react'
import { Play, Clock, ChevronRight, Zap, ArrowRight, Target, Eye, RefreshCw, ChevronDown } from 'lucide-react'
import AnalysisSummary from './AnalysisSummary'

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

// ── Color constants (light theme) ─────────────────────────────────────────────

const PLAY_TYPE_COLORS: Record<string, string> = {
  'Transition':          'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Half-court offense':  'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'Pick-and-roll':       'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Post-up':             'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Defense rotation':    'text-red-400 bg-red-500/10 border-red-500/20',
  'Full-court press':    'text-red-400 bg-red-500/10 border-red-500/20',
  'Set play':            'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Fast break':          'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Iso':                 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Press break':         'text-teal-400 bg-teal-500/10 border-teal-500/20',
}

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
  'transition':             'text-blue-400 bg-blue-500/10 border-blue-500/20',
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

// Used in the active sequence card (left panel)
const OUTCOME_COLORS: Record<string, string> = {
  'made':           'text-emerald-400',
  'missed':         'text-red-400',
  'turnover':       'text-amber-400',
  'defensive-stop': 'text-blue-400',
  'unknown':        'text-gray-500',
}

// Used in the expanded possession breakdown badge (right panel)
const OUTCOME_BADGE: Record<string, { label: string; cls: string }> = {
  'made':           { label: 'Made',     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'missed':         { label: 'Missed',   cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'turnover':       { label: 'Turnover', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'defensive-stop': { label: 'Stop',     cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
}

function playTypeBadgeClass(playType: string): string {
  return PLAY_TYPE_COLORS[playType] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
}

function possessionBadgeClass(type: string): string {
  return POSSESSION_TYPE_COLORS[type] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Active-sequence coaching breakdown (left panel) ───────────────────────────

interface CoachingSectionProps {
  icon: React.ReactNode
  label: string
  text: string
  accent?: boolean
}

function CoachingSection({ icon, label, text, accent }: CoachingSectionProps) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className={accent ? 'text-orange-400' : 'text-gray-500'}>{icon}</span>
        <span className={`text-[9px] font-bold tracking-[0.18em] uppercase ${accent ? 'text-orange-400' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <p className={`text-xs leading-relaxed pl-5 ${accent ? 'text-orange-300' : 'text-gray-400'}`}>
        {text}
      </p>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilmRoom({ videoUrl, sequences, possessions = [], reportText, model, frameCount, analyzedAt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeSeq, setActiveSeq] = useState<number | null>(null)
  const [expandedPossessions, setExpandedPossessions] = useState<Set<number>>(new Set([0]))
  const [showReport, setShowReport] = useState(false)
  const [videoError, setVideoError] = useState(false)

  useEffect(() => {
    function handleSeekFilm(e: Event) {
      const { timestamp } = (e as CustomEvent<{ timestamp: number }>).detail
      if (videoRef.current) {
        videoRef.current.currentTime = timestamp
        videoRef.current.play()
      }
    }
    window.addEventListener('seekFilm', handleSeekFilm)
    return () => window.removeEventListener('seekFilm', handleSeekFilm)
  }, [])

  function seekTo(timestampStart: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = timestampStart
      videoRef.current.play()
    }
  }

  function handlePossessionClick(pos: PossessionResult) {
    seekTo(pos.startTimestamp)
    setExpandedPossessions(prev => {
      const next = new Set(prev)
      if (next.has(pos.possessionId)) {
        next.delete(pos.possessionId)
      } else {
        next.add(pos.possessionId)
      }
      return next
    })
  }

  function handleSequenceClick(seq: SequenceResult) {
    setActiveSeq(seq.sequenceIndex)
    seekTo(seq.timestampStart)
  }

  const hasPossessions = possessions.length > 0
  const hasSequences = sequences.length > 0
  const activeSequence = sequences.find(s => s.sequenceIndex === activeSeq) ?? null

  const hasRichBreakdown = (seq: SequenceResult) =>
    Boolean(seq.whatHappened || seq.whatItMeans || seq.whyItMatters || seq.coachingPoint)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start">

      {/* ── Left — Video + active sequence card (sticky) ───────────────── */}
      <div className="lg:sticky lg:top-6 space-y-4">
        <p className="text-[11px] font-semibold text-orange-600 tracking-[0.22em] uppercase">
          Game Film
        </p>

        {videoUrl && !videoError ? (
          <video
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

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-gray-600 font-mono">
          {model && <span>{model}</span>}
          {frameCount !== undefined && <><span className="text-gray-700">·</span><span>{frameCount} frames</span></>}
          {hasPossessions && <><span className="text-gray-700">·</span><span>{possessions.length} possessions</span></>}
          {analyzedAt && (
            <><span className="text-gray-700">·</span>
            <span>{new Date(analyzedAt).toLocaleDateString()} {new Date(analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></>
          )}
        </div>

        {/* Active sequence detail card */}
        {activeSequence && (
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] overflow-hidden shadow-lg shadow-orange-900/10">
            {activeSequence.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/jpeg;base64,${activeSequence.thumbnail}`}
                alt={`Sequence ${activeSequence.sequenceIndex + 1}`}
                className="w-full object-cover max-h-44"
              />
            )}
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border ${playTypeBadgeClass(activeSequence.playType)}`}>
                  {activeSequence.playType}
                </span>
                <span className="text-xs font-mono text-gray-500">
                  {formatTimestamp(activeSequence.timestampStart)} → {formatTimestamp(activeSequence.timestampEnd)}
                </span>
                {activeSequence.outcome !== 'unknown' && (
                  <span className={`text-[10px] font-bold uppercase ${OUTCOME_COLORS[activeSequence.outcome]}`}>
                    · {activeSequence.outcome}
                  </span>
                )}
              </div>

              {hasRichBreakdown(activeSequence) ? (
                <div className="space-y-4 divide-y divide-white/[0.06]">
                  <CoachingSection icon={<Eye size={10} />} label="What Happened" text={activeSequence.whatHappened} />
                  {activeSequence.whatItMeans && (
                    <div className="pt-3">
                      <CoachingSection icon={<ArrowRight size={10} />} label="What It Means" text={activeSequence.whatItMeans} />
                    </div>
                  )}
                  {activeSequence.whyItMatters && (
                    <div className="pt-3">
                      <CoachingSection icon={<Target size={10} />} label="Why It Matters" text={activeSequence.whyItMatters} />
                    </div>
                  )}
                  {activeSequence.coachingPoint && (
                    <div className="pt-3">
                      <CoachingSection icon={<Zap size={10} />} label="Coaching Point" text={activeSequence.coachingPoint} accent />
                    </div>
                  )}
                  {activeSequence.patternContext && (
                    <div className="pt-3">
                      <CoachingSection icon={<RefreshCw size={10} />} label="Pattern Context" text={activeSequence.patternContext} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400 leading-relaxed">{activeSequence.summary}</p>
                  {activeSequence.coachingTakeaway && (
                    <div className="flex gap-2.5 pt-1">
                      <Zap size={13} className="text-orange-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-orange-300 leading-relaxed">{activeSequence.coachingTakeaway}</p>
                    </div>
                  )}
                </div>
              )}

              {activeSequence.tags && activeSequence.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeSequence.tags.map((tag) => (
                    <span key={tag} className="text-[9px] font-medium text-gray-500 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right — Possession timeline + report ───────────────────────── */}
      <div className="space-y-4">

        {hasPossessions ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-orange-600 tracking-[0.22em] uppercase">
                Possessions
              </p>
              <span className="text-[10px] text-gray-600">
                {possessions.length} possessions · {sequences.length} sequences
              </span>
            </div>

            {/* Possession-grouped timeline */}
            <div className="space-y-2">
              {possessions.map((pos) => {
                const isExpanded = expandedPossessions.has(pos.possessionId)
                const posLabel = POSSESSION_TYPE_LABELS[pos.possessionType] ?? pos.possessionType
                // Pre-compute for the expanded breakdown
                const offenseObs = pos.keyObservations.find(o => o.startsWith('OFFENSE: '))?.slice(9) ?? null
                const defenseObs = pos.keyObservations.find(o => o.startsWith('DEFENSE: '))?.slice(9) ?? null
                const outcomeBadge = OUTCOME_BADGE[pos.outcome] ?? null
                const hasBreakdown = !!(pos.coachingInsight || offenseObs || defenseObs)

                return (
                  <div key={pos.possessionId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden hover:border-white/[0.12] transition-colors">

                    {/* Possession header (collapsed row) */}
                    <button
                      onClick={() => handlePossessionClick(pos)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors group"
                    >
                      <span className="shrink-0 w-5 h-5 rounded-full bg-white/[0.06] text-[9px] font-bold text-gray-500 flex items-center justify-center">
                        {pos.possessionId + 1}
                      </span>

                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${possessionBadgeClass(pos.possessionType)}`}>
                          {posLabel}
                        </span>
                        {pos.importanceScore !== undefined && (
                          <span className={`text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full border ${
                            pos.importanceScore >= 8 ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                            pos.importanceScore >= 5 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                            'text-gray-500 bg-white/[0.04] border-white/[0.08]'
                          }`}>
                            {pos.importanceScore >= 8 ? 'HIGH' : pos.importanceScore >= 5 ? 'MED' : 'LOW'}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-gray-600">
                          {formatTimestamp(pos.startTimestamp)} → {formatTimestamp(pos.endTimestamp)}
                        </span>
                      </div>

                      <ChevronDown
                        size={13}
                        className={`shrink-0 text-gray-700 group-hover:text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* ── Expanded breakdown ──────────────────────────── */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.06]">

                        {hasBreakdown && (
                          <div className="px-4 py-4 space-y-3.5">

                            {/* 1. Outcome badge + timestamp */}
                            <div className="flex items-center gap-2.5">
                              {outcomeBadge && (
                                <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${outcomeBadge.cls}`}>
                                  <span className="text-[8px] leading-none">●</span>
                                  {outcomeBadge.label}
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-gray-600">
                                {formatTimestamp(pos.startTimestamp)} → {formatTimestamp(pos.endTimestamp)}
                              </span>
                            </div>

                            {/* 2. Coaching takeaway — headline */}
                            {pos.coachingInsight && (
                              <p className="text-sm font-semibold text-white leading-relaxed">
                                {pos.coachingInsight}
                              </p>
                            )}

                            {/* 3. Offense / Defense detail */}
                            {(offenseObs || defenseObs) && (
                              <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                                {offenseObs && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-400">
                                      Offense
                                    </span>
                                    <p className="text-xs text-gray-400 leading-relaxed">{offenseObs}</p>
                                  </div>
                                )}
                                {defenseObs && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-red-400">
                                      Defense
                                    </span>
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                      {defenseObs.replace(/=/g, ': ').replace(/, /g, ' · ')}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        )}

                        {/* Sequence rows */}
                        {pos.sequences.length > 0 && (
                          <div className={`divide-y divide-white/[0.05] ${hasBreakdown ? 'border-t border-white/[0.06]' : ''}`}>
                            {pos.sequences.map((seq) => {
                              const isActive = activeSeq === seq.sequenceIndex
                              return (
                                <button
                                  key={seq.sequenceIndex}
                                  onClick={() => handleSequenceClick(seq)}
                                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-all group ${
                                    isActive ? 'bg-orange-500/[0.06]' : 'hover:bg-white/[0.03]'
                                  }`}
                                >
                                  <div className="shrink-0 w-10 h-7 rounded-md overflow-hidden bg-white/[0.05] border border-white/[0.08]">
                                    {seq.thumbnail ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={`data:image/jpeg;base64,${seq.thumbnail}`} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Play size={8} className="text-gray-600" />
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={`text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${playTypeBadgeClass(seq.playType)}`}>
                                      {seq.playType}
                                    </span>
                                    <span className="text-[9px] font-mono text-gray-600 shrink-0">
                                      {formatTimestamp(seq.timestampStart)}
                                    </span>
                                  </div>

                                  <ChevronRight
                                    size={11}
                                    className={`shrink-0 transition-colors ${isActive ? 'text-orange-400' : 'text-gray-700 group-hover:text-gray-400'}`}
                                  />
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Full report toggle */}
            {reportText && (
              <div className="pt-2">
                <button
                  onClick={() => setShowReport(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.08] hover:border-white/[0.15] text-gray-500 hover:text-gray-300 transition-all text-xs font-medium bg-white/[0.02]"
                >
                  <span>Full Scouting Report</span>
                  <ChevronRight size={13} className={`transition-transform ${showReport ? 'rotate-90' : ''}`} />
                </button>
                {showReport && (
                  <div className="mt-3">
                    <AnalysisSummary analysis={{ summary: reportText, model: model ?? '', frameCount: frameCount ?? 0 }} />
                  </div>
                )}
              </div>
            )}
          </>

        ) : hasSequences ? (
          <>
            {/* Flat sequence list (legacy / fallback) */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-orange-600 tracking-[0.22em] uppercase">
                Key Sequences
              </p>
              <span className="text-[10px] font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                {sequences.length} moments
              </span>
            </div>

            <div className="space-y-2">
              {sequences.map((seq) => {
                const isActive = activeSeq === seq.sequenceIndex
                const preview = seq.whatHappened || seq.summary
                return (
                  <button
                    key={seq.sequenceIndex}
                    onClick={() => handleSequenceClick(seq)}
                    className={`w-full text-left flex items-start gap-4 px-4 py-4 rounded-xl border transition-all duration-200 group ${
                      isActive
                        ? 'border-orange-500/30 bg-orange-500/[0.06]'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-orange-500/20 hover:bg-orange-500/[0.04]'
                    }`}
                  >
                    <div className="shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-white/[0.05] border border-white/[0.08]">
                      {seq.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`data:image/jpeg;base64,${seq.thumbnail}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play size={14} className="text-gray-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${playTypeBadgeClass(seq.playType)}`}>
                          {seq.playType}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-mono text-gray-600">
                          <Clock size={9} />
                          {formatTimestamp(seq.timestampStart)}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed line-clamp-2 ${isActive ? 'text-gray-200' : 'text-gray-500 group-hover:text-gray-400'}`}>
                        {preview}
                      </p>
                    </div>
                    <ChevronRight size={14} className={`shrink-0 mt-1 transition-colors ${isActive ? 'text-orange-400' : 'text-gray-700 group-hover:text-gray-400'}`} />
                  </button>
                )
              })}
            </div>

            {reportText && (
              <div className="pt-2">
                <button
                  onClick={() => setShowReport(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.08] hover:border-white/[0.15] text-gray-500 hover:text-gray-300 transition-all text-xs font-medium bg-white/[0.02]"
                >
                  <span>Full Scouting Report</span>
                  <ChevronRight size={13} className={`transition-transform ${showReport ? 'rotate-90' : ''}`} />
                </button>
                {showReport && (
                  <div className="mt-3">
                    <AnalysisSummary analysis={{ summary: reportText, model: model ?? '', frameCount: frameCount ?? 0 }} />
                  </div>
                )}
              </div>
            )}
          </>

        ) : (
          /* No sequences at all */
          <>
            <p className="text-[11px] font-semibold text-orange-600 tracking-[0.22em] uppercase">
              Scouting Report
            </p>
            {reportText && (
              <AnalysisSummary analysis={{ summary: reportText, model: model ?? '', frameCount: frameCount ?? 0 }} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
