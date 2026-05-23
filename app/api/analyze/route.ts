import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { extractFrames, cleanupTempFile } from '@/lib/extractFrames'
import { analyzeFrames } from '@/lib/analyzeFrames'
import { supabase } from '@/lib/supabase'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  let videoPath: string | null = null

  try {
    const formData = await request.formData()
    const file = formData.get('video') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No video file provided.' }, { status: 400 })
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Use MP4, MOV, AVI, or WebM.` },
        { status: 400 }
      )
    }

    const ext = path.extname(file.name) || '.mp4'
    const sessionId = `bball_upload_${Date.now()}`
    videoPath = path.join(os.tmpdir(), `${sessionId}${ext}`)

    const arrayBuffer = await file.arrayBuffer()
    fs.writeFileSync(videoPath, Buffer.from(arrayBuffer))

    const frames = extractFrames(videoPath)
    const analysis = await analyzeFrames(frames)

    let videoId: string | null = null

    try {
      const admin = getSupabaseAdmin()
      const storageKey = `${sessionId}${ext}`
      const fileBuffer = fs.readFileSync(videoPath!)
      const { error: uploadError } = await admin.storage.from('videos').upload(storageKey, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadError) {
        console.error('[analyze] Storage upload failed:', uploadError.message)
      }
      const { data: urlData } = admin.storage.from('videos').getPublicUrl(storageKey)
      const videoUrl = uploadError ? null : (urlData?.publicUrl ?? null)

      const { data: videoRow } = await supabase
        .from('videos')
        .insert({ file_name: file.name, video_url: videoUrl })
        .select('id')
        .single()

      if (videoRow) {
        videoId = videoRow.id
        await supabase.from('analyses').insert({
          video_id: videoRow.id,
          report_text: analysis.summary,
          frame_count: analysis.frameCount,
          model: analysis.model,
        })

        for (const seq of analysis.sequences) {
          await supabase.from('sequences').insert({
            video_id: videoRow.id,
            sequence_index: seq.sequenceIndex,
            timestamp_start: seq.timestampStart,
            timestamp_end: seq.timestampEnd,
            play_type: seq.playType,
            summary: seq.summary,
            coaching_takeaway: seq.coachingTakeaway,
            thumbnail_b64: seq.thumbnail,
            what_happened: seq.whatHappened,
            what_it_means: seq.whatItMeans,
            why_it_matters: seq.whyItMatters,
            coaching_point: seq.coachingPoint,
            pattern_context: seq.patternContext,
            metadata: {
              direction_hint: seq.directionHint,
              tags: seq.tags,
              action_types: seq.actionTypes,
              outcome: seq.outcome,
            },
          })
        }
      }
    } catch (dbErr) {
      console.error('[analyze] Supabase save failed:', dbErr)
    }

    return NextResponse.json({
      success: true,
      videoId,
      frames: frames.map((f) => ({
        base64: f.base64,
        timestamp: f.timestamp,
        index: f.index,
      })),
      analysis,
      sequences: analysis.sequences,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unknown error occurred.'
    console.error('[analyze] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (videoPath) cleanupTempFile(videoPath)
  }
}
