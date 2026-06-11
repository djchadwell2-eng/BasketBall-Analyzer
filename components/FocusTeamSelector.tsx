'use client'

import { useState } from 'react'
import type { FocusTeam } from '@/lib/types'

const PRESET_COLORS: { label: string; value: string; swatch: string }[] = [
  { label: 'White',  value: 'white',  swatch: '#f5f5f5' },
  { label: 'Black',  value: 'black',  swatch: '#1f2937' },
  { label: 'Red',    value: 'red',    swatch: '#dc2626' },
  { label: 'Blue',   value: 'blue',   swatch: '#2563eb' },
  { label: 'Navy',   value: 'navy blue', swatch: '#1e3a8a' },
  { label: 'Green',  value: 'green',  swatch: '#16a34a' },
  { label: 'Yellow', value: 'yellow', swatch: '#eab308' },
  { label: 'Purple', value: 'purple', swatch: '#7c3aed' },
]

interface FocusTeamSelectorProps {
  value: FocusTeam | null
  onChange: (team: FocusTeam | null) => void
}

export default function FocusTeamSelector({ value, onChange }: FocusTeamSelectorProps) {
  const [customColor, setCustomColor] = useState('')
  const [teamName, setTeamName] = useState('')

  const selectedColor = value?.jerseyColor ?? null
  const isPreset = PRESET_COLORS.some(c => c.value === selectedColor)

  function emit(jerseyColor: string | null, name: string) {
    if (!jerseyColor || !jerseyColor.trim()) {
      onChange(null)
      return
    }
    onChange({ jerseyColor: jerseyColor.trim(), teamName: name.trim() || undefined })
  }

  function selectPreset(color: string) {
    setCustomColor('')
    // clicking the active chip deselects it
    emit(selectedColor === color ? null : color, teamName)
  }

  function handleCustomColor(text: string) {
    setCustomColor(text)
    emit(text, teamName)
  }

  function handleTeamName(text: string) {
    setTeamName(text)
    if (selectedColor) emit(selectedColor, text)
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.2em] uppercase">
          Which team are we analyzing?
        </p>
        {value && (
          <span className="text-[10px] text-green-400/80 font-mono shrink-0">
            ✓ {value.jerseyColor}{value.teamName ? ` · ${value.teamName}` : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Pick your team&apos;s jersey color so the AI knows whose offense and defense it&apos;s scouting.
        Without this, the report may mix both teams together.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {PRESET_COLORS.map(({ label, value: color, swatch }) => {
          const isActive = selectedColor === color
          return (
            <button
              key={color}
              type="button"
              onClick={() => selectPreset(color)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                isActive
                  ? 'border-orange-500/60 bg-orange-500/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/25 hover:text-white'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full border border-white/20 inline-block"
                style={{ backgroundColor: swatch }}
              />
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={isPreset ? '' : customColor}
          onChange={e => handleCustomColor(e.target.value)}
          placeholder="Other color (e.g. teal, maroon)"
          className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/40 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-700 outline-none transition-colors"
        />
        <input
          type="text"
          value={teamName}
          onChange={e => handleTeamName(e.target.value)}
          placeholder="Team name (optional)"
          className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/40 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-700 outline-none transition-colors"
        />
      </div>
    </div>
  )
}
