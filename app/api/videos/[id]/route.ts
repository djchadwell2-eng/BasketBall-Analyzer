import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { folder_id } = await req.json()
  const admin = getSupabaseAdmin()
  await admin.from('videos').update({ folder_id: folder_id ?? null }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = getSupabaseAdmin()

  // Get video_url before deleting so we can clean up storage
  const { data: videoRow } = await admin
    .from('videos')
    .select('video_url')
    .eq('id', id)
    .single()

  // Delete all related rows (order matters — child tables first)
  await admin.from('player_reports').delete().eq('video_id', id)
  await admin.from('game_patterns').delete().eq('video_id', id)
  await admin.from('possessions').delete().eq('video_id', id)
  await admin.from('sequences').delete().eq('video_id', id)
  await admin.from('analyses').delete().eq('video_id', id)
  await admin.from('videos').delete().eq('id', id)

  // Best-effort storage cleanup — extract key from public URL
  const videoUrl = videoRow?.video_url as string | null
  if (videoUrl) {
    try {
      // URL format: https://<project>.supabase.co/storage/v1/object/public/videos/<key>
      const storageKey = videoUrl.split('/videos/').at(-1)
      if (storageKey) {
        await admin.storage.from('videos').remove([storageKey])
      }
    } catch {
      // non-fatal — DB rows already deleted
    }
  }

  return NextResponse.json({ ok: true })
}
