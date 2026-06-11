'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, FileText, Crosshair, Zap, BarChart2, User, TrendingUp, Activity } from 'lucide-react'
import FilmRoom from './FilmRoom'
import ScoutingReport from './ScoutingReport'
import GamePlanBoard from './GamePlanBoard'
import BasketballEvents from './BasketballEvents'
import PossessionAnalytics from './PossessionAnalytics'
import PlayerReport from './PlayerReport'
import GameFlowTimeline from './GameFlowTimeline'
import TeamStatSheet from './TeamStatSheet'
import type { SequenceResult, PossessionResult } from './FilmRoom'
import type { PatternInsight, TendencyItem, GameIdentity, StrategicAdjustment, PlayerReport as PlayerReportType, RankedObservation, GamePlan } from '@/lib/types'

interface Props {
  videoUrl: string | null
  sequences: SequenceResult[]
  possessions: PossessionResult[]
  reportText: string
  model: string
  frameCount: number
  analyzedAt?: string
  patternInsights: PatternInsight[]
  offensiveTendencies: TendencyItem[]
  defensiveTendencies: TendencyItem[]
  transitionAnalysis: string
  gameIdentity: GameIdentity | null
  gamePlan?: GamePlan | null
  strategicAdjustments?: StrategicAdjustment[]
  rankedObservations?: RankedObservation[]
  playerReport: PlayerReportType | null
}

const ALL_TABS = [
  { id: 0, label: 'Film Room',       Icon: Play       },
  { id: 1, label: 'Scouting Report', Icon: FileText   },
  { id: 2, label: 'Game Plan',       Icon: Crosshair  },
  { id: 3, label: 'Game Flow',       Icon: TrendingUp },
  { id: 4, label: 'Events',          Icon: Zap        },
  { id: 5, label: 'Analytics',       Icon: BarChart2  },
  { id: 6, label: 'Stats',           Icon: Activity   },
  { id: 7, label: 'Player',          Icon: User       },
]

export default function AnalysisTabs({
  videoUrl,
  sequences,
  possessions,
  reportText,
  model,
  frameCount,
  analyzedAt,
  patternInsights,
  offensiveTendencies,
  defensiveTendencies,
  transitionAnalysis,
  gameIdentity,
  gamePlan = null,
  strategicAdjustments,
  rankedObservations,
  playerReport,
}: Props) {
  const [activeTab, setActiveTab] = useState(0)

  // "Jump to film" from the Scouting Report / Game Plan: switch to the Film
  // Room tab first, then re-dispatch the seek once FilmRoom has mounted.
  useEffect(() => {
    function handleJump(e: Event) {
      const { timestamp } = (e as CustomEvent<{ timestamp: number }>).detail
      setActiveTab(0)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('seekFilm', { detail: { timestamp } }))
      }, 320)
    }
    window.addEventListener('jumpToFilm', handleJump)
    return () => window.removeEventListener('jumpToFilm', handleJump)
  }, [])

  // Strip non-gameplay possessions from all analytics tabs
  const activePossessions = possessions.filter(
    p => p.possessionType !== 'special_situation' && (p.importanceScore == null || p.importanceScore > 1)
  )

  const visibleTabs = ALL_TABS.filter(t => t.id !== 7 || playerReport !== null)

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-white/[0.07] mb-10">
        <div className="flex items-center gap-1 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3.5 whitespace-nowrap transition-all duration-200 rounded-t-lg font-display text-base font-semibold uppercase tracking-wide ${
                activeTab === tab.id
                  ? 'text-white bg-white/[0.04]'
                  : 'text-gray-600 hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              <tab.Icon size={13} className={activeTab === tab.id ? 'text-orange-400' : ''} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                  style={{ boxShadow: '0 0 10px rgba(249,115,22,0.55)' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {activeTab === 0 && (
            <FilmRoom
              videoUrl={videoUrl}
              sequences={sequences}
              possessions={possessions}
              reportText={reportText}
              model={model}
              frameCount={frameCount}
              analyzedAt={analyzedAt}
            />
          )}

          {activeTab === 1 && (
            <ScoutingReport
              reportText={reportText}
              gameIdentity={gameIdentity}
              offensiveTendencies={offensiveTendencies}
              defensiveTendencies={defensiveTendencies}
              transitionAnalysis={transitionAnalysis}
              rankedObservations={rankedObservations ?? []}
              patternInsights={patternInsights}
              strategicAdjustments={strategicAdjustments}
            />
          )}

          {activeTab === 2 && <GamePlanBoard gamePlan={gamePlan} />}

          {activeTab === 3 && <GameFlowTimeline possessions={activePossessions} />}

          {/* Legacy tabs: neutralize the mt-10 pt-10 border-t each adds at its root */}
          {activeTab === 4 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <BasketballEvents possessions={activePossessions} />
            </div>
          )}

          {activeTab === 5 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <PossessionAnalytics possessions={activePossessions} sequences={sequences} />
            </div>
          )}

          {activeTab === 6 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <TeamStatSheet possessions={activePossessions} sequences={sequences} />
            </div>
          )}

          {activeTab === 7 && playerReport && (
            <div className="[&>*]:mt-0">
              <PlayerReport report={playerReport} possessions={activePossessions} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
