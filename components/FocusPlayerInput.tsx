'use client'

import { useState } from 'react'
import type { FocusPlayer } from '@/lib/analyzeFrames'

interface Props {
  value: FocusPlayer | null
  onChange: (p: FocusPlayer | null) => void
}

export default function FocusPlayerInput({ value, onChange }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [jerseyNumber, setJerseyNumber] = useState('')
  const [jerseyColor, setJerseyColor] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [position, setPosition] = useState('')

  function toggle() {
    const next = !enabled
    setEnabled(next)
    if (!next) {
      onChange(null)
    } else if (jerseyNumber.trim() && jerseyColor.trim()) {
      onChange({ jerseyNumber: jerseyNumber.trim(), jerseyColor: jerseyColor.trim(), playerName: playerName.trim() || undefined, position: position.trim() || undefined })
    }
  }

  function update(field: 'jerseyNumber' | 'jerseyColor' | 'playerName' | 'position', val: string) {
    const updaters = { jerseyNumber: setJerseyNumber, jerseyColor: setJerseyColor, playerName: setPlayerName, position: setPosition }
    updaters[field](val)
    if (!enabled) return
    const next = {
      jerseyNumber: field === 'jerseyNumber' ? val : jerseyNumber,
      jerseyColor: field === 'jerseyColor' ? val : jerseyColor,
      playerName: (field === 'playerName' ? val : playerName).trim() || undefined,
      position: (field === 'position' ? val : position).trim() || undefined,
    }
    if (next.jerseyNumber.trim() && next.jerseyColor.trim()) {
      onChange({ ...next, jerseyNumber: next.jerseyNumber.trim(), jerseyColor: next.jerseyColor.trim() })
    } else {
      onChange(null)
    }
  }

  return (
    <div className="max-w-2xl bg-white/[0.02] border border-white/[0.06] rounded-xl px-5 py-4 mt-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[11px] font-semibold text-orange-500/70 tracking-[0.2em] uppercase">
            Focus Player Mode
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Target a specific player for individual scouting intelligence
          </p>
        </div>
        {/* Toggle */}
        <button
          onClick={toggle}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${enabled ? 'bg-orange-500' : 'bg-white/10'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Jersey # <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={jerseyNumber}
                onChange={e => update('jerseyNumber', e.target.value)}
                placeholder="e.g. 24"
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Jersey Color <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={jerseyColor}
                onChange={e => update('jerseyColor', e.target.value)}
                placeholder="e.g. White"
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Player Name <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={playerName}
                onChange={e => update('playerName', e.target.value)}
                placeholder="e.g. LeBron James"
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Position <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={position}
                onChange={e => update('position', e.target.value)}
                placeholder="e.g. Guard"
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-orange-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
          </div>
          {value && (
            <p className="text-[11px] text-green-500/80">
              ✓ Targeting #{value.jerseyNumber} · {value.jerseyColor}
              {value.playerName ? ` · ${value.playerName}` : ''}
            </p>
          )}
          {enabled && !value && (
            <p className="text-[11px] text-orange-500/60">
              Enter jersey # and color to activate
            </p>
          )}
        </div>
      )}
    </div>
  )
}
