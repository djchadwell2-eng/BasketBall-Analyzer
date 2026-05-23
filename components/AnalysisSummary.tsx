'use client'

import { useState } from 'react'

interface AnalysisData {
  summary: string
  model: string
  frameCount: number
}

interface Props {
  analysis: AnalysisData
}

interface Section {
  title: string
  body: string
}

function parseSections(summary: string): Section[] {
  const parts = summary.split(/^## /m).filter(Boolean)
  return parts.map((part) => {
    const newline = part.indexOf('\n')
    return {
      title: part.slice(0, newline).trim(),
      body: part.slice(newline + 1).trim(),
    }
  })
}

function formatBody(body: string): string {
  return body
    .replace(/^- (.+)$/gm, '<span class="block pl-4 mb-1.5 before:content-[\'—\'] before:mr-2 before:text-orange-500/60">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white/90">$1</strong>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

export default function AnalysisSummary({ analysis }: Props) {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set())

  const sections = parseSections(analysis.summary)

  function toggle(index: number) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white tracking-tight">Scouting Report</h2>
        <div className="flex items-center gap-2">
          {sections.length > 0 && (
            <span className="text-[10px] font-semibold text-orange-500/60 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
              {sections.length} sections
            </span>
          )}
          <span className="text-[10px] text-gray-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded-full font-mono">
            {analysis.model} · {analysis.frameCount} frames
          </span>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 text-sm text-gray-300 leading-relaxed">
          {analysis.summary}
        </div>
      ) : (
        sections.map((section, i) => {
          const isOpen = openSections.has(i)
          return (
            <div key={i} className="border border-white/[0.06] rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-4 px-5 py-4 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
              >
                <span className="font-mono text-[10px] font-bold text-orange-500/50 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[11px] font-bold text-orange-400/90 uppercase tracking-[0.18em] flex-1">
                  {section.title}
                </span>
                <span
                  className={`text-gray-600 text-xs transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                >
                  ▼
                </span>
              </button>
              {isOpen && (
                <div
                  className="px-5 py-5 text-sm text-gray-400 leading-relaxed bg-[#080808] border-t border-white/[0.04] border-l-2 border-l-orange-500/50"
                  dangerouslySetInnerHTML={{ __html: formatBody(section.body) }}
                />
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
