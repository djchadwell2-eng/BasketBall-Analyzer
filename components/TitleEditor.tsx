'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  videoId: string
  initialTitle: string
}

export default function TitleEditor({ videoId, initialTitle }: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialTitle)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.trim() || draft === title) { setEditing(false); return }
    setSaving(true)
    await supabase.from('videos').update({ title: draft.trim() }).eq('id', videoId)
    setTitle(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  function cancel() {
    setDraft(title)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className="flex-1 bg-white/[0.04] border border-orange-500/50 rounded-lg px-4 py-2 text-xl font-black tracking-tight text-white outline-none"
        />
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          onClick={cancel}
          className="px-3 py-2 border border-white/10 hover:border-white/20 text-gray-400 hover:text-white rounded-lg text-xs font-semibold transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-baseline gap-3 mt-1 group">
      <h1 className="text-3xl font-black tracking-tight text-white truncate">{title}</h1>
      <button
        onClick={() => { setDraft(title); setEditing(true) }}
        className="text-xs text-gray-600 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
      >
        rename
      </button>
    </div>
  )
}
