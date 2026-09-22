// every screen logs through here: the console for logcat and the server so the log can be tailed
import { API } from './trade'

export function log(line: string) {
  console.log('[pehra]', line)
  fetch(`${API}/log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line }) }).catch(() => {})
}
