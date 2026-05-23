import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import FilmRoom from '@/components/FilmRoom'
import TitleEditor from '@/components/TitleEditor'
import type { SequenceResult } from '@/components/FilmRoom'

export const revalidate = 0

interface Props {
  params: Promise<{ id: string }>
}

export default async function HistoryDetailPage({ params }: Props) {
  const { id } = await params

  const [{ data: analysisRow }, { data: videoRow }, { data: sequenceRows }] = await Promise.all([
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
      .select('sequence_index, timestamp_start, timestamp_end, play_type, summary, coaching_takeaway, thumbnail_b64, what_happened, what_it_means, why_it_matters, coaching_point, pattern_context, metadata')
      .eq('video_id', id)
      .order('sequence_index', { ascending: true }),
  ])

  if (!analysisRow || !videoRow) notFound()

  const fileName = (videoRow.title as string | null) ?? (videoRow.file_name as string)
  const videoUrl = videoRow.video_url as string | null
  const analyzedAt = videoRow.created_at as string

  type RawMeta = { direction_hint?: string; tags?: string[]; action_types?: string[]; outcome?: string } | null

  const sequences: SequenceResult[] = (sequenceRows ?? []).map((row) => {
    const meta = (row.metadata as RawMeta) ?? {}
    return {
      sequenceIndex: row.sequence_index as number,
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

  return (
    <main className="min-h-screen bg-[#080808] text-white">

      {/* Header */}
      <div className="relative border-b border-orange-500/20 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/25 to-transparent pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-gray-600 mb-4">
                <Link href="/" className="hover:text-gray-300 transition-colors">Analyzer</Link>
                <span>/</span>
                <Link href="/history" className="hover:text-gray-300 transition-colors">History</Link>
                <span>/</span>
                <span className="text-gray-400 truncate max-w-[240px]">{fileName}</span>
              </div>
              <TitleEditor videoId={id} initialTitle={fileName} />
            </div>
            <Link
              href="/history"
              className="shrink-0 mt-1 text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-all"
            >
              ← History
            </Link>
          </div>
        </div>
      </div>

      {/* Film Room */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <FilmRoom
          videoUrl={videoUrl}
          sequences={sequences}
          reportText={analysisRow.report_text as string}
          model={(analysisRow.model as string) ?? 'gpt-4o'}
          frameCount={(analysisRow.frame_count as number) ?? 0}
          analyzedAt={analyzedAt}
        />
      </div>
    </main>
  )
}
