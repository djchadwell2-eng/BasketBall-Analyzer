import { vi, describe, it, expect, beforeEach } from 'vitest'

// chunker uses promisify(execFile). Mock child_process with a promisify.custom
// implementation so promisify() returns our async mock directly.
const { execFileAsyncMock } = vi.hoisted(() => ({ execFileAsyncMock: vi.fn() }))

vi.mock('child_process', async () => {
  const { promisify } = await import('util')
  return {
    execFile: Object.assign(vi.fn(), { [promisify.custom]: execFileAsyncMock }),
    spawn: vi.fn(),
  }
})

import { computeChunkSegments, chunkVideo, DEFAULT_CHUNK_DURATION } from '../chunker'

// Helper: make ffprobe return a specific duration
function mockDuration(seconds: number) {
  execFileAsyncMock.mockResolvedValueOnce({
    stdout: JSON.stringify({ streams: [{ codec_type: 'video', duration: String(seconds) }] }),
    stderr: '',
  })
}

// Helper: make ffmpeg calls succeed silently
function mockFfmpegOk(times = 10) {
  for (let i = 0; i < times; i++) {
    execFileAsyncMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
  }
}

beforeEach(() => {
  execFileAsyncMock.mockReset()
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
// chunkVideo — calls execFile (promisified), mock required
// ─────────────────────────────────────────────────────────────
describe('chunkVideo', () => {
  it('returns correct chunk objects for a 600s video', async () => {
    mockDuration(600)
    mockFfmpegOk(2)

    const chunks = await chunkVideo('/fake/video.mp4', 300)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].startOffset).toBe(0)
    expect(chunks[0].duration).toBe(300)
    expect(chunks[0].index).toBe(0)
    expect(chunks[1].startOffset).toBe(300)
    expect(chunks[1].duration).toBe(300)
    expect(chunks[1].index).toBe(1)
  })

  it('each chunk path is a non-empty string', async () => {
    mockDuration(300)
    mockFfmpegOk(1)

    const chunks = await chunkVideo('/fake/video.mp4', 300)
    expect(typeof chunks[0].path).toBe('string')
    expect(chunks[0].path.length).toBeGreaterThan(0)
  })

  it('calls execFile once for ffprobe + once per chunk for ffmpeg', async () => {
    mockDuration(600)
    mockFfmpegOk(2)

    await chunkVideo('/fake/video.mp4', 300)

    // 1 ffprobe + 2 ffmpeg = 3 total calls
    expect(execFileAsyncMock).toHaveBeenCalledTimes(3)
  })

  it('rejects when ffprobe returns no video stream', async () => {
    execFileAsyncMock.mockResolvedValueOnce({ stdout: JSON.stringify({ streams: [] }), stderr: '' })
    await expect(chunkVideo('/fake/video.mp4')).rejects.toThrow(/duration/)
  })
})
