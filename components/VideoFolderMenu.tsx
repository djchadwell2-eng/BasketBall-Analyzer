'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Folder, FolderPlus } from 'lucide-react'

interface FolderRow { id: string; name: string }

interface Props {
  videoId: string
  folders: FolderRow[]
  currentFolderId: string | null
}

export default function VideoFolderMenu({ videoId, folders: initialFolders, currentFolderId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState(initialFolders)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setNewName('')
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function assignFolder(folderId: string | null) {
    setLoading(true)
    await fetch(`/api/videos/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    })
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function createAndAssign() {
    const name = newName.trim()
    if (!name) return
    setLoading(true)
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const folder: FolderRow = await res.json()
    if (folder.id) {
      setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)))
      await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folder.id }),
      })
    }
    setCreating(false)
    setNewName('')
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
        disabled={loading}
        className="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors disabled:opacity-40"
        title="Move to folder"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-[#141414] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold text-gray-500 tracking-widest uppercase">Add to Folder</p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {folders.length === 0 && !creating && (
              <p className="text-[11px] text-gray-600 px-3 py-3">No folders yet.</p>
            )}
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => assignFolder(f.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs hover:bg-white/[0.04] transition-colors ${
                  currentFolderId === f.id ? 'text-orange-400' : 'text-gray-300'
                }`}
              >
                <Folder size={11} className={currentFolderId === f.id ? 'text-orange-400' : 'text-gray-500'} />
                <span className="truncate">{f.name}</span>
                {currentFolderId === f.id && (
                  <span className="ml-auto text-[9px] text-orange-500/70">current</span>
                )}
              </button>
            ))}
          </div>

          {creating ? (
            <div className="px-3 py-2.5 border-t border-white/[0.06] flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createAndAssign()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
                placeholder="Folder name..."
                className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-orange-500/50"
              />
              <button
                onClick={createAndAssign}
                className="px-2 py-1.5 bg-orange-600 hover:bg-orange-500 rounded-lg text-xs font-semibold transition-colors"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors border-t border-white/[0.06]"
            >
              <FolderPlus size={11} />
              New folder...
            </button>
          )}

          {currentFolderId && (
            <button
              onClick={() => assignFolder(null)}
              className="w-full px-3 py-2 text-left text-[11px] text-gray-600 hover:text-red-400 hover:bg-white/[0.04] transition-colors border-t border-white/[0.06]"
            >
              Remove from folder
            </button>
          )}
        </div>
      )}
    </div>
  )
}
