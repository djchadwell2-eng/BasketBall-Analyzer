'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart2, Tag, PlayCircle, Target } from 'lucide-react'
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

const TYPE_COLORS: Record<string, string> = {
  transition: 'text-blue-400 border-blue-500/20 bg-blue-500/[0.06]',
  half_court: 'text-purple-400 border-purple-500/20 bg-purple-500/[0.06]',
  defensive_sequence: 'text-red-400 border-red-500/20 bg-red-500/[0.06]',
  special_situation: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/[0.06]',
  pick_and_roll: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/[0.06]',
  isolation: 'text-orange-400 border-orange-500/20 bg-orange-500/[0.06]',
  post_up: 'text-red-400 border-red-500/20 bg-red-500/[0.06]',
  scramble: 'text-pink-400 border-pink-500/20 bg-pink-500/[0.06]',
  early_offense: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/[0.06]',
  late_clock: 'text-amber-400 border-amber-500/20 bg-amber-500/[0.06]',
  baseline_out_of_bounds: 'text-gray-400 border-white/[0.08] bg-white/[0.03]',
  sideline_out_of_bounds: 'text-gray-400 border-white/[0.08] bg-white/[0.03]',
}

const TAG_LABELS: Record<string, string> = {
  downhill_attack: 'Downhill Attack',
  spacing_creation: 'Spacing Creation',
  weakside_action: 'Weak-Side Action',
  paint_pressure: 'Paint Pressure',
  transition_pressure: 'Transition Pressure',
  corner_spacing: 'Corner Spacing',
  drive_and_kick: 'Drive & Kick',
  high_pnr: 'High PnR',
  paint_collapse: 'Paint Collapse',
  late_rotation: 'Late Rotation',
  aggressive_help: 'Aggressive Help',
  switch_miscommunication: 'Switch Miscommunication',
  transition_recovery_issue: 'Transition Recovery Issue',
  weak_closeout: 'Weak Closeout',
}

function seekFilm(ts: number) {
  window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp: ts } }))
}

function fmt(ts: number) {
  const m = Math.floor(ts / 60)
  const s = Math.floor(ts % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function PossessionAnalytics({ possessions, sequences }: Props) {
  // Possession type counts + first timestamp (for click navigation)
  const typeData = useMemo(() => {
    const acc: Record<string, { count: number; firstTs: number }> = {}
    for (const p of possessions) {
      const t = p.possessionType
      if (!acc[t]) acc[t] = { count: 0, firstTs: p.startTimestamp }
      acc[t].count++
    }
    return Object.entries(acc).sort((a, b) => b[1].count - a[1].count)
  }, [possessions])

  // Tactical tag counts + first timestamp
  const tagData = useMemo(() => {
    const acc: Record<string, { count: number; firstTs: number }> = {}
    for (const p of possessions) {
      for (const tag of (p.tacticalTags ?? [])) {
        if (!acc[tag]) acc[tag] = { count: 0, firstTs: p.startTimestamp }
        acc[tag].count++
      }
    }
    return Object.entries(acc).sort((a, b) => b[1].count - a[1].count)
  }, [possessions])

  const maxTagCount = Math.max(...tagData.map(([, d]) => d.count), 1)

  // V13 computed stats — play type freq + outcome rates
  const stats = useMemo(() => computeStats(sequences, possessions), [sequences, possessions])

  const maxPlayTypeCount = Math.max(...stats.playTypeFreq.map(p => p.count), 1)

  if (possessions.length === 0) return null

  return (
    <div className="space-y-8 mt-10 pt-10 border-t border-white/[0.05]">

      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
          Possession Analytics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Left column */}
        <div className="space-y-8">

          {/* Possession Types — clickable */}
          {typeData.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BarChart2 size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Possession Types
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {typeData.map(([type, { count, firstTs }], i) => (
                  <motion.button
                    key={type}
                    onClick={() => seekFilm(firstTs)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer ${TYPE_COLORS[type] ?? 'text-gray-400 border-white/[0.08] bg-white/[0.03]'}`}
                    title={`Jump to first ${TYPE_LABELS[type] ?? type}`}
                  >
                    <span>{TYPE_LABELS[type] ?? type}</span>
                    <span className="opacity-60 font-normal">{count}×</span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Play Type Breakdown (V13) */}
          {stats.playTypeFreq.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <PlayCircle size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Play Type Breakdown
                </p>
              </div>
              <div className="space-y-3">
                {stats.playTypeFreq.map((pt, i) => {
                  const pct = Math.round((pt.count / maxPlayTypeCount) * 100)
                  return (
                    <div
                      key={pt.playType}
                      className="space-y-1 cursor-pointer group"
                      onClick={() => pt.timestamps[0] != null && seekFilm(pt.timestamps[0])}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">
                          {pt.playType}
                        </span>
                        <span className="text-[10px] font-semibold text-orange-500/60 shrink-0">
                          {pt.count}×
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-orange-500/10 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-orange-500/50"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, delay: i * 0.04 }}
                        />
                      </div>
                      {/* Timestamp pills */}
                      {pt.timestamps.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {pt.timestamps.map((ts, idx) => (
                            <button
                              key={idx}
                              onClick={e => { e.stopPropagation(); seekFilm(ts) }}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded border bg-orange-500/10 text-orange-300/70 hover:bg-orange-500/20 border-orange-500/20 transition-colors"
                            >
                              {fmt(ts)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Right column */}
        <div className="space-y-8">

          {/* Tactical Tendencies — clickable */}
          {tagData.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tag size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Tactical Tendencies
                </p>
              </div>
              <div className="space-y-2.5">
                {tagData.map(([tag, { count, firstTs }], i) => {
                  const pct = Math.round((count / maxTagCount) * 100)
                  return (
                    <div
                      key={tag}
                      className="space-y-1 cursor-pointer group"
                      onClick={() => seekFilm(firstTs)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">
                          {TAG_LABELS[tag] ?? tag}
                        </span>
                        <span className="text-[10px] font-semibold text-orange-500/60 shrink-0">
                          {count} observed
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

          {/* Outcome Rates by Type (V13) */}
          {stats.outcomeByType.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target size={11} className="text-gray-600" />
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-gray-600">
                  Outcome Rates by Type
                </p>
              </div>
              <div className="space-y-3">
                {stats.outcomeByType.map((ot, i) => {
                  const madePct = Math.round(ot.madeRate * 100)
                  return (
                    <div key={ot.type} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-300 font-medium">
                          {TYPE_LABELS[ot.type] ?? ot.type}
                        </span>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          {ot.made}/{ot.total} made
                          {ot.total > 0 && (
                            <span className="ml-1 text-orange-400/70">({madePct}%)</span>
                          )}
                        </span>
                      </div>
                      {/* Split bar: orange = made, gray = rest */}
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex">
                        <motion.div
                          className="h-full bg-orange-500/60 rounded-l-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${madePct}%` }}
                          transition={{ duration: 0.5, delay: i * 0.06 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
