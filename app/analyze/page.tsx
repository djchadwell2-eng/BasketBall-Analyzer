'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import VideoUpload from '@/components/VideoUpload'
import AnalysisTabs from '@/components/AnalysisTabs'
import FocusTeamSelector from '@/components/FocusTeamSelector'
import SignOutButton from '@/components/SignOutButton'
import { supabase } from '@/lib/supabase'
import type { PlayerReport as PlayerReportType, StrategicAdjustment, PatternInsight, TendencyItem, GameIdentity, RankedObservation, FocusTeam, GamePlan } from '@/lib/types'
import type { SequenceResult, PossessionResult } from '@/components/FilmRoom'

type AppState = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'done' | 'error'

const STEPS: { state: AppState; label: string; num: string }[] = [
  { state: 'uploading', label: 'Uploading video', num: '01' },
  { state: 'extracting', label: 'Extracting frames', num: '02' },
  { state: 'analyzing', label: 'Analyzing with AI', num: '03' },
]

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [sequences, setSequences] = useState<SequenceResult[]>([])
  const [possessions, setPossessions] = useState<PossessionResult[]>([])
  const [patternInsights, setPatternInsights] = useState<PatternInsight[]>([])
  const [offensiveTendencies, setOffensiveTendencies] = useState<TendencyItem[]>([])
  const [defensiveTendencies, setDefensiveTendencies] = useState<TendencyItem[]>([])
  const [transitionAnalysis, setTransitionAnalysis] = useState('')
  const [gameIdentity, setGameIdentity] = useState<GameIdentity | null>(null)
  const [gamePlan, setGamePlan] = useState<GamePlan | null>(null)
  const [reportText, setReportText] = useState('')
  const [model, setModel] = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [videoURL, setVideoURL] = useState<string | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [gameTitle, setGameTitle] = useState('')
  const [titleSaved, setTitleSaved] = useState(false)
  const [playerReport, setPlayerReport] = useState<PlayerReportType | null>(null)
  const [strategicAdjustments, setStrategicAdjustments] = useState<StrategicAdjustment[]>([])
  const [rankedObservations, setRankedObservations] = useState<RankedObservation[]>([])
  const [uploadDiagnostic, setUploadDiagnostic] = useState<string | null>(null)
  const [focusTeam, setFocusTeam] = useState<FocusTeam | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [eta, setEta] = useState<number | null>(null)
  const progressStartRef = useRef<{ time: number; pct: number } | null>(null)

  async function handleUpload(file: File) {
    if (videoURL) URL.revokeObjectURL(videoURL)
    setVideoURL(URL.createObjectURL(file))
    setAppState('uploading')
    setSequences([])
    setPossessions([])
    setPatternInsights([])
    setOffensiveTendencies([])
    setDefensiveTendencies([])
    setTransitionAnalysis('')
    setGameIdentity(null)
    setGamePlan(null)
    setReportText('')
    setModel('')
    setFrameCount(0)
    setErrorMessage('')
    setVideoId(null)
    setGameTitle('')
    setTitleSaved(false)
    setPlayerReport(null)
    setProgress(0)
    setProgressMessage('')
    setEta(null)
    progressStartRef.current = null

    try {
      const formData = new FormData()
      formData.append('video', file)
      if (focusTeam) formData.append('focusTeam', JSON.stringify(focusTeam))

      setAppState('extracting')
      const response = await fetch('/api/analyze', { method: 'POST', body: formData })

      if (!response.ok) {
        let message = `Server error: ${response.status}`
        try {
          const text = await response.text()
          if (text) message = (JSON.parse(text) as { error?: string }).error ?? message
        } catch {}
        throw new Error(message)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: { type: string; pct?: number; message?: string; data?: Record<string, unknown>; message_text?: string }
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }

          if (event.type === 'progress') {
            const pct = event.pct ?? 0
            setProgress(pct)
            setProgressMessage(event.message ?? '')
            if (pct >= 60) setAppState('analyzing')
            if (pct > 5) {
              const now = Date.now()
              if (!progressStartRef.current) {
                progressStartRef.current = { time: now, pct }
              } else {
                const elapsed = (now - progressStartRef.current.time) / 1000
                const pctDone = pct - progressStartRef.current.pct
                if (pctDone > 0) {
                  const rate = pctDone / elapsed
                  setEta(Math.round((100 - pct) / rate))
                }
              }
            }
          } else if (event.type === 'complete') {
            const d = event.data ?? {}
            setSequences((d.sequences as typeof sequences) ?? [])
            setPossessions((d.possessions as typeof possessions) ?? [])
            setPatternInsights((d.patternInsights as typeof patternInsights) ?? [])
            setOffensiveTendencies((d.offensiveTendencies as typeof offensiveTendencies) ?? [])
            setDefensiveTendencies((d.defensiveTendencies as typeof defensiveTendencies) ?? [])
            setTransitionAnalysis((d.transitionAnalysis as string) ?? '')
            setGameIdentity((d.gameIdentity as typeof gameIdentity) ?? null)
            setGamePlan((d.gamePlan as typeof gamePlan) ?? null)
            const a = (d.analysis as { summary?: string; model?: string; frameCount?: number }) ?? {}
            setReportText(a.summary ?? '')
            setModel(a.model ?? '')
            setFrameCount(a.frameCount ?? 0)
            setVideoId((d.videoId as string) ?? null)
            setUploadDiagnostic((d.uploadDiagnostic as string) ?? null)
            setPlayerReport((d.playerReport as typeof playerReport) ?? null)
            setStrategicAdjustments((d.strategicAdjustments as typeof strategicAdjustments) ?? [])
            setRankedObservations((d.rankedObservations as typeof rankedObservations) ?? [])
            setAppState('done')
            break outer
          } else if (event.type === 'error') {
            throw new Error((event.message as string) ?? 'Analysis failed.')
          }
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed.')
      setAppState('error')
    }
  }

  function handleReset() {
    if (videoURL) URL.revokeObjectURL(videoURL)
    setVideoURL(null)
    setSequences([])
    setPossessions([])
    setPatternInsights([])
    setOffensiveTendencies([])
    setDefensiveTendencies([])
    setTransitionAnalysis('')
    setGameIdentity(null)
    setGamePlan(null)
    setReportText('')
    setModel('')
    setFrameCount(0)
    setVideoId(null)
    setGameTitle('')
    setTitleSaved(false)
    setStrategicAdjustments([])
    setRankedObservations([])
    setUploadDiagnostic(null)
    setProgress(0)
    setProgressMessage('')
    setEta(null)
    progressStartRef.current = null
    setAppState('idle')
  }

  async function saveTitle() {
    if (!videoId || !gameTitle.trim()) return
    await supabase.from('videos').update({ title: gameTitle.trim() }).eq('id', videoId)
    setTitleSaved(true)
  }

  const isLoading = ['uploading', 'extracting', 'analyzing'].includes(appState)

  return (
    <main className="relative min-h-screen bg-[#05080f] text-white">

      {/* ── Full-screen atmospheric glows (fixed so they paint the whole viewport) ── */}
      {/* Primary orange spotlight — top-left, bleeds across entire page */}
      <div
        className="fixed top-0 left-0 w-[900px] h-[700px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 20% 15%, rgba(251,146,60,0.18) 0%, rgba(234,88,12,0.08) 40%, transparent 70%)',
          zIndex: 0,
        }}
      />
      {/* Secondary warmth — mid-right, keeps the right side alive */}
      <div
        className="fixed top-0 right-0 w-[600px] h-[500px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 85% 10%, rgba(234,88,12,0.07) 0%, transparent 60%)',
          zIndex: 0,
        }}
      />
      {/* Tertiary ambient — lower center, so scrolled content stays warm */}
      <div
        className="fixed bottom-0 left-1/3 w-[700px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 40% 100%, rgba(234,88,12,0.05) 0%, transparent 65%)',
          zIndex: 0,
        }}
      />

      {/* Header */}
      <div className="relative border-b border-white/[0.06] overflow-hidden" style={{ zIndex: 1 }}>
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 py-14">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                <span className="text-[11px] font-semibold text-orange-500/90 tracking-[0.22em] uppercase">
                  AI Scouting Platform
                </span>
              </div>
              <h1 className="text-5xl font-black tracking-tight leading-none mb-4">
                Basketball{' '}
                <span className="text-orange-500">Film</span>{' '}
                Analyzer
              </h1>
              <p className="text-gray-400 text-base max-w-sm leading-relaxed">
                Upload game footage and get instant tactical scouting intelligence.
              </p>
            </div>

            <div className="shrink-0 mt-1 flex items-center gap-2">
              <Link
                href="/history"
                className="text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-all"
              >
                History →
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`relative mx-auto px-6 py-12 ${appState === 'done' ? 'max-w-7xl' : 'max-w-5xl'}`} style={{ zIndex: 1 }}>

        {(appState === 'idle' || appState === 'error') && (
          <>
            {/* Team selector first — dropping a video starts the analysis
                immediately, so the team must be chosen before upload. */}
            <FocusTeamSelector value={focusTeam} onChange={setFocusTeam} />
            <div className="mt-6">
              <VideoUpload onUpload={handleUpload} />
            </div>
            {/* FocusPlayerInput hidden until player tracking is wired into the
                Gemini deep pass — the analyzer currently ignores focusPlayer. */}
          </>
        )}

        {appState === 'error' && (
          <div className="mt-4 p-4 bg-red-500/[0.08] border border-red-500/20 rounded-xl text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-10 py-24">
            {/* Double-ring spinner */}
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
              <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            </div>

            {/* Numbered steps */}
            <div className="flex flex-col gap-3">
              {STEPS.map(({ state, label, num }) => {
                const stepIdx = STEPS.findIndex(s => s.state === appState)
                const thisIdx = STEPS.findIndex(s => s.state === state)
                const isDone = stepIdx > thisIdx
                const isActive = appState === state
                return (
                  <div
                    key={state}
                    className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                      isActive ? 'opacity-100' : isDone ? 'opacity-60' : 'opacity-25'
                    }`}
                  >
                    <span
                      className={`font-mono text-xs font-bold ${
                        isActive ? 'text-orange-500' : isDone ? 'text-green-500' : 'text-gray-600'
                      }`}
                    >
                      {isDone ? '✓' : num}
                    </span>
                    <span className={isActive ? 'text-white' : isDone ? 'text-green-400' : 'text-gray-600'}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Progress bar + ETA */}
            <div className="w-64 space-y-2">
              <div className="h-[3px] bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-600 font-mono truncate">
                  {progressMessage || 'Starting...'}
                </span>
                {eta !== null && eta > 2 && (
                  <span className="text-[10px] text-gray-700 font-mono shrink-0">
                    ~{eta >= 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {appState === 'done' && videoURL && (
          <div className="space-y-8">

            {/* Upload diagnostic — shown when the video couldn't be saved to storage */}
            {uploadDiagnostic && (
              <div className="max-w-2xl p-3 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl text-amber-400 text-xs leading-relaxed">
                {uploadDiagnostic}
              </div>
            )}

            {/* Title rename */}
            {videoId && (
              <div className="max-w-2xl bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-4">
                <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.2em] uppercase mb-3">
                  Name this game
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gameTitle}
                    onChange={e => { setGameTitle(e.target.value); setTitleSaved(false) }}
                    onKeyDown={e => e.key === 'Enter' && saveTitle()}
                    placeholder="e.g. Knicks vs Lakers — Game 3"
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/40 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors"
                  />
                  <button
                    onClick={saveTitle}
                    disabled={!gameTitle.trim()}
                    className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    {titleSaved ? '✓ Saved' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            <AnalysisTabs
              videoUrl={videoURL}
              sequences={sequences}
              possessions={possessions}
              reportText={reportText}
              model={model}
              frameCount={frameCount}
              patternInsights={patternInsights}
              offensiveTendencies={offensiveTendencies}
              defensiveTendencies={defensiveTendencies}
              transitionAnalysis={transitionAnalysis}
              gameIdentity={gameIdentity}
              gamePlan={gamePlan}
              strategicAdjustments={strategicAdjustments}
              rankedObservations={rankedObservations}
              playerReport={playerReport}
            />

            <div className="pt-2 pb-6">
              <button
                onClick={handleReset}
                className="w-full max-w-2xl py-3 border border-white/10 hover:border-orange-500/40 hover:bg-orange-500/5 text-gray-400 hover:text-white rounded-xl font-medium text-sm transition-all"
              >
                ← Analyze Another Video
              </button>
            </div>

          </div>
        )}
      </div>
    </main>
  )
}
