'use client'

import { Target, Zap, RefreshCw, TrendingUp, Shield, Swords, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { PatternInsight, TendencyItem, GameIdentity, StrategicAdjustment, RankedObservation } from '@/lib/analyzeFrames'

interface Props {
  patternInsights: PatternInsight[]
  offensiveTendencies: TendencyItem[]
  defensiveTendencies: TendencyItem[]
  transitionAnalysis: string
  gameIdentity: GameIdentity | null
  strategicAdjustments?: StrategicAdjustment[]
  rankedObservations?: RankedObservation[]
}

const EVIDENCE_STYLES: Record<string, { badge: string; dot: string }> = {
  high:   { badge: 'text-green-400 bg-green-500/10 border-green-500/20',   dot: 'bg-green-500'  },
  medium: { badge: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-500' },
  low:    { badge: 'text-gray-500 bg-white/[0.03] border-white/[0.07]',     dot: 'bg-gray-600'   },
}

const SIGNIFICANCE_STYLES: Record<string, string> = {
  primary:   'text-orange-400 bg-orange-500/10 border-orange-500/20',
  secondary: 'text-gray-500 bg-white/[0.04] border-white/[0.08]',
}

const CATEGORY_STYLES: Record<string, string> = {
  offensive:  'text-purple-400 bg-purple-500/10 border-purple-500/20',
  defensive:  'text-red-400 bg-red-500/10 border-red-500/20',
  transition: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  spacing:    'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  general:    'text-gray-400 bg-white/[0.04] border-white/[0.08]',
}

const SIGNIFICANCE_DOT: Record<string, string> = {
  high:   'bg-orange-500',
  medium: 'bg-yellow-500',
  low:    'bg-gray-600',
}

const PACE_STYLES: Record<string, string> = {
  fast:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  slow:   'text-gray-400 bg-white/[0.06] border-white/[0.10]',
}

function seekFilm(timestamp: number) {
  window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp } }))
}

function fmtTs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function TimestampPills({ timestamps }: { timestamps: number[] }) {
  if (!timestamps || timestamps.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {timestamps.map((t, i) => (
        <button
          key={i}
          onClick={() => seekFilm(t)}
          className="text-[9px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full hover:bg-blue-500/20 transition-colors cursor-pointer"
        >
          ▶ {fmtTs(t)}
        </button>
      ))}
    </div>
  )
}

