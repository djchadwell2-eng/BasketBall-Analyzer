import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock child_process before importing chunker so execFileSync is intercepted
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from 'child_process'
import { computeChunkSegments, chunkVideo, DEFAULT_CHUNK_DURATION } from '../chunker'

const mockExecFileSync = vi.mocked(execFileSync)

// Helper: make ffprobe return a specific duration
function mockDuration(seconds: number) {
  mockExecFileSync.mockReturnValueOnce(
    JSON.stringify({ streams: [{ codec_type: 'video', duration: String(seconds) }] })
  )
}

// Helper: make ffmpeg calls succeed silently
function mockFfmpegOk(times = 10) {
  for (let i = 0; i < times; i++) {
    mockExecFileSync.mockReturnValueOnce(Buffer.from(''))
  }
}

beforeEach(() => {
  mockExecFileSync.mockReset()
})

// ─────────────────────────────────────────────────────────────
// computeChunkSegments — pure function, no mocking needed
// ─────────────────────────────────────────────────────────────
describe('computeChunkSegments', () => {
  it('splits a 600s video into 2 equal chunks', () => {
    const segs = computeChunkSegments(600, 300)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ startOffset: 0, duration: 300 })
    expect(segs[1]).toEqual({ startOffset: 300, duration: 300 })
  })

  it('produces a shorter final chunk when duration is not divisible', () => {
    const segs = computeChunkSegments(700, 300)
    expect(segs).toHaveLength(3)
    expect(segs[2]).toEqual({ startOffset: 600, duration: 100 })
  })

  it('produces a single chunk when video is shorter than chunk duration', () => {
    const segs = computeChunkSegments(200, 300)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toEqual({ startOffset: 0, duration: 200 })
  })

  it('returns an empty array for zero duration', () => {
    expect(computeChunkSegments(0, 300)).toHaveLength(0)
  })

  it('produces exactly 1 chunk when duration equals chunk duration', () => {
    const segs = computeChunkSegments(300, 300)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toEqual({ startOffset: 0, duration: 300 })
  })

  it('uses DEFAULT_CHUNK_DURATION when not specified', () => {
    const segs = computeChunkSegments(DEFAULT_CHUNK_DURATION * 2)
    expect(segs).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────
// chunkVideo — calls execSync, mock required
// ─────────────────────────────────────────────────────────────
describe('chunkVideo', () => {
  it('returns correct chunk objects for a 600s video', () => {
    mockDuration(600)
    mockFfmpegOk(2)

    const chunks = chunkVideo('/fake/video.mp4', 300)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].startOffset).toBe(0)
    expect(chunks[0].duration).toBe(300)
    expect(chunks[0].index).toBe(0)
    expect(chunks[1].startOffset).toBe(300)
    expect(chunks[1].duration).toBe(300)
    expect(chunks[1].index).toBe(1)
  })

  it('each chunk path is a non-empty string', () => {
    mockDuration(300)
    mockFfmpegOk(1)

    const chunks = chunkVideo('/fake/video.mp4', 300)
    expect(typeof chunks[0].path).toBe('string')
    expect(chunks[0].path.length).toBeGreaterThan(0)
  })

  it('calls execFileSync once for ffprobe + once per chunk for ffmpeg', () => {
    mockDuration(600)
    mockFfmpegOk(2)

    chunkVideo('/fake/video.mp4', 300)

    // 1 ffprobe + 2 ffmpeg = 3 total calls
    expect(mockExecFileSync).toHaveBeenCalledTimes(3)
  })

  it('throws when ffprobe returns no video stream', () => {
    mockExecFileSync.mockReturnValueOnce(JSON.stringify({ streams: [] }))
    expect(() => chunkVideo('/fake/video.mp4')).toThrow(/duration/)
  })
})
