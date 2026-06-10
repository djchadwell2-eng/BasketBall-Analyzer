import type { SequenceResult, PossessionResult } from '../types'

// Raw JSON shape returned by the model for a single chunk
export interface RawChunkPossession {
  possession_id?: unknown
  possession_type?: string
  tactical_tags?: unknown
  pace_profile?: string
  confidence?: string | number
  importance_score?: unknown
  summary?: string
  coaching_insight?: string
  key_observations?: unknown
  outcome?: string
  metadata?: {
    direction_hint?: string
    action_types?: unknown
  }
  // Timestamps are relative to chunk start — offset is added in code
  start_timestamp?: unknown
  end_timestamp?: unknown
  events?: unknown
}

export interface RawChunkSequence {
  possession_id?: unknown
  play_type?: string
  what_happened?: string
  what_it_means?: string
  why_it_matters?: string
  coaching_point?: string
  pattern_context?: string
  direction_hint?: string
  tags?: unknown
  action_types?: unknown
  outcome?: string
  // Timestamps relative to chunk start
  timestamp_start?: unknown
  timestamp_end?: unknown
}

export interface RawChunkResponse {
  possessions?: RawChunkPossession[]
  sequences?: RawChunkSequence[]
}

export interface ChunkResult {
  chunkIndex: number
  startOffset: number
  sequences: SequenceResult[]
  possessions: PossessionResult[]
}

export interface ChunkError {
  chunkIndex: number
  startOffset: number
  error: string
}

export interface GameplayRange {
  start: number
  end: number
}

export interface RawGameplayFilter {
  is_gameplay: boolean
  gameplay_ranges: GameplayRange[]
  non_gameplay_reason?: string
}

// --- Cascade Sampling types ---

export interface PossessionSummary {
  possessionId: number
  startTs: number
  endTs: number
  possessionType: string
}

export interface RawWidePossession {
  possession_id?: unknown
  start_ts?: unknown
  end_ts?: unknown
  possession_type?: string
}

export interface RawWideResponse {
  possessions?: RawWidePossession[]
  gameplay_ranges?: GameplayRange[]
}

export interface RawDeepDefense {
  pickup_point?: string
  on_ball_pressure?: string
  help_rotation?: string
  switch?: boolean | null
}

export interface RawDeepPossession {
  possession_id?: unknown
  start_ts?: unknown
  end_ts?: unknown
  possession_type?: string
  action_types?: unknown
  outcome?: string
  direction?: string
  defense?: RawDeepDefense
  confidence?: string | number
  what_happened?: string
  what_it_means?: string
  why_it_matters?: string
  coaching_point?: string
  pattern_context?: string
}

export interface RawSynthesisOutput {
  offensive_tendencies?: unknown
  defensive_tendencies?: unknown
  transition_analysis?: string
  possible_weaknesses?: unknown
  coaching_takeaways?: unknown
  game_narrative?: string
  key_moments?: unknown
}
