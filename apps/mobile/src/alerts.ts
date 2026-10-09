// which alerts reach the phone (services/api/src/alerts.ts). quiet hours are minutes of the local day, the
// phone's offset goes with every write so the server reads the same clock
import { authedGet, authedPost } from './session'

export const ALERT_KINDS = ['near_liq', 'acted', 'filled', 'liquidated', 'funding', 'depeg', 'watched'] as const
export type AlertKind = (typeof ALERT_KINDS)[number]
export type AlertPrefs = { on: Record<AlertKind, boolean>; quiet: { from: number; to: number } | null; tz: number }

export type SentAlert = { kind: string; title: string; body: string; at: number; held: number }

export async function readAlerts(address: string): Promise<{ prefs: AlertPrefs; recent: SentAlert[] }> {
  const r = await authedGet(`/alerts/${address}`, address)
  if (!r.ok) throw new Error(`alerts ${r.status}`)
  return r.json() as Promise<{ prefs: AlertPrefs; recent: SentAlert[] }>
}

export async function saveAlerts(address: string, patch: { on?: Partial<Record<AlertKind, boolean>>; quiet?: AlertPrefs['quiet'] }): Promise<AlertPrefs> {
  const j = await authedPost<{ prefs?: AlertPrefs }>(`/alerts/${address}`, address, { ...patch, tz: -new Date().getTimezoneOffset() })
  if (!j.prefs) throw new Error('alerts not saved')
  return j.prefs
}
