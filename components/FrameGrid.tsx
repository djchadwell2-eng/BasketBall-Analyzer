interface FrameData {
  base64: string
  timestamp: number
  index: number
  sequenceIndex?: number
}

interface Props {
  frames: FrameData[]
}

export default function FrameGrid({ frames }: Props) {
  // Group frames by sequence
  const sequences = frames.reduce<Record<number, FrameData[]>>((acc, frame) => {
    const seq = frame.sequenceIndex ?? 0
    if (!acc[seq]) acc[seq] = []
    acc[seq].push(frame)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Extracted Sequences</h2>
      {Object.entries(sequences).map(([seqKey, seqFrames]) => {
        const start = seqFrames[0].timestamp.toFixed(1)
        const end = seqFrames[seqFrames.length - 1].timestamp.toFixed(1)
        return (
          <div key={seqKey}>
            <p className="text-sm text-gray-500 mb-2">
              Sequence {Number(seqKey) + 1} &mdash; {start}s &rarr; {end}s
            </p>
            <div className="grid grid-cols-4 gap-2">
              {seqFrames.map((frame) => (
                <div key={frame.index} className="space-y-1">
                  <img
                    src={`data:image/jpeg;base64,${frame.base64}`}
                    alt={`Sequence ${Number(seqKey) + 1} frame at ${frame.timestamp.toFixed(1)}s`}
                    className="w-full aspect-video object-cover rounded-lg bg-gray-800"
                  />
                  <p className="text-xs text-center text-gray-500">
                    {frame.timestamp.toFixed(1)}s
                  </p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
