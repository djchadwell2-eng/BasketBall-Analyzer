import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Basketball Film Analyzer',
  description: 'AI-powered basketball film analysis using OpenAI Vision',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
