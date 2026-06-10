'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Swords, Shield, CircleDot } from 'lucide-react'
import type { PossessionResult } from '@/components/FilmRoom'

interface Props {
  possessions: PossessionResult[]
}

const EVENT_META: Record<string, { label: string; category: 'offensive' | 'defensive' | 'outcome' }> = {
  drive_left:          { label: 'Drive Left',          category: 'offensive' },
  drive_right:         { label: 'Drive Right',         category: 'offensive' },
  paint_touch:         { label: 'Paint Touch',         category: 'offensive' },
  kickout_pass:        { label: 'Kick-Out Pass',       category: 'offensive' },
  pick_and_roll:       { label: 'Pick & Roll',         category: 'offensive' },
  catch_and_shoot:     { label: 'Catch & Shoot',       category: 'offensive' },
  corner_three:        { label: 'Corner Three',        category: 'offensive' },
  transition_push:     { label: 'Transition Push',     category: 'offensive' },
  isolation:           { label: 'Isolation',           category: 'offensive' },
  ball_reversal:       { label: 'Ball Reversal',       category: 'offensive' },
  corner_spacing:      { label: 'Corner Spacing',      category: 'offensive' },
  half_court_set:      { label: 'Half-Court Set',      category: 'offensive' },
  help_rotation:       { label: 'Help Rotation',       category: 'defensive' },
  defensive_collapse:  { label: 'Defensive Collapse',  category: 'defensive' },
  late_closeout:       { label: 'Late Closeout',       category: 'defensive' },
  transition_recovery: { label: 'Transition Recovery', category: 'defensive' },
  hedge:               { label: 'Hedge',               category: 'defensive' },
  switch:              { label: 'Switch',              category: 'defensive' },
  paint_help:          { label: 'Paint Help',          category: 'defensive' },
  closeout:            { label: 'Closeout',            category: 'defensive' },
  drop_coverage:       { label: 'Drop Coverage',       category: 'defensive' },
  help_recovery:       { label: 'Help Recovery',       category: 'defensive' },
  paint_protection:    { label: 'Paint Protection',    category: 'defensive' },
  made_basket:         { label: 'Made Basket',         category: 'outcome' },
  missed_shot:         { label: 'Missed Shot',         category: 'outcome' },
  turnover:            { label: 'Turnover',            category: 'outcome' },
  foul_drawn:          { label: 'Foul Drawn',          category: 'outcome' },
}

const CATEGORY_CONFIG = {
  offensive: {
    label: 'Offensive',
    icon: Swords,
    color: 'text-purple-400',
    barBg: 'bg-purple-500/20',
    bar: 'bg-purple-500',
    badge: 'text-purple-400/70',
    pill: 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border-purple-500/20',
  },
  defensive: {
    label: 'Defensive',
    icon: Shield,
    color: 'text-red-400',
    barBg: 'bg-red-500/20',
    bar: 'bg-red-500',
    badge: 'text-red-400/70',
    pill: 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border-red-500/20',
  },
  outcome: {
    label: 'Outcomes',
    icon: CircleDot,
    color: 'text-green-400',
    barBg: 'bg-green-500/20',
    bar: 'bg-green-500',
    badge: 'text-green-400/70',
    pill: 'bg-green-500/10 text-green-300 hover:bg-green-500/20 border-green-500/20',
  },
} as const

function seekFilm(ts: number) {
  window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp: ts } }))
}

function fmt(ts: number) {
  const m = Math.floor(ts / 60)
  const s = Math.floor(ts % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function BasketballEvents({ possessions }: Props) {
  const aggregated = useMemo(() => {
    const acc: Record<string, { count: number; possessionTimestamps: number[] }> = {}
    for (const p of possessions) {
      const seenThisPossession = new Set<string>()
      for (const e of (p.events ?? [])) {
        if (!acc[e.type]) acc[e.type] = { count: 0, possessionTimestamps: [] }
        acc[e.type].count++
        if (!seenThisPossession.has(e.type)) {
          acc[e.type].possessionTimestamps.push(p.startTimestamp)
          seenThisPossession.add(e.type)
        }
      }
    }
    return acc
  }, [possessions])

  const totalEvents = Object.values(aggregated).reduce((s, v) => s + v.count, 0)
  if (totalEvents === 0) return null

  const byCategory = (cat: 'offensive' | 'defensive' | 'outcome') =>
    Object.entries(EVENT_META)
      .filter(([type, m]) => m.category === cat && (aggregated[type]?.count ?? 0) > 0)
      .map(([type, m]) => ({
        type,
        label: m.label,
        count: aggregated[type].count,
        possessionTimestamps: aggregated[type].possessionTimestamps,
      }))
      .sort((a, b) => b.count - a.count)

  const maxCount = Math.max(...Object.values(aggregated).map(v => v.count), 1)

  return (
    <div className="space-y-6 mt-10 pt-10 border-t border-white/[0.05]">

      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
          Basketball Events
        </p>
      </div>

      <p className="text-[11px] text-gray-600 -mt-2">
        Structured events observed across all possessions — click any event to jump to film.
      </p>

      {/* Three columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['offensive', 'defensive', 'outcome'] as const).map(cat => {
          const cfg = CATEGORY_CONFIG[cat]
          const Icon = cfg.icon
          const events = byCategory(cat)
          return (
            <div key={cat} className="space-y-3">
              {/* Column header */}
              <div className="flex items-center gap-2">
                <Icon size={11} className={cfg.color} />
                <p className={`text-[10px] font-bold tracking-[0.16em] uppercase ${cfg.color}`}>
                  {cfg.label}
                </p>
                {events.length > 0 && (
                  <span className="text-[9px] text-gray-600 ml-auto">
                    {events.reduce((s, e) => s + e.count, 0)} total
                  </span>
                )}
              </div>

              {/* Event rows */}
              <div className="space-y-3">
                {events.length === 0 ? (
                  <p className="text-[11px] text-gray-700">None observed</p>
                ) : (
                  events.map((ev, i) => {
                    const pct = Math.round((ev.count / maxCount) * 100)
                    const possCount = ev.possessionTimestamps.length
                    return (
                      <div
                        key={ev.type}
                        className="space-y-1 cursor-pointer group"
                        onClick={() => ev.possessionTimestamps[0] != null && seekFilm(ev.possessionTimestamps[0])}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">
                            {ev.label}
                          </span>
                          <div className="flex flex-col items-end shrink-0">
                            <span className={`text-[10px] font-semibold ${cfg.badge}`}>
                              {ev.count} observed
                            </span>
                            <span className="text-[9px] text-gray-600">
                              in {possCount} possession{possCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className={`h-1 rounded-full ${cfg.barBg} overflow-hidden`}>
                          <motion.div
                            className={`h-full rounded-full ${cfg.bar}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04 }}
                          />
                        </div>
                        {/* Timestamp pills */}
                        {ev.possessionTimestamps.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {ev.possessionTimestamps.map((ts, idx) => (
                              <button
                                key={idx}
                                onClick={e => { e.stopPropagation(); seekFilm(ts) }}
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${cfg.pill}`}
                              >
                                {fmt(ts)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
