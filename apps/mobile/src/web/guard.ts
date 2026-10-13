// the watch key on the web try page: taking it back and handing it over again only flip the visitor's copy
export * from '../guard'
import type { Session } from '../account'
import { API } from '../trade'
import { sim } from './sim'

const flip = async (path: string) => {
  await new Promise((r) => setTimeout(r, 900))
  await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
}
export async function revokeGuard(_s: Session) { await flip('/guard/revoke'); return sim.hash() }
export async function enrollGuard(_s: Session) { await flip('/guard/finish'); return { ok: true, account: 0 } }
export const restoreGuard = enrollGuard
