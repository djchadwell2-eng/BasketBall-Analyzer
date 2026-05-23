'use client'

import { useRef, useState } from 'react'
import { Play, Clock, ChevronRight, Zap, ArrowRight, Target, Eye, RefreshCw } from 'lucide-react'
import AnalysisSummary from './AnalysisSummary'

export interface SequenceResult {
  sequenceIndex: number
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

interface Props {
  videoUrl: string | null
  sequences: SequenceResult[]
  reportText?: string
  model?: string
  frameCount?: number
  analyzedAt?: string
}

const PLAY_TYPE_COLORS: Record<string, string> = {
  'Transition': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Half-court offense': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Pick-and-roll': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Post-up': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Defense rotation': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Full-court press': 'text-red-400 bg-red-500/10 border-red-500/20',
  'Set play': 'text-green-400 bg-green-500/10 border-green-500/20',
  'Fast break': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Iso': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'Press break': 'text-teal-400 bg-teal-500/10 border-teal-500/20',
}

const OUTCOME_COLORS: Record<string, string> = {
  'made': 'text-green-400',
  'missed': 'text-red-400',
  'turnover': 'text-red-500',
  'defensive-stop': 'text-blue-400',
  'unknown': 'text-gray-600',
}

function playTypeBadgeClass(playType: string): string {
  return PLAY_TYPE_COLORS[playType] ?? 'text-gray-400 bg-white/[0.04] border-white/[0.08]'
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface CoachingSectionProps {
  icon: React.ReactNode
  label: string
  text: string
  accent?: boolean
}

function CoachingSection({ icon, label, text, accent }: CoachingSectionProps) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className={accent ? 'text-orange-400' : 'text-gray-600'}>{icon}</span>
        <span className={`text-[9px] font-bold tracking-[0.18em] uppercase ${accent ? 'text-orange-400/80' : 'text-gray-600'}`}>
          {label}
        </span>
      </div>
      <p className={`text-xs leading-relaxed pl-5 ${accent ? 'text-orange-200/80' : 'text-gray-300'}`}>
        {text}
      </p>
    </div>
  )
}

