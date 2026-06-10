import { NextRequest } from 'next/server'
import Busboy from 'busboy'
import { Readable } from 'stream'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { cleanupTempFile } from '@/lib/extractFrames'
import type { FocusPlayer } from '@/lib/analyzeFrames'
import { supabase } from '@/lib/supabase'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 300

const encoder = new TextEncoder()

interface UploadedFile {
  videoPath: string
  fileName: string
  mimeType: string
  focusPlayer: FocusPlayer | null
}

async function parseUpload(request: NextRequest): Promise<UploadedFile> {
  const contentType = request.headers.get('content-type') ?? ''
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: { 'content-type': contentType } })
    let videoPath: string | null = null
    let fileName = 'upload.mp4'
    let mimeType = 'video/mp4'
    let focusPlayerStr: string | null = null
    const writes: Promise<void>[] = []

    busboy.on('file', (fieldname, fileStream, info) => {
      if (fieldname !== 'video') { fileStream.resume(); return }
      fileName = info.filename || 'upload.mp4'
      mimeType = info.mimeType || 'video/mp4'
      const ext = path.extname(fileName) || '.mp4'
      videoPath = path.join(os.tmpdir(), `bball_upload_${Date.now()}${ext}`)
      const writeStream = fs.createWriteStream(videoPath)
      writes.push(new Promise<void>((res, rej) => {
        writeStream.on('finish', res)
        writeStream.on('error', rej)
        fileStream.on('error', rej)
      }))
      fileStream.pipe(writeStream)
    })

    busboy.on('field', (fieldname, value) => {
      if (fieldname === 'focusPlayer') focusPlayerStr = value
    })

    busboy.on('finish', async () => {
      try {
        await Promise.all(writes)
        if (!videoPath) { reject(new Error('No video file provided.')); return }
        resolve({
          videoPath,
          fileName,
          mimeType,
          focusPlayer: focusPlayerStr ? (JSON.parse(focusPlayerStr) as FocusPlayer) : null,
        })
      } catch (err) {
        reject(err)
      }
    })

    busboy.on('error', reject)

    Readable.fromWeb(request.body as import('stream/web').ReadableStream).pipe(busboy)
  })
}

