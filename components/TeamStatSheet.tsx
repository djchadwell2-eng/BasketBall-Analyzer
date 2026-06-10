'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { computeTrends } from '@/lib/computeTrends'
import { computeStats } from '@/lib/computeStats'
import type { PossessionResult, SequenceResult } from '@/components/FilmRoom'

interface Props {
  possessions: PossessionResult[]
  sequences: SequenceResult[]
}

const TYPE_LABELS: Record<string, string> = {
  transition: 'Transition',
  half_court: 'Half Court',
  defensive_sequence: 'Defensive',
  special_situation: 'Special',
  pick_and_roll: 'Pick & Roll',
  isolation: 'Isolation',
  post_up: 'Post Up',
  scramble: 'Scramble',
  early_offense: 'Early Offense',
  late_clock: 'Late Clock',
  baseline_out_of_bounds: 'BLOB',
  sideline_out_of_bounds: 'SLOB',
}

const EVENT_LABELS: Record<string, string> = {
  drive_left: 'Drive Left',
  drive_right: 'Drive Right',
  paint_touch: 'Paint Touch',
  kickout_pass: 'Kick-Out Pass',
  pick_and_roll: 'Pick & Roll',
  catch_and_shoot: 'Catch & Shoot',
  corner_three: 'Corner Three',
  transition_push: 'Transition Push',
  isolation: 'Isolation',
  ball_reversal: 'Ball Reversal',
  help_rotation: 'Help Rotation',
  defensive_collapse: 'Def. Collapse',
  late_closeout: 'Late Closeout',
  transition_recovery: 'Trans. Recovery',
  hedge: 'Hedge',
  switch: 'Switch',
  paint_help: 'Paint Help',
  closeout: 'Closeout',
}

function seekFilm(ts: number) {
  window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp: ts } }))
}

function TrendIcon({ trend }: { trend: 'increasing' | 'decreasing' | 'stable' }) {
  if (trend === 'increasing') return <TrendingUp size={11} className="text-green-400 shrink-0" />
  if (trend === 'decreasing') return <TrendingDown size={11} className="text-red-400 shrink-0" />
  return <Minus size={11} className="text-gray-600 shrink-0" />
}

export default function TeamStatSheet({ possessions, sequences }: Props) {
  if (possessions.length === 0) return null

  const trends = useMemo(() => computeTrends(possessions), [possessions])
  const stats = useMemo(() => computeStats(sequences, possessions), [sequences, possessions])

  // Most common pace profile
  const paceFreq: Record<string, number> = {}
  for (const p of possessions) {
    paceFreq[p.paceProfile] = (paceFreq[p.paceProfile] ?? 0) + 1
  }
  const topPace = Object.entries(paceFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'medium'

  // First timestamp per possession type (for click navigation)
  const firstTsByType: Record<string, number> = {}
  for (const p of possessions) {
    if (!(p.possessionType in firstTsByType)) {
      firstTsByType[p.possessionType] = p.startTimestamp
    }
  }

  // Trend lookup by type
  const trendByType: Record<string, 'increasing' | 'decreasing' | 'stable'> = {}
  for (const t of trends.typeTrends) trendByType[t.type] = t.trend

  // Possession type totals sorted by count
  const typeTotals = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const p of possessions) acc[p.possessionType] = (acc[p.possessionType] ?? 0) + 1
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [possessions])

  const maxTopEvent = trends.topEvents[0]?.count ?? 1

  return (
    <div className="space-y-8 mt-10 pt-10 border-t border-white/[0.05]">

      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
          Team Statistics
        </p>
      </div>

      {/* Game Overview */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Possessions', value: String(trends.totalPossessions) },
          { label: 'Avg Importance', value: stats.avgImportanceScore !== null ? `${stats.avgImportanceScore}/10` : '—' },
          { label: 'Pace', value: topPace.charAt(0).toUpperCase() + topPace.slice(1) },
        ].map(chip => (
          <div
            key={chip.label}
            className="flex flex-col items-center px-4 py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] min-w-[90px]"
          >
            <span className="text-base font-bold text-white">{chip.value}</span>
            <span className="text-[9px] font-semibold text-gray-600 tracking-[0.14em] uppercase mt-0.5">{chip.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Left column */}
        <div className="space-y-8">

          {/* Possession Breakdown table */}
          {typeTotals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Possession Breakdown
                </p>
              </div>
              <div className="space-y-1">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_40px_48px_20px] gap-2 px-2 pb-1 border-b border-white/[0.05]">
                  {['Type', 'Count', '%', ''].map(h => (
                    <span key={h} className="text-[9px] font-semibold text-gray-700 tracking-[0.12em] uppercase">{h}</span>
                  ))}
                </div>
                {typeTotals.map(([type, count], i) => {
                  const pct = ((count / trends.totalPossessions) * 100).toFixed(1)
                  return (
                    <motion.div
                      key={type}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className="grid grid-cols-[1fr_40px_48px_20px] gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] cursor-pointer group transition-colors"
                      onClick={() => seekFilm(firstTsByType[type] ?? 0)}
                    >
                      <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors truncate">
                        {TYPE_LABELS[type] ?? type}
                      </span>
                      <span className="text-xs text-gray-400 font-semibold">{count}</span>
                      <span className="text-[10px] text-orange-400/70 font-medium">{pct}%</span>
                      <TrendIcon trend={trendByType[type] ?? 'stable'} />
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Phase Analysis */}
          {trends.phases.length === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Phase Analysis
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {trends.phases.map((phase, i) => {
                  const topType = Object.entries(phase.typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
                  return (
                    <motion.div
                      key={phase.label}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02]"
                    >
                      <span className="text-[9px] font-bold text-gray-600 tracking-[0.12em] uppercase">{phase.label}</span>
                      <span className="text-xl font-bold text-white">{phase.possessionCount}</span>
                      {phase.avgImportance !== null && (
                        <span className="text-[9px] text-orange-400/60">{phase.avgImportance} avg imp.</span>
                      )}
                      {topType && (
                        <span className="text-[9px] text-gray-500 truncate">{TYPE_LABELS[topType] ?? topType}</span>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Right column */}
        <div className="space-y-8">

          {/* Event Intelligence */}
          {trends.topEvents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Event Intelligence
                </p>
              </div>
              <div className="space-y-2.5">
                {trends.topEvents.map((ev, i) => {
                  const pct = Math.round((ev.count / maxTopEvent) * 100)
                  return (
                    <div key={ev.type} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-300 font-medium">
                          {EVENT_LABELS[ev.type] ?? ev.type}
                        </span>
                        <span className="text-[10px] font-semibold text-orange-500/60 shrink-0">
                          {ev.count}×
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-orange-500/10 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-orange-500/40"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, delay: i * 0.04 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Type Trends */}
          {trends.typeTrends.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Trend Analysis
                </p>
              </div>
              <div className="space-y-2">
                {trends.typeTrends.map((t, i) => (
                  <motion.div
                    key={t.type}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.06 }}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-xs text-gray-400">{TYPE_LABELS[t.type] ?? t.type}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {t.counts.map((c, idx) => (
                          <span key={idx} className="text-[9px] font-mono text-gray-600 w-4 text-center">{c}</span>
                        ))}
                      </div>
                      <TrendIcon trend={t.trend} />
                    </div>
                  </motion.div>
                ))}
              </div>
              <p className="text-[9px] text-gray-700">Phase counts: 1st · 2nd · 3rd third</p>
            </div>
          )}

        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] text-gray-700 italic pt-2">
        Statistics derived from AI-sampled footage. Values are estimates based on observed sequences.
      </p>
    </div>
  )
}
