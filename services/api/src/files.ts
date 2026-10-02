import { renameSync, writeFileSync } from 'node:fs'

// write to a sibling file then rename over the target. a rename is atomic on the same disk, so a crash
// mid write leaves the old file intact instead of a truncated one that breaks the next boot
export function writeAtomic(url: URL, data: string) {
  const tmp = new URL(url.href + '.tmp')
  writeFileSync(tmp, data)
  renameSync(tmp, url)
}
