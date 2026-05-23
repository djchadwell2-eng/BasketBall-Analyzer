'use client'

import { useRef, useState } from 'react'

interface Props {
  onUpload: (file: File) => void
}

export default function VideoUpload({ onUpload }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedFile) onUpload(selectedFile)
  }

  const sizeLabel = selectedFile
    ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
    : null

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        className="relative border border-dashed border-orange-900/40 hover:border-orange-500/60 rounded-2xl py-28 px-8 text-center cursor-pointer transition-all duration-300 bg-[#0d0d0d] hover:bg-orange-950/10 group overflow-hidden"
        onClick={() => inputRef.current?.click()}
      >
        {/* Subtle glow on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(234,88,12,0.08), transparent)' }}
        />

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
          onChange={handleFileChange}
          className="hidden"
        />

        {selectedFile ? (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mx-auto">
              <span className="text-green-400 text-xl leading-none">✓</span>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-5 py-4 max-w-xs mx-auto text-left">
              <p className="font-semibold text-white text-sm truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500 mt-1">{sizeLabel} &mdash; ready to analyze</p>
            </div>
            <p className="text-xs text-gray-600">Click to change file</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 mx-auto">
              <span className="text-orange-400 text-2xl leading-none">▶</span>
            </div>
            <div>
              <p className="text-white text-xl font-semibold mb-2">Drop your game film here</p>
              <p className="text-sm text-gray-500">MP4 · MOV · AVI · WebM</p>
            </div>
            <p className="text-xs text-gray-700">or click anywhere to browse</p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!selectedFile}
        className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded-xl font-semibold text-sm tracking-wide transition-all shadow-lg shadow-orange-900/30 disabled:shadow-none"
      >
        {selectedFile ? 'Run Analysis →' : 'Select a Video to Begin'}
      </button>
    </form>
  )
}
