'use client'

import { useState } from 'react'
import Link from 'next/link'
import VideoUpload from '@/components/VideoUpload'
import FilmRoom from '@/components/FilmRoom'
import { supabase } from '@/lib/supabase'
import type { SequenceResult } from '@/components/FilmRoom'

type AppState = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'done' | 'error'

const STEPS: { state: AppState; label: string; num: string }[] = [
  { state: 'uploading', label: 'Uploading video', num: '01' },
  { state: 'extracting', label: 'Extracting frames', num: '02' },
  { state: 'analyzing', label: 'Analyzing with AI', num: '03' },
]

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [sequences, setSequences] = useState<SequenceResult[]>([])
  const [reportText, setReportText] = useState('')
  const [model, setModel] = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [videoURL, setVideoURL] = useState<string | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [gameTitle, setGameTitle] = useState('')
  const [titleSaved, setTitleSaved] = useState(false)

  async function handleUpload(file: File) {
    if (videoURL) URL.revokeObjectURL(videoURL)
    setVideoURL(URL.createObjectURL(file))
    setAppState('uploading')
    setSequences([])
    setReportText('')
    setModel('')
    setFrameCount(0)
    setErrorMessage('')
    setVideoId(null)
    setGameTitle('')
    setTitleSaved(false)

    try {
      const formData = new FormData()
      formData.append('video', file)

      setAppState('extracting')
      const response = await fetch('/api/analyze', { method: 'POST', body: formData })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? `Server error: ${response.status}`)
      }

      setAppState('analyzing')
      const data = await response.json()

      setSequences(data.sequences ?? [])
      setReportText(data.analysis?.summary ?? '')
      setModel(data.analysis?.model ?? '')
      setFrameCount(data.analysis?.frameCount ?? 0)
      setVideoId(data.videoId ?? null)
      setAppState('done')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed.')
      setAppState('error')
    }
  }

  function handleReset() {
    if (videoURL) URL.revokeObjectURL(videoURL)
    setVideoURL(null)
    setSequences([])
    setReportText('')
    setModel('')
    setFrameCount(0)
    setVideoId(null)
    setGameTitle('')
    setTitleSaved(false)
    setAppState('idle')
  }

  async function saveTitle() {
    if (!videoId || !gameTitle.trim()) return
    await supabase.from('videos').update({ title: gameTitle.trim() }).eq('id', videoId)
    setTitleSaved(true)
  }

  const isLoading = ['uploading', 'extracting', 'analyzing'].includes(appState)

  return (
    <main className="min-h-screen bg-[#080808] text-white">

      {/* Header */}
      <div className="relative border-b border-white/[0.06] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/30 via-orange-950/10 to-transparent pointer-events-none" />

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

            <Link
              href="/history"
              className="shrink-0 mt-1 text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-all"
            >
              History →
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`mx-auto px-6 py-12 ${appState === 'done' ? 'max-w-7xl' : 'max-w-5xl'}`}>

        {(appState === 'idle' || appState === 'error') && (
          <VideoUpload onUpload={handleUpload} />
        )}

        {appState === 'error' && (
          <div className="mt-4 p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-sm">
            {errorMessage}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-10 py-24">
            {/* Double-ring spinner */}
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-gray-800" />
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
          </div>
        )}

        {appState === 'done' && videoURL && (
          <div className="space-y-8">

            {/* Title rename */}
            {videoId && (
              <div className="max-w-2xl bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4">
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
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
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

            {/* Film room */}
            <FilmRoom
              videoUrl={videoURL}
              sequences={sequences}
              reportText={reportText}
              model={model}
              frameCount={frameCount}
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