export default function GamePatterns({
  patternInsights,
  offensiveTendencies,
  defensiveTendencies,
  transitionAnalysis,
  gameIdentity,
  strategicAdjustments,
  rankedObservations = [],
}: Props) {
  const [supportingExpanded, setSupportingExpanded] = useState(false)

  const hasContent =
    rankedObservations.length > 0 ||
    patternInsights.length > 0 ||
    offensiveTendencies.length > 0 ||
    defensiveTendencies.length > 0 ||
    transitionAnalysis ||
    gameIdentity

  if (!hasContent) return null

  const hasSupporting =
    patternInsights.length > 0 ||
    offensiveTendencies.length > 0 ||
    defensiveTendencies.length > 0 ||
    transitionAnalysis ||
    (strategicAdjustments && strategicAdjustments.length > 0)

  return (
    <div className="space-y-6 mt-10 pt-10 border-t border-white/[0.05]">

      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
          Scouting Intelligence
        </p>
      </div>

      {/* Game Identity card — compact */}
      {gameIdentity && (
        <div className="rounded-2xl border border-orange-500/15 bg-gradient-to-br from-orange-950/20 to-transparent p-5 space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-orange-500/60">
              Team Identity
            </p>
            {gameIdentity.pace && (
              <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${PACE_STYLES[gameIdentity.pace] ?? PACE_STYLES.medium}`}>
                {gameIdentity.pace} pace
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gameIdentity.offensiveIdentity && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Swords size={11} className="text-purple-400" />
                  <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-purple-400/70">Offense</span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed">{gameIdentity.offensiveIdentity}</p>
              </div>
            )}
            {gameIdentity.defensiveIdentity && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Shield size={11} className="text-red-400" />
                  <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-red-400/70">Defense</span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed">{gameIdentity.defensiveIdentity}</p>
              </div>
            )}
          </div>
          {(gameIdentity.primaryStrengths.length > 0 || gameIdentity.primaryWeaknesses.length > 0) && (
            <div className="flex flex-wrap gap-4 pt-1 border-t border-white/[0.05]">
              {gameIdentity.primaryStrengths.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-green-500/60">Strengths</span>
                  <div className="flex flex-wrap gap-1.5">
                    {gameIdentity.primaryStrengths.map((s, i) => (
                      <span key={i} className="text-[10px] text-green-300 bg-green-500/10 border border-green-500/20 px-2.5 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {gameIdentity.primaryWeaknesses.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-red-500/60">Vulnerabilities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {gameIdentity.primaryWeaknesses.map((w, i) => (
                      <span key={i} className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">{w}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RANKED OBSERVATIONS — primary intelligence layer ── */}
      {rankedObservations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-400">
                Ranked Observations
              </p>
              <span className="text-[9px] text-gray-600 bg-white/[0.04] border border-white/[0.07] px-2 py-0.5 rounded-full">
                {rankedObservations.length} findings
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {rankedObservations.map((obs, i) => {
              const ev = EVIDENCE_STYLES[obs.evidenceStrength] ?? EVIDENCE_STYLES.medium
              const isPrimary = obs.tacticalSignificance === 'primary'
              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 space-y-4 transition-colors ${
                    isPrimary
                      ? 'border-white/[0.09] bg-white/[0.025]'
                      : 'border-white/[0.05] bg-white/[0.01]'
                  }`}
                >
                  {/* Top row: rank + badges */}
                  <div className="flex items-start gap-4">
                    {/* Rank number */}
                    <div className="shrink-0 flex flex-col items-center pt-0.5">
                      <span className={`font-black leading-none tabular-nums ${
                        isPrimary ? 'text-3xl text-orange-500/70' : 'text-2xl text-gray-600'
                      }`}>
                        #{obs.rank}
                      </span>
                    </div>

                    {/* Title + badges */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[8px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${SIGNIFICANCE_STYLES[obs.tacticalSignificance] ?? SIGNIFICANCE_STYLES.secondary}`}>
                          {obs.tacticalSignificance}
                        </span>
                        <span className={`text-[8px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${ev.badge}`}>
                          {obs.confidenceLevel} confidence
                        </span>
                        {obs.supportingTimestamps.length > 0 && (
                          <span className="flex items-center gap-1 text-[9px] text-gray-600">
                            <span className={`w-1.5 h-1.5 rounded-full ${ev.dot}`} />
                            {obs.supportingTimestamps.length} possession{obs.supportingTimestamps.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <h3 className={`font-bold leading-snug ${isPrimary ? 'text-base text-white' : 'text-sm text-gray-200'}`}>
                        {obs.title}
                      </h3>
                    </div>
                  </div>

                  {/* Detailed observation */}
                  {obs.detailedObservation && (
                    <p className="text-[12px] text-gray-400 leading-relaxed pl-12">
                      {obs.detailedObservation}
                    </p>
                  )}

                  {/* Basketball context */}
                  {obs.basketballContext && (
                    <div className="pl-12 flex items-start gap-2">
                      <Target size={10} className="text-orange-500/40 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-gray-600 leading-relaxed italic">
                        {obs.basketballContext}
                      </p>
                    </div>
                  )}

                  {/* Timestamp pills */}
                  {obs.supportingTimestamps.length > 0 && (
                    <div className="pl-12">
                      <TimestampPills timestamps={obs.supportingTimestamps} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SUPPORTING INTELLIGENCE — collapsible ── */}
      {hasSupporting && (
        <div className="space-y-3">
          <button
            onClick={() => setSupportingExpanded(v => !v)}
            className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600 hover:text-gray-400 transition-colors group"
          >
            {supportingExpanded
              ? <ChevronUp size={12} className="text-gray-600 group-hover:text-gray-400" />
              : <ChevronDown size={12} className="text-gray-600 group-hover:text-gray-400" />
            }
            Supporting Intelligence
          </button>

          {supportingExpanded && (
            <div className="space-y-8 pt-2">

              {/* Pattern Insights */}
              {patternInsights.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                    Recurring Patterns · {patternInsights.length}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {patternInsights.map((p, i) => (
                      <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3 hover:border-orange-500/20 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full border ${CATEGORY_STYLES[p.category] ?? CATEGORY_STYLES.general}`}>
                                {p.category}
                              </span>
                              {p.occurrences > 1 && (
                                <span className="text-[9px] font-bold text-orange-500/70 bg-orange-500/10 border border-orange-500/15 px-1.5 py-0.5 rounded-full">
                                  {p.occurrences}×
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-gray-100 leading-snug">{p.patternName}</p>
                          </div>
                        </div>
                        {p.description && <p className="text-[11px] text-gray-500 leading-relaxed">{p.description}</p>}
                        <TimestampPills timestamps={p.supportingTimestamps ?? []} />
                        {p.coachingImpact && (
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold tracking-[0.14em] uppercase text-gray-600">Impact</span>
                            <p className="text-[11px] text-gray-400 leading-relaxed">{p.coachingImpact}</p>
                          </div>
                        )}
                        {p.recommendation && (
                          <div className="space-y-1 pt-1 border-t border-white/[0.04]">
                            <div className="flex items-center gap-1.5">
                              <Zap size={9} className="text-orange-400" />
                              <span className="text-[8px] font-bold tracking-[0.14em] uppercase text-orange-400/70">Recommendation</span>
                            </div>
                            <p className="text-[11px] text-orange-200/70 leading-relaxed">{p.recommendation}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tendencies */}
              {(offensiveTendencies.length > 0 || defensiveTendencies.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {offensiveTendencies.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Swords size={11} className="text-purple-400/60" />
                        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">Offensive Tendencies</p>
                      </div>
                      <div className="space-y-2">
                        {offensiveTendencies.map((t, i) => (
                          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${SIGNIFICANCE_DOT[t.significance] ?? SIGNIFICANCE_DOT.medium}`} />
                            <div className="space-y-1 flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-300">{t.name}</p>
                              <p className="text-[10px] text-gray-600 leading-relaxed">{t.description}</p>
                              <TimestampPills timestamps={t.supportingTimestamps ?? []} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {defensiveTendencies.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield size={11} className="text-red-400/60" />
                        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">Defensive Tendencies</p>
                      </div>
                      <div className="space-y-2">
                        {defensiveTendencies.map((t, i) => (
                          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${SIGNIFICANCE_DOT[t.significance] ?? SIGNIFICANCE_DOT.medium}`} />
                            <div className="space-y-1 flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-300">{t.name}</p>
                              <p className="text-[10px] text-gray-600 leading-relaxed">{t.description}</p>
                              <TimestampPills timestamps={t.supportingTimestamps ?? []} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Transition Analysis */}
              {transitionAnalysis && (
                <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-4 py-3.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <RefreshCw size={10} className="text-blue-400/60" />
                    <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-blue-400/60">Transition Analysis</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <TrendingUp size={12} className="text-blue-400/40 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-400 leading-relaxed">{transitionAnalysis}</p>
                  </div>
                </div>
              )}

              {/* Strategic Adjustments */}
              {strategicAdjustments && strategicAdjustments.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={11} className="text-orange-400/60" />
                    <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">Strategic Adjustments Observed</p>
                  </div>
                  <div className="space-y-2">
                    {strategicAdjustments.map((adj, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                          adj.direction === 'increase' ? 'bg-green-500' :
                          adj.direction === 'decrease' ? 'bg-red-500' :
                          adj.direction === 'shift' ? 'bg-blue-500' : 'bg-gray-600'
                        }`} />
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-bold tracking-wider uppercase text-gray-600">{adj.phase}</span>
                          <p className="text-xs text-gray-300 leading-relaxed">{adj.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

    </div>
  )
}
