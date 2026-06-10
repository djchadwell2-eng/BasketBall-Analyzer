import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TitleEditor from '@/components/TitleEditor'
import AnalysisTabs from '@/components/AnalysisTabs'
import type { SequenceResult, PossessionResult } from '@/components/FilmRoom'
import type { PatternInsight, TendencyItem, GameIdentity, BasketballEvent, PlayerReport as PlayerReportType, PlayerEvent, StrategicAdjustment, RankedObservation } from '@/lib/analyzeFrames'

export const revalidate = 0

interface Props {
  params: Promise<{ id: string }>
}

export default async function HistoryDetailPage({ params }: Props) {
  const { id } = await params

  const [{ data: analysisRow }, { data: videoRow }, { data: sequenceRows }, { data: possessionRows }, { data: patternRow }, { data: playerRow }] = await Promise.all([
    supabase
      .from('analyses')
      .select('report_text, frame_count, model, created_at')
      .eq('video_id', id)
      .single(),
    supabase
      .from('videos')
      .select('file_name, title, video_url, created_at')
      .eq('id', id)
      .single(),
    supabase
      .from('sequences')
      .select('sequence_index, possession_id, timestamp_start, timestamp_end, play_type, summary, coaching_takeaway, thumbnail_b64, what_happened, what_it_means, why_it_matters, coaching_point, pattern_context, metadata')
      .eq('video_id', id)
      .order('sequence_index', { ascending: true }),
    supabase
      .from('possessions')
      .select('possession_id, possession_type, start_timestamp, end_timestamp, summary, coaching_insight, key_observations, outcome, metadata, tactical_tags, pace_profile, confidence, events, importance_score')
      .eq('video_id', id)
      .order('possession_id', { ascending: true }),
    supabase
      .from('game_patterns')
      .select('pattern_insights, offensive_tendencies, defensive_tendencies, transition_analysis, game_identity, strategic_adjustments, ranked_observations')
      .eq('video_id', id)
      .maybeSingle(),
    supabase
      .from('player_reports')
      .select('jersey_number, jersey_color, player_name, position, profile, offensive_tendencies, defensive_tendencies, strengths, weaknesses, coaching_recommendations, player_events, involved_possession_ids')
      .eq('video_id', id)
      .maybeSingle(),
  ])

  if (!analysisRow || !videoRow) notFound()

  const fileName = (videoRow.title as string | null) ?? (videoRow.file_name as string)
  const videoUrl = videoRow.video_url as string | null
  const analyzedAt = videoRow.created_at as string

  type RawMeta = { direction_hint?: string; tags?: string[]; action_types?: string[]; outcome?: string } | null
  type RawPosMeta = { direction_hint?: string; action_types?: string[] } | null

  const sequences: SequenceResult[] = (sequenceRows ?? []).map((row) => {
    const meta = (row.metadata as RawMeta) ?? {}
    return {
      sequenceIndex: row.sequence_index as number,
      possessionId: (row.possession_id as number) ?? 0,
      timestampStart: Number(row.timestamp_start),
      timestampEnd: Number(row.timestamp_end),
      playType: (row.play_type as string) ?? 'Unknown',
      whatHappened: (row.what_happened as string) ?? '',
      whatItMeans: (row.what_it_means as string) ?? '',
      whyItMatters: (row.why_it_matters as string) ?? '',
      coachingPoint: (row.coaching_point as string) ?? '',
      patternContext: (row.pattern_context as string) ?? '',
      directionHint: (meta?.direction_hint as SequenceResult['directionHint']) ?? 'unknown',
      tags: Array.isArray(meta?.tags) ? (meta.tags as string[]) : [],
      actionTypes: Array.isArray(meta?.action_types) ? (meta.action_types as string[]) : [],
      outcome: (meta?.outcome as SequenceResult['outcome']) ?? 'unknown',
      summary: (row.summary as string) ?? '',
      coachingTakeaway: (row.coaching_takeaway as string) ?? '',
      thumbnail: (row.thumbnail_b64 as string) ?? '',
    }
  })

  const possessions: PossessionResult[] = (possessionRows ?? []).map((row) => {
    const meta = (row.metadata as RawPosMeta) ?? {}
    const possId = row.possession_id as number
    return {
      possessionId: possId,
      possessionType: (row.possession_type as PossessionResult['possessionType']) ?? 'half_court',
      startTimestamp: Number(row.start_timestamp),
      endTimestamp: Number(row.end_timestamp),
      summary: (row.summary as string) ?? '',
      coachingInsight: (row.coaching_insight as string) ?? '',
      keyObservations: Array.isArray(row.key_observations) ? (row.key_observations as string[]) : [],
      outcome: (row.outcome as string) ?? 'unknown',
      metadata: {
        directionHint: (meta?.direction_hint as PossessionResult['metadata']['directionHint']) ?? 'unknown',
        actionTypes: Array.isArray(meta?.action_types) ? (meta.action_types as string[]) : [],
      },
      tacticalTags: Array.isArray(row.tactical_tags) ? (row.tactical_tags as string[]) : [],
      paceProfile: (row.pace_profile as PossessionResult['paceProfile']) ?? 'medium',
      confidence: (row.confidence as PossessionResult['confidence']) ?? 'medium',
      importanceScore: typeof row.importance_score === 'number' ? row.importance_score : undefined,
      events: Array.isArray(row.events) ? (row.events as BasketballEvent[]) : [],
      sequences: sequences.filter(s => s.possessionId === possId),
    }
  })

  const patternInsights: PatternInsight[] = Array.isArray(patternRow?.pattern_insights)
    ? (patternRow.pattern_insights as PatternInsight[])
    : []
  const offensiveTendencies: TendencyItem[] = Array.isArray(patternRow?.offensive_tendencies)
    ? (patternRow.offensive_tendencies as TendencyItem[])
    : []
  const defensiveTendencies: TendencyItem[] = Array.isArray(patternRow?.defensive_tendencies)
    ? (patternRow.defensive_tendencies as TendencyItem[])
    : []
  const transitionAnalysis: string = (patternRow?.transition_analysis as string) ?? ''
  const gameIdentity: GameIdentity | null = (patternRow?.game_identity as GameIdentity) ?? null
  const strategicAdjustments: StrategicAdjustment[] = Array.isArray(patternRow?.strategic_adjustments)
    ? (patternRow.strategic_adjustments as StrategicAdjustment[])
    : []
  const rankedObservations: RankedObservation[] = Array.isArray(patternRow?.ranked_observations)
    ? (patternRow.ranked_observations as RankedObservation[])
    : []

  const playerReport: PlayerReportType | null = playerRow ? {
    jerseyNumber: playerRow.jersey_number as string,
    jerseyColor: playerRow.jersey_color as string,
    playerName: (playerRow.player_name as string) ?? undefined,
    position: (playerRow.position as string) ?? undefined,
    profile: (playerRow.profile as string) ?? '',
    offensiveTendencies: Array.isArray(playerRow.offensive_tendencies) ? playerRow.offensive_tendencies as string[] : [],
    defensiveTendencies: Array.isArray(playerRow.defensive_tendencies) ? playerRow.defensive_tendencies as string[] : [],
    strengths: Array.isArray(playerRow.strengths) ? playerRow.strengths as string[] : [],
    weaknesses: Array.isArray(playerRow.weaknesses) ? playerRow.weaknesses as string[] : [],
    coachingRecommendations: Array.isArray(playerRow.coaching_recommendations) ? playerRow.coaching_recommendations as string[] : [],
    playerEvents: Array.isArray(playerRow.player_events) ? playerRow.player_events as PlayerEvent[] : [],
    involvedPossessionIds: Array.isArray(playerRow.involved_possession_ids) ? playerRow.involved_possession_ids as number[] : [],
  } : null

  return (
    <main className="min-h-screen bg-[#080808] text-white">

      {/* Header */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-gray-600 mb-2">
                <Link href="/" className="hover:text-gray-400 transition-colors">Analyzer</Link>
                <span>/</span>
                <Link href="/history" className="hover:text-gray-400 transition-colors">History</Link>
                <span>/</span>
                <span className="text-gray-500 truncate max-w-[240px]">{fileName}</span>
              </div>
              <TitleEditor videoId={id} initialTitle={fileName} />
            </div>
            <Link
              href="/history"
              className="shrink-0 text-[11px] font-medium text-gray-500 hover:text-white transition-colors"
            >
              ← History
            </Link>
          </div>
        </div>
      </div>

      {/* Film Room + Patterns */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AnalysisTabs
          videoUrl={videoUrl}
          sequences={sequences}
          possessions={possessions}
          reportText={analysisRow.report_text as string}
          model={(analysisRow.model as string) ?? 'gpt-4o'}
          frameCount={(analysisRow.frame_count as number) ?? 0}
          analyzedAt={analyzedAt}
          patternInsights={patternInsights}
          offensiveTendencies={offensiveTendencies}
          defensiveTendencies={defensiveTendencies}
          transitionAnalysis={transitionAnalysis}
          gameIdentity={gameIdentity}
          strategicAdjustments={strategicAdjustments}
          rankedObservations={rankedObservations}
          playerReport={playerReport}
        />
      </div>
    </main>
  )
}
