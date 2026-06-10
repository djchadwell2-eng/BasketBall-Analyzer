'use client'

import type { PossessionResult } from './FilmRoom'

interface Props {
  possessions: PossessionResult[]
}

const POSSESSION_TYPE_COLORS: Record<string, string> = {
  'transition': '#60a5fa',
  'half_court': '#a78bfa',
  'defensive_sequence': '#f87171',
  'special_situation': '#fbbf24',
  'pick_and_roll': '#fbbf24',
  'isolation': '#fb923c',
  'post_up': '#f87171',
  'scramble': '#f472b6',
  'early_offense': '#22d3ee',
  'late_clock': '#fbbf24',
  'baseline_out_of_bounds': '#9ca3af',
  'sideline_out_of_bounds': '#9ca3af',
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

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function seekFilm(timestamp: number) {
  window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp } }))
}

export default function GameFlowTimeline({ possessions }: Props) {
  if (possessions.length === 0) return null

  const timestamps = possessions.map(p => p.startTimestamp)
  const minTs = Math.min(...timestamps)
  const maxTs = Math.max(...possessions.map(p => p.endTimestamp))
  const span = maxTs - minTs || 1

  const earlyBoundary = minTs + span * 0.33
  const lateBoundary = minTs + span * 0.67

  const earlyPossessions = possessions.filter(p => p.startTimestamp < earlyBoundary)
  const midPossessions = possessions.filter(p => p.startTimestamp >= earlyBoundary && p.startTimestamp < lateBoundary)
  const latePossessions = possessions.filter(p => p.startTimestamp >= lateBoundary)

  function dominantType(arr: PossessionResult[]): string {
    if (arr.length === 0) return '—'
    const counts: Record<string, number> = {}
    for (const p of arr) counts[p.possessionType] = (counts[p.possessionType] ?? 0) + 1
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    return POSSESSION_TYPE_LABELS[top] ?? top
  }

  function dominantPace(arr: PossessionResult[]): string {
    if (arr.length === 0) return '—'
    const counts: Record<string, number> = {}
    for (const p of arr) counts[p.paceProfile] = (counts[p.paceProfile] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  }

  const highCount = possessions.filter(p => (p.importanceScore ?? 0) >= 8).length
  const medCount = possessions.filter(p => (p.importanceScore ?? 0) >= 5 && (p.importanceScore ?? 0) < 8).length
  const lowCount = possessions.filter(p => p.importanceScore !== undefined && (p.importanceScore) < 5).length
  const noScoreCount = possessions.filter(p => p.importanceScore === undefined).length

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
        <span className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
          Game Flow
        </span>
      </div>

      {/* Timeline bar */}
      <div>
        <p className="text-[10px] text-gray-600 mb-2 font-mono">{formatTimestamp(minTs)} → {formatTimestamp(maxTs)}</p>
        <div className="relative h-16 bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
          {/* Phase region labels */}
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="w-1/3 border-r border-white/[0.04] flex items-start pt-1.5 pl-2">
              <span className="text-[8px] font-bold text-gray-700 tracking-widest uppercase">Early</span>
            </div>
            <div className="w-1/3 border-r border-white/[0.04] flex items-start pt-1.5 pl-2">
              <span className="text-[8px] font-bold text-gray-700 tracking-widest uppercase">Mid</span>
            </div>
            <div className="w-1/3 flex items-start pt-1.5 pl-2">
              <span className="text-[8px] font-bold text-gray-700 tracking-widest uppercase">Late</span>
            </div>
          </div>

          {/* Possession blocks */}
          {possessions.map((pos) => {
            const leftPct = ((pos.startTimestamp - minTs) / span) * 100
            const widthPct = Math.max(1, ((pos.endTimestamp - pos.startTimestamp) / span) * 100)
            const importance = pos.importanceScore ?? 5
            const heightPct = 40 + (importance / 10) * 60
            const color = POSSESSION_TYPE_COLORS[pos.possessionType] ?? '#9ca3af'
            const label = POSSESSION_TYPE_LABELS[pos.possessionType] ?? pos.possessionType

            return (
              <button
                key={pos.possessionId}
                title={`${label}${pos.importanceScore !== undefined ? ` · Score ${pos.importanceScore}` : ''} · ${formatTimestamp(pos.startTimestamp)}`}
                onClick={() => seekFilm(pos.startTimestamp)}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  bottom: 0,
                  backgroundColor: color,
                  opacity: 0.7,
                  minWidth: '4px',
                }}
                className="hover:opacity-100 transition-opacity cursor-pointer rounded-t-sm"
              />
            )
          })}
        </div>
      </div>

      {/* Phase summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Early', arr: earlyPossessions },
          { label: 'Mid', arr: midPossessions },
          { label: 'Late', arr: latePossessions },
        ].map(({ label, arr }) => (
          <div key={label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 space-y-1.5">
            <p className="text-[9px] font-bold tracking-widest text-gray-600 uppercase">{label}</p>
            <p className="text-lg font-black text-white">{arr.length}</p>
            <p className="text-[10px] text-gray-500">possessions</p>
            <div className="pt-1 space-y-0.5">
              <p className="text-[9px] text-gray-600">Top type: <span className="text-gray-400">{dominantType(arr)}</span></p>
              <p className="text-[9px] text-gray-600">Pace: <span className="text-gray-400">{dominantPace(arr)}</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* Importance distribution */}
      {possessions.some(p => p.importanceScore !== undefined) && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-600 tracking-wider uppercase mb-3">Possession Value</p>
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              <span className="text-xs text-gray-400">High value: <span className="text-white font-semibold">{highCount}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
              <span className="text-xs text-gray-400">Standard: <span className="text-white font-semibold">{medCount}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />
              <span className="text-xs text-gray-400">Low value: <span className="text-white font-semibold">{lowCount}</span></span>
            </div>
            {noScoreCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-800 shrink-0" />
                <span className="text-xs text-gray-600">No score: {noScoreCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-[9px] text-gray-700">
        Sampled coverage — not continuous game tracking. Blocks clickable to seek film.
      </p>
    </div>
  )
}
