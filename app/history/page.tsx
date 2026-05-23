import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export const revalidate = 0

interface VideoRow {
  id: string
  file_name: string
  title: string | null
  created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default async function HistoryPage() {
  const { data: videos } = await supabase
    .from('videos')
    .select('id, file_name, title, created_at')
    .order('created_at', { ascending: false })

  const rows = (videos ?? []) as VideoRow[]

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
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/25 to-transparent pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 py-14">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                <span className="text-[11px] font-semibold text-orange-500/90 tracking-[0.22em] uppercase">
                  AI Scouting Platform
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <h1 className="text-4xl font-black tracking-tight">
                  Analysis <span className="text-orange-500">History</span>
                </h1>
                {rows.length > 0 && (
                  <span className="text-xs font-semibold text-orange-500/70 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                    {rows.length}
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/"
              className="shrink-0 mt-1 text-xs font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-all"
            >
              ← Analyzer
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-32 text-center">
            <div className="w-16 h-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-2xl text-gray-700">
              ▶
            </div>
            <div>
              <p className="text-white font-semibold text-lg mb-1">No analyses yet</p>
              <p className="text-gray-500 text-sm">Upload your first game film to get started.</p>
            </div>
            <Link
              href="/"
              className="mt-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 rounded-xl text-sm font-semibold transition-colors"
            >
              Upload a Video →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((video, i) => (
              <Link
                key={video.id}
                href={`/history/${video.id}`}
                className="flex items-center gap-5 px-5 py-4 bg-white/[0.02] border border-white/[0.06] rounded-xl hover:border-orange-500/30 hover:bg-orange-500/[0.04] transition-all group"
              >
                <span className="font-mono text-xs font-bold text-orange-500/40 group-hover:text-orange-500/70 transition-colors w-6 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{video.title ?? video.file_name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {timeAgo(video.created_at)} &middot; {new Date(video.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-gray-600 group-hover:text-orange-400 transition-colors text-lg leading-none">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