async function processAnalysis(
  upload: UploadedFile,
  send: (e: object) => Promise<void>
): Promise<void> {
  const { videoPath, fileName, mimeType, focusPlayer } = upload

  try {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
    if (!allowedTypes.includes(mimeType)) {
      await send({ type: 'error', message: `Unsupported file type: ${mimeType}. Use MP4, MOV, AVI, or WebM.` })
      return
    }

    const sessionId = `bball_upload_${Date.now()}`
    await send({ type: 'progress', pct: 5, message: 'Upload received...' })

    await send({ type: 'progress', pct: 15, message: 'Chunking video for Gemini...' })
    const { analyzeVideoWithGemini } = await import('@/lib/analyzers/gemini-video-analyzer')
    const analysis = await analyzeVideoWithGemini(videoPath, focusPlayer)

    await send({ type: 'progress', pct: 85, message: 'Saving analysis...' })

    let videoId: string | null = null
    let uploadDiagnostic: string | null = null

    try {
      // Step 1: Insert the video row FIRST so it always lands in history,
      // regardless of whether the storage upload succeeds or fails.
      const { data: videoRow, error: videoRowError } = await supabase
        .from('videos')
        .insert({ file_name: fileName, video_url: null })
        .select('id')
        .single()

      if (videoRowError) {
        console.error('[analyze] Step 1 FAILED — videos insert error:', videoRowError.message)
      } else {
        videoId = videoRow!.id
        console.log('[analyze] Step 1 OK — video row inserted, id =', videoId)
      }

      // Step 2: Best-effort storage upload — streamed to avoid loading large files into RAM.
      // Failure here is non-fatal; the video row is already saved above.
      if (videoId) {
        try {
          const admin = getSupabaseAdmin()
          const ext = path.extname(fileName) || '.mp4'
          const storageKey = `${sessionId}${ext}`
          const fileStream = fs.createReadStream(videoPath)
          const fileSizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)
          console.log(`[analyze] Step 2: uploading to storage — key=${storageKey} size=${fileSizeMB} MB`)
          const { error: uploadError } = await admin.storage.from('videos').upload(storageKey, fileStream, { contentType: mimeType, upsert: false })
          if (uploadError) {
            uploadDiagnostic = uploadError.message
            console.error('[analyze] Step 2 FAILED — storage upload error:', uploadError.message)
          } else {
            const { data: urlData } = admin.storage.from('videos').getPublicUrl(storageKey)
            const videoUrl = urlData?.publicUrl ?? null
            if (videoUrl) {
              await supabase.from('videos').update({ video_url: videoUrl }).eq('id', videoId)
              console.log('[analyze] Step 2 OK — video_url saved:', videoUrl)
            }
          }
        } catch (storageErr) {
          console.error('[analyze] Step 2 ERROR (non-fatal):', storageErr)
        }
      }

      if (videoId) {
        await send({ type: 'progress', pct: 88, message: 'Saving sequences...' })

        for (const seq of analysis.sequences) {
          const { error: seqError } = await supabase.from('sequences').insert({
            video_id: videoId,
            sequence_index: seq.sequenceIndex,
            possession_id: seq.possessionId,
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
          if (seqError) console.error(`[analyze] Step 6 FAILED — sequence ${seq.sequenceIndex} insert:`, seqError.message)
        }

        const { error: analysisError } = await supabase.from('analyses').insert({
          video_id: videoId,
          report_text: analysis.summary,
          frame_count: analysis.frameCount,
          model: analysis.model,
        })
        if (analysisError) console.error('[analyze] Step 5 FAILED — analyses insert:', analysisError.message)
        console.log('[analyze] Step 6 OK — sequences + analysis inserted')
        await send({ type: 'progress', pct: 92, message: 'Saving possessions...' })

        for (const pos of analysis.possessions) {
          const { error: posError } = await supabase.from('possessions').insert({
            video_id: videoId,
            possession_id: pos.possessionId,
            possession_type: pos.possessionType,
            start_timestamp: pos.startTimestamp,
            end_timestamp: pos.endTimestamp,
            summary: pos.summary,
            coaching_insight: pos.coachingInsight,
            key_observations: pos.keyObservations,
            outcome: pos.outcome,
            metadata: pos.metadata,
            tactical_tags: pos.tacticalTags,
            pace_profile: pos.paceProfile,
            confidence: pos.confidence,
            events: pos.events,
            importance_score: pos.importanceScore ?? null,
          })
          if (posError) console.error(`[analyze] Step 7 FAILED — possession ${pos.possessionId} insert:`, posError.message)
        }
        console.log('[analyze] Step 7 OK — all possessions inserted')
        await send({ type: 'progress', pct: 95, message: 'Saving game patterns...' })

        const { error: patternError } = await supabase.from('game_patterns').insert({
          video_id: videoId,
          pattern_insights: analysis.patternInsights,
          offensive_tendencies: analysis.offensiveTendencies,
          defensive_tendencies: analysis.defensiveTendencies,
          transition_analysis: analysis.transitionAnalysis,
          game_identity: analysis.gameIdentity,
          strategic_adjustments: analysis.strategicAdjustments,
          ranked_observations: analysis.rankedObservations,
          computed_stats: analysis.computedStats,
        })
        if (patternError) console.error('[analyze] Step 8 FAILED — game_patterns insert:', patternError.message)
        else console.log('[analyze] Step 8 OK — game patterns inserted')

        if (analysis.playerReport) {
          const { error: playerError } = await supabase.from('player_reports').insert({
            video_id: videoId,
            jersey_number: analysis.playerReport.jerseyNumber,
            jersey_color: analysis.playerReport.jerseyColor,
            player_name: analysis.playerReport.playerName ?? null,
            position: analysis.playerReport.position ?? null,
            profile: analysis.playerReport.profile,
            offensive_tendencies: analysis.playerReport.offensiveTendencies,
            defensive_tendencies: analysis.playerReport.defensiveTendencies,
            strengths: analysis.playerReport.strengths,
            weaknesses: analysis.playerReport.weaknesses,
            coaching_recommendations: analysis.playerReport.coachingRecommendations,
            player_events: analysis.playerReport.playerEvents,
            involved_possession_ids: analysis.playerReport.involvedPossessionIds,
          })
          if (playerError) console.error('[analyze] Step 9 FAILED — player_reports insert:', playerError.message)
          else console.log('[analyze] Step 9 OK — player report inserted')
        }
      }
    } catch (dbErr) {
      console.error('[analyze] Supabase save failed (uncaught):', dbErr)
    }

    await send({
      type: 'complete',
      data: {
        videoId,
        uploadDiagnostic,
        analysis: {
          summary: analysis.summary,
          model: analysis.model,
          frameCount: analysis.frameCount,
        },
        sequences: analysis.sequences,
        possessions: analysis.possessions,
        patternInsights: analysis.patternInsights,
        offensiveTendencies: analysis.offensiveTendencies,
        defensiveTendencies: analysis.defensiveTendencies,
        transitionAnalysis: analysis.transitionAnalysis,
        gameIdentity: analysis.gameIdentity,
        playerReport: analysis.playerReport ?? null,
        strategicAdjustments: analysis.strategicAdjustments,
        rankedObservations: analysis.rankedObservations,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unknown error occurred.'
    console.error('[analyze] Error:', message)
    const is429 = message.includes('429') || message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('too large')
    await send({
      type: 'error',
      message: is429
        ? 'OpenAI rate limit hit (too many tokens this minute). Wait 60 seconds and try again.'
        : message,
    })
  } finally {
    cleanupTempFile(videoPath)
  }
}

export async function POST(request: NextRequest) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  const send = async (event: object): Promise<void> => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } catch {
      // stream already closed
    }
  }

  // Parse the multipart upload with busboy (streaming — no memory issues for large files)
  parseUpload(request)
    .then((upload) => processAnalysis(upload, send))
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : 'Failed to parse upload'
      console.error('[analyze] parseUpload error:', message)
      await send({ type: 'error', message: `Upload failed: ${message}` })
    })
    .finally(async () => {
      try { await writer.close() } catch {}
    })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
