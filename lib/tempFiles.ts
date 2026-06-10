import * as fs from 'fs'

export function cleanupTempFile(filePath: string): void {
  try { fs.unlinkSync(filePath) } catch {}
}
