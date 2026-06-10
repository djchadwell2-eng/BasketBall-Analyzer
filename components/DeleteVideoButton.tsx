'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export default function DeleteVideoButton({ videoId }: { videoId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this analysis? This cannot be undone.')) return
    setLoading(true)
    try {
      await fetch(`/api/videos/${videoId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="shrink-0 p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
      title="Delete analysis"
    >
      <Trash2 size={14} />
    </button>
  )
}
