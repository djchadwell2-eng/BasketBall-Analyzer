'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Target, Zap, BarChart2, User, TrendingUp, Activity } from 'lucide-react'
import FilmRoom from './FilmRoom'
import GamePatterns from './GamePatterns'
import BasketballEvents from './BasketballEvents'
import PossessionAnalytics from './PossessionAnalytics'
import PlayerReport from './PlayerReport'
import GameFlowTimeline from './GameFlowTimeline'
import TeamStatSheet from './TeamStatSheet'
import type { SequenceResult, PossessionResult } from './FilmRoom'
import type { PatternInsight, TendencyItem, GameIdentity, StrategicAdjustment, PlayerReport as PlayerReportType, RankedObservation } from '@/lib/analyzeFrames'

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
  strategicAdjustments?: StrategicAdjustment[]
  rankedObservations?: RankedObservation[]
  playerReport: PlayerReportType | null
}

const ALL_TABS = [
  { id: 0, label: 'Film Room',    Icon: Play        },
  { id: 1, label: 'Game Flow',    Icon: TrendingUp  },
  { id: 2, label: 'Intelligence', Icon: Target      },
  { id: 3, label: 'Events',       Icon: Zap         },
  { id: 4, label: 'Analytics',    Icon: BarChart2   },
  { id: 5, label: 'Player',       Icon: User        },
  { id: 6, label: 'Stats',        Icon: Activity    },
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
  strategicAdjustments,
  rankedObservations,
  playerReport,
}: Props) {
  const [activeTab, setActiveTab] = useState(0)

  // Strip non-gameplay possessions from all analytics tabs
  const activePossessions = possessions.filter(
    p => p.possessionType !== 'special_situation' && (p.importanceScore == null || p.importanceScore > 1)
  )

  const visibleTabs = ALL_TABS.filter(t => t.id !== 5 || playerReport !== null)

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-white/[0.07] mb-8">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all duration-200 rounded-t-lg ${
                activeTab === tab.id
                  ? 'text-white bg-white/[0.04]'
                  : 'text-gray-600 hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              <tab.Icon size={12} className={activeTab === tab.id ? 'text-orange-400' : ''} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                  style={{ boxShadow: '0 0 8px rgba(249,115,22,0.5)' }}
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
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
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
            <GameFlowTimeline possessions={activePossessions} />
          )}

          {/* Tabs 2-6: neutralize the mt-10 pt-10 border-t that each component adds at its root */}
          {activeTab === 2 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <GamePatterns
                patternInsights={patternInsights}
                offensiveTendencies={offensiveTendencies}
                defensiveTendencies={defensiveTendencies}
                transitionAnalysis={transitionAnalysis}
                gameIdentity={gameIdentity}
                strategicAdjustments={strategicAdjustments}
                rankedObservations={rankedObservations}
              />
            </div>
          )}

          {activeTab === 3 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <BasketballEvents possessions={activePossessions} />
            </div>
          )}

          {activeTab === 4 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <PossessionAnalytics possessions={activePossessions} sequences={sequences} />
            </div>
          )}

          {activeTab === 5 && playerReport && (
            <div className="[&>*]:mt-0">
              <PlayerReport report={playerReport} possessions={activePossessions} />
            </div>
          )}

          {activeTab === 6 && (
            <div className="[&>*]:mt-0 [&>*]:pt-0 [&>*]:border-t-0">
              <TeamStatSheet possessions={activePossessions} sequences={sequences} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
