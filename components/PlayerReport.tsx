'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { PlayerReport as PlayerReportType, PlayerEvent, PossessionResult } from '@/lib/analyzeFrames'
import { computePlayerStats } from '@/lib/computePlayerStats'

interface Props {
  report: PlayerReportType
  possessions: PossessionResult[]
}

const EVENT_LABELS: Record<string, string> = {
  drive_left: 'Drive Left', drive_right: 'Drive Right', paint_touch: 'Paint Touch',
  kickout_pass: 'Kick-Out Pass', pick_and_roll: 'Pick & Roll', catch_and_shoot: 'Catch & Shoot',
  corner_three: 'Corner Three', transition_push: 'Transition Push', isolation: 'Isolation',
  ball_reversal: 'Ball Reversal', help_rotation: 'Help Rotation', defensive_collapse: 'Defensive Collapse',
  late_closeout: 'Late Closeout', transition_recovery: 'Transition Recovery',
  hedge: 'Hedge', switch: 'Switch', paint_help: 'Paint Help',
  made_basket: 'Made Basket', missed_shot: 'Missed Shot', turnover: 'Turnover', foul_drawn: 'Foul Drawn',
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  ball_handler: { label: 'Ball Handler', color: 'text-blue-400 border-blue-500/20 bg-blue-500/[0.08]' },
  wing:         { label: 'Wing',         color: 'text-purple-400 border-purple-500/20 bg-purple-500/[0.08]' },
  big:          { label: 'Big',          color: 'text-red-400 border-red-500/20 bg-red-500/[0.08]' },
  two_way:      { label: 'Two-Way',      color: 'text-green-400 border-green-500/20 bg-green-500/[0.08]' },
  unknown:      { label: 'Role TBD',     color: 'text-gray-500 border-white/[0.08] bg-white/[0.03]' },
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function seekFilm(ts: number) {
  window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp: ts } }))
}

function fadeIn(delay = 0) {
  return { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay } }
}