export default function FilmRoom({ videoUrl, sequences, reportText, model, frameCount, analyzedAt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeSeq, setActiveSeq] = useState<number | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [videoError, setVideoError] = useState(false)

  function seekTo(seq: SequenceResult) {
    setActiveSeq(seq.sequenceIndex)
    if (videoRef.current) {
      videoRef.current.currentTime = seq.timestampStart
      videoRef.current.play()
    }
  }

  const hasSequences = sequences.length > 0
  const activeSequence = sequences.find(s => s.sequenceIndex === activeSeq) ?? null

  // Detect if sequence has rich 5-field breakdown or only legacy summary
  const hasRichBreakdown = (seq: SequenceResult) =>
    Boolean(seq.whatHappened || seq.whatItMeans || seq.whyItMatters || seq.coachingPoint)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start">

      {/* Left — Video panel (sticky) */}
      <div className="lg:sticky lg:top-6 space-y-4">
        <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
          Game Film
        </p>

        {videoUrl && !videoError ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onError={() => setVideoError(true)}
            className="w-full rounded-2xl bg-black shadow-2xl shadow-black/80 ring-1 ring-white/5"
          />
        ) : (
          <div className="w-full aspect-video rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-gray-500">Video unavailable</p>
            {videoError && (
              <p className="text-[11px] text-gray-700 text-center px-6">
                Make sure the Supabase Storage &ldquo;videos&rdquo; bucket is set to public.
              </p>
            )}
          </div>
        )}

        {/* Stats pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {model && (
            <span className="text-xs font-mono font-semibold text-orange-400/80 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full">
              {model}
            </span>
          )}
          {frameCount !== undefined && (
            <span className="text-xs font-mono font-semibold text-gray-400 bg-white/[0.04] border border-white/[0.06] px-3 py-1 rounded-full">
              {frameCount} frames
            </span>
          )}
          {analyzedAt && (
            <span className="text-xs font-mono font-semibold text-gray-400 bg-white/[0.04] border border-white/[0.06] px-3 py-1 rounded-full">
              {new Date(analyzedAt).toLocaleDateString()} · {new Date(analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Active sequence detail card */}
        {activeSequence && (
          <div className="rounded-2xl border border-orange-500/20 bg-[#0e0a00] overflow-hidden">
            {activeSequence.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/jpeg;base64,${activeSequence.thumbnail}`}
                alt={`Sequence ${activeSequence.sequenceIndex + 1}`}
                className="w-full object-cover max-h-44"
              />
            )}
            <div className="p-4 space-y-4">

              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border ${playTypeBadgeClass(activeSequence.playType)}`}>
                  {activeSequence.playType}
                </span>
                <span className="text-xs font-mono text-gray-600">
                  {formatTimestamp(activeSequence.timestampStart)} → {formatTimestamp(activeSequence.timestampEnd)}
                </span>
                {activeSequence.outcome !== 'unknown' && (
                  <span className={`text-[10px] font-bold uppercase ${OUTCOME_COLORS[activeSequence.outcome]}`}>
                    · {activeSequence.outcome}
                  </span>
                )}
              </div>

              {/* Rich 5-section breakdown */}
              {hasRichBreakdown(activeSequence) ? (
                <div className="space-y-4 divide-y divide-white/[0.04]">
                  <CoachingSection
                    icon={<Eye size={10} />}
                    label="What Happened"
                    text={activeSequence.whatHappened}
                  />
                  {activeSequence.whatItMeans && (
                    <div className="pt-3">
                      <CoachingSection
                        icon={<ArrowRight size={10} />}
                        label="What It Means"
                        text={activeSequence.whatItMeans}
                      />
                    </div>
                  )}
                  {activeSequence.whyItMatters && (
                    <div className="pt-3">
                      <CoachingSection
                        icon={<Target size={10} />}
                        label="Why It Matters"
                        text={activeSequence.whyItMatters}
                      />
                    </div>
                  )}
                  {activeSequence.coachingPoint && (
                    <div className="pt-3">
                      <CoachingSection
                        icon={<Zap size={10} />}
                        label="Coaching Point"
                        text={activeSequence.coachingPoint}
                        accent
                      />
                    </div>
                  )}
                  {activeSequence.patternContext && (
                    <div className="pt-3">
                      <CoachingSection
                        icon={<RefreshCw size={10} />}
                        label="Pattern Context"
                        text={activeSequence.patternContext}
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Fallback for legacy sequences */
                <div className="space-y-3">
                  <p className="text-sm text-gray-300 leading-relaxed">{activeSequence.summary}</p>
                  {activeSequence.coachingTakeaway && (
                    <div className="flex gap-2.5 pt-1">
                      <Zap size={13} className="text-orange-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-orange-300/80 leading-relaxed">{activeSequence.coachingTakeaway}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              {activeSequence.tags && activeSequence.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeSequence.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] font-medium text-gray-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right — Timeline + Report */}
      <div className="space-y-4">

        {hasSequences ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
                Key Sequences
              </p>
              <span className="text-[10px] font-semibold text-orange-500/50 bg-orange-500/10 border border-orange-500/15 px-2 py-0.5 rounded-full">
                {sequences.length} moments
              </span>
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              {sequences.map((seq) => {
                const isActive = activeSeq === seq.sequenceIndex
                const preview = seq.whatHappened || seq.summary
                return (
                  <button
                    key={seq.sequenceIndex}
                    onClick={() => seekTo(seq)}
                    className={`w-full text-left flex items-start gap-4 px-4 py-4 rounded-xl border transition-all duration-200 group ${
                      isActive
                        ? 'border-orange-500/40 bg-orange-500/[0.07]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-orange-500/25 hover:bg-orange-500/[0.04]'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-black border border-white/[0.06]">
                      {seq.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:image/jpeg;base64,${seq.thumbnail}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play size={14} className="text-gray-600" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${playTypeBadgeClass(seq.playType)}`}>
                          {seq.playType}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-mono text-gray-600">
                          <Clock size={9} />
                          {formatTimestamp(seq.timestampStart)}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed line-clamp-2 ${isActive ? 'text-gray-200' : 'text-gray-500 group-hover:text-gray-400'}`}>
                        {preview}
                      </p>
                    </div>

                    <ChevronRight
                      size={14}
                      className={`shrink-0 mt-1 transition-colors ${isActive ? 'text-orange-400' : 'text-gray-700 group-hover:text-gray-500'}`}
                    />
                  </button>
                )
              })}
            </div>

            {/* Full report toggle */}
            {reportText && (
              <div className="pt-2">
                <button
                  onClick={() => setShowReport(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.06] hover:border-white/10 text-gray-500 hover:text-gray-300 transition-all text-xs font-medium"
                >
                  <span>Full Scouting Report</span>
                  <ChevronRight size={13} className={`transition-transform ${showReport ? 'rotate-90' : ''}`} />
                </button>
                {showReport && (
                  <div className="mt-3">
                    <AnalysisSummary analysis={{ summary: reportText, model: model ?? '', frameCount: frameCount ?? 0 }} />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Fallback for old records without sequences */
          <>
            <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.22em] uppercase">
              Scouting Report
            </p>
            {reportText && (
              <AnalysisSummary analysis={{ summary: reportText, model: model ?? '', frameCount: frameCount ?? 0 }} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
