import { type ComputedStats } from './computeStats'

export interface SequenceResult {
  sequenceIndex: number
  possessionId: number
  timestampStart: number
  timestampEnd: number
  playType: string
  // Rich coaching breakdown
  whatHappened: string
  whatItMeans: string
  whyItMatters: string
  coachingPoint: string
  patternContext: string
  // Stats foundation metadata
  directionHint: 'left' | 'right' | 'center' | 'unknown'
  tags: string[]
  actionTypes: string[]
  outcome: 'made' | 'missed' | 'turnover' | 'defensive-stop' | 'unknown'
  // Compat fields
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
  importanceScore?: number  // 0-10, AI-generated; undefined on older records
}

export interface PatternInsight {
  patternName: string
  occurrences: number
  description: string
  coachingImpact: string
  recommendation: string
  category: 'offensive' | 'defensive' | 'transition' | 'spacing' | 'general'
  supportingTimestamps: number[]
}

export interface TendencyItem {
  name: string
  description: string
  significance: 'high' | 'medium' | 'low'
  supportingTimestamps: number[]
}

export interface StrategicAdjustment {
  description: string
  phase: 'early' | 'middle' | 'late' | 'overall'
  direction: 'increase' | 'decrease' | 'shift' | 'consistent'
}

export interface RankedObservation {
  rank: number
  title: string
  detailedObservation: string
  basketballContext: string
  evidenceStrength: 'high' | 'medium' | 'low'
  confidenceLevel: 'high' | 'medium' | 'low'
  tacticalSignificance: 'primary' | 'secondary'
  supportingTimestamps: number[]
}

export interface GameIdentity {
  offensiveIdentity: string
  defensiveIdentity: string
  pace: 'fast' | 'medium' | 'slow'
  primaryStrengths: string[]
  primaryWeaknesses: string[]
}

export interface FocusTeam {
  /** Jersey color as the coach would describe it, e.g. "white", "navy blue" */
  jerseyColor: string
  teamName?: string
}

export interface FocusPlayer {
  jerseyNumber: string
  jerseyColor: string
  playerName?: string
  position?: string
}

export interface PlayerEvent {
  type: string
  timestamp: number
  possessionId: number
  confidence: number
  description: string
}

export interface PlayerReport {
  jerseyNumber: string
  jerseyColor: string
  playerName?: string
  position?: string
  profile: string
  offensiveTendencies: string[]
  defensiveTendencies: string[]
  strengths: string[]
  weaknesses: string[]
  coachingRecommendations: string[]
  playerEvents: PlayerEvent[]
  involvedPossessionIds: number[]
}

export interface AnalysisResult {
  summary: string
  model: string
  frameCount: number
  sequences: SequenceResult[]
  possessions: PossessionResult[]
  patternInsights: PatternInsight[]
  offensiveTendencies: TendencyItem[]
  defensiveTendencies: TendencyItem[]
  transitionAnalysis: string
  gameIdentity: GameIdentity | null
  playerReport?: PlayerReport | null
  strategicAdjustments: StrategicAdjustment[]
  rankedObservations: RankedObservation[]
  computedStats: ComputedStats
}