export default function PlayerReport({ report, possessions }: Props) {
  if (!report.profile) return null

  const tendencies = useMemo(
    () => computePlayerStats(report.playerEvents, possessions),
    [report.playerEvents, possessions]
  )

  const sortedEvents = useMemo(
    () => [...report.playerEvents].sort((a, b) => a.timestamp - b.timestamp),
    [report.playerEvents]
  )

  // Map event type → first timestamp (for click navigation in freq chart)
  const firstEventTs = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of sortedEvents) {
      if (!(ev.type in map)) map[ev.type] = ev.timestamp
    }
    return map
  }, [sortedEvents])

  const roleConfig = ROLE_CONFIG[tendencies.roleClassification] ?? ROLE_CONFIG.unknown
  const hasScoringZones = Object.values(tendencies.scoringZones).some(v => v > 0)
  const maxTopCount = tendencies.topEventTypes[0]?.count ?? 1

  // Left/right bias label + fill
  const biasAbs = Math.abs(tendencies.leftRightBias)
  const biasLabel = biasAbs < 0.15 ? 'Balanced' : tendencies.leftRightBias < 0 ? 'Left-heavy' : 'Right-heavy'
  const biasColor = biasAbs < 0.15 ? 'text-gray-400' : 'text-orange-400'

  return (
    <motion.div {...fadeIn()} className="mt-8">

      {/* Section label */}
      <div className="flex items-center gap-2 mb-5">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
        <span className="text-[11px] font-semibold text-orange-500/90 tracking-[0.22em] uppercase">
          Focus Player Report
        </span>
      </div>

      {/* Player identity header */}
      <motion.div {...fadeIn(0.05)} className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg">
          <span className="text-orange-400 font-black text-lg leading-none">#{report.jerseyNumber}</span>
          <span className="text-gray-500 text-xs">·</span>
          <span className="text-orange-300/80 text-sm font-medium">{report.jerseyColor}</span>
        </div>
        {report.playerName && (
          <span className="text-white font-semibold text-lg">{report.playerName}</span>
        )}
        {report.position && (
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded">
            {report.position}
          </span>
        )}
      </motion.div>

      {/* Player profile */}
      <motion.div {...fadeIn(0.08)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 mb-5">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Player Profile</p>
        <p className="text-sm text-gray-300 italic leading-relaxed">{report.profile}</p>
      </motion.div>

      {/* ── V14 INTELLIGENCE LAYER ── */}

      {/* A. Role badge + overview stats */}
      <motion.div {...fadeIn(0.1)} className="flex flex-wrap items-center gap-3 mb-5">
        <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border tracking-widest uppercase ${roleConfig.color}`}>
          {roleConfig.label}
        </span>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            <span className="font-semibold text-gray-300">{report.involvedPossessionIds.length}</span> possessions
          </span>
          <span>
            <span className="font-semibold text-gray-300">{report.playerEvents.length}</span> events
          </span>
          {report.playerEvents.length > 0 && report.involvedPossessionIds.length > 0 && (
            <span>
              <span className="font-semibold text-gray-300">{tendencies.eventsPerPossession.toFixed(1)}</span> events/possession
            </span>
          )}
        </div>
      </motion.div>

      {/* B. Tendency bars + C. Scoring zones — two columns */}
      {report.playerEvents.length > 0 && (
        <motion.div {...fadeIn(0.12)} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

          {/* Tendency bars */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 space-y-4">
            <p className="text-[10px] font-semibold text-orange-500/60 uppercase tracking-widest">Player Tendencies</p>

            {/* Drive frequency */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Drive Frequency</span>
                <span className="text-[10px] font-semibold text-orange-400/70">
                  {Math.round(tendencies.driveRate * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-orange-500/60"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(tendencies.driveRate * 100)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Defensive activity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Defensive Activity</span>
                <span className="text-[10px] font-semibold text-red-400/70">
                  {Math.round(tendencies.defensiveActivityScore * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-red-500/50"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(tendencies.defensiveActivityScore * 100)}%` }}
                  transition={{ duration: 0.5, delay: 0.06 }}
                />
              </div>
            </div>

            {/* Left/right bias — center-anchored */}
            {tendencies.driveRate > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Drive Direction</span>
                  <span className={`text-[10px] font-semibold ${biasColor}`}>{biasLabel}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex">
                  <div className="w-1/2 flex justify-end overflow-hidden">
                    {tendencies.leftRightBias < 0 && (
                      <motion.div
                        className="h-full bg-orange-500/60 rounded-l-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(biasAbs * 100)}%` }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                      />
                    )}
                  </div>
                  <div className="w-px bg-white/[0.12]" />
                  <div className="w-1/2 overflow-hidden">
                    {tendencies.leftRightBias > 0 && (
                      <motion.div
                        className="h-full bg-orange-500/60 rounded-r-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(biasAbs * 100)}%` }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-[9px] text-gray-700">
                  <span>← Left</span>
                  <span>Right →</span>
                </div>
              </div>
            )}

            {/* Vs team comparison */}
            {tendencies.driveRateVsTeam !== null && (
              <div className={`text-[11px] pt-1 ${
                tendencies.driveRateVsTeam > 1.2 ? 'text-green-400/80'
                : tendencies.driveRateVsTeam < 0.8 ? 'text-amber-400/80'
                : 'text-gray-500'
              }`}>
                Drive rate{' '}
                <span className="font-bold">{tendencies.driveRateVsTeam.toFixed(1)}×</span>{' '}
                team average
              </div>
            )}
          </div>

          {/* Scoring zones */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 space-y-4">
            <p className="text-[10px] font-semibold text-orange-500/60 uppercase tracking-widest">Scoring Profile</p>

            {hasScoringZones ? (
              <div className="space-y-3">
                {/* 3-segment split bar */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-600">Scoring Zone Distribution</p>
                  <div className="h-3 rounded-full overflow-hidden flex gap-0.5">
                    {tendencies.scoringZones.perimeter > 0 && (
                      <motion.div
                        className="h-full bg-blue-500/60 rounded-l-full"
                        title="Perimeter"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(tendencies.scoringZones.perimeter * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    )}
                    {tendencies.scoringZones.paint > 0 && (
                      <motion.div
                        className="h-full bg-orange-500/60"
                        title="Paint / Mid"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(tendencies.scoringZones.paint * 100)}%` }}
                        transition={{ duration: 0.5, delay: 0.05 }}
                      />
                    )}
                    {tendencies.scoringZones.transition > 0 && (
                      <motion.div
                        className="h-full bg-green-500/50 rounded-r-full"
                        title="Transition"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(tendencies.scoringZones.transition * 100)}%` }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                      />
                    )}
                  </div>
                  <div className="flex gap-4 text-[9px]">
                    <span className="flex items-center gap-1 text-blue-400/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 inline-block" />
                      Perimeter {Math.round(tendencies.scoringZones.perimeter * 100)}%
                    </span>
                    <span className="flex items-center gap-1 text-orange-400/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500/60 inline-block" />
                      Paint {Math.round(tendencies.scoringZones.paint * 100)}%
                    </span>
                    <span className="flex items-center gap-1 text-green-400/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 inline-block" />
                      Transition {Math.round(tendencies.scoringZones.transition * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-600">Insufficient scoring events to classify zones.</p>
            )}

            {/* D. Top event types */}
            {tendencies.topEventTypes.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[10px] text-gray-600">Top Event Types</p>
                {tendencies.topEventTypes.map((et, i) => {
                  const pct = Math.round((et.count / maxTopCount) * 100)
                  const ts = firstEventTs[et.type]
                  return (
                    <div
                      key={et.type}
                      className="space-y-0.5 cursor-pointer group"
                      onClick={() => ts != null && seekFilm(ts)}
                      title={ts != null ? `Jump to ${formatTimestamp(ts)}` : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">
                          {EVENT_LABELS[et.type] ?? et.type}
                        </span>
                        <span className="text-[10px] font-semibold text-orange-500/50 shrink-0">
                          {et.count}×
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-orange-500/10 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-orange-500/40"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, delay: i * 0.04 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── EXISTING SECTIONS (unchanged) ── */}

      {/* Tendencies — two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <motion.div {...fadeIn(0.14)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-orange-500/70 uppercase tracking-widest mb-3">
            Observed Offensive Tendencies
          </p>
          {report.offensiveTendencies.length === 0 ? (
            <p className="text-xs text-gray-600">None identified</p>
          ) : (
            <ul className="space-y-2">
              {report.offensiveTendencies.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500/70 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        <motion.div {...fadeIn(0.16)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-red-500/70 uppercase tracking-widest mb-3">
            Observed Defensive Tendencies
          </p>
          {report.defensiveTendencies.length === 0 ? (
            <p className="text-xs text-gray-600">None identified</p>
          ) : (
            <ul className="space-y-2">
              {report.defensiveTendencies.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500/70 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      {/* Strengths / Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <motion.div {...fadeIn(0.18)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-green-500/70 uppercase tracking-widest mb-3">Strengths</p>
          {report.strengths.length === 0 ? (
            <p className="text-xs text-gray-600">None identified</p>
          ) : (
            <ul className="space-y-2">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500/70 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        <motion.div {...fadeIn(0.2)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-widest mb-3">Weaknesses</p>
          {report.weaknesses.length === 0 ? (
            <p className="text-xs text-gray-600">None identified</p>
          ) : (
            <ul className="space-y-2">
              {report.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500/70 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      {/* Coaching recommendations */}
      {report.coachingRecommendations.length > 0 && (
        <motion.div {...fadeIn(0.22)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 mb-4">
          <p className="text-[10px] font-semibold text-orange-500/70 uppercase tracking-widest mb-3">
            Recommendations Against This Player
          </p>
          <ol className="space-y-2">
            {report.coachingRecommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                <span className="shrink-0 font-mono text-xs font-bold text-orange-500 mt-0.5">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {r}
              </li>
            ))}
          </ol>
        </motion.div>
      )}

      {/* Player event timeline */}
      {sortedEvents.length > 0 && (
        <motion.div {...fadeIn(0.24)} className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Player Event Timeline
          </p>
          <div className="space-y-2">
            {sortedEvents.map((ev: PlayerEvent, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0 cursor-pointer hover:bg-white/[0.02] rounded transition-colors -mx-1 px-1"
                onClick={() => seekFilm(ev.timestamp)}
              >
                <span className="shrink-0 font-mono text-xs text-gray-500 mt-0.5 w-10">
                  {formatTimestamp(ev.timestamp)}
                </span>
                <span className="shrink-0 text-xs font-semibold text-orange-400 mt-0.5">
                  {EVENT_LABELS[ev.type] ?? ev.type}
                </span>
                <span className="flex-1 text-xs text-gray-400 leading-relaxed">{ev.description}</span>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  ev.confidence >= 0.75
                    ? 'text-green-400 bg-green-500/10'
                    : ev.confidence >= 0.5
                    ? 'text-yellow-400 bg-yellow-500/10'
                    : 'text-gray-500 bg-white/[0.04]'
                }`}>
                  {Math.round(ev.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
