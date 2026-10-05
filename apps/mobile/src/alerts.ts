// which alerts reach the phone (services/api/src/alerts.ts). quiet hours are minutes of the local day, the
// phone's offset goes with every write so the server reads the same clock
import { API } from './trade'

export const ALERT_KINDS = ['near_liq', 'acted', 'filled', 'liquidated', 'funding', 'depeg'] as const
export type AlertKind = (typeof ALERT_KINDS)[number]
export type AlertPrefs = { on: Record<AlertKind, boolean>; quiet: { from: number; to: number } | null; tz: number }

export async function readAlerts(address: string): Promise<{ prefs: AlertPrefs }> {
  const r = await fetch(`${API}/alerts/${address}`)
  if (!r.ok) throw new Error(`alerts ${r.status}`)
  return r.json() as Promise<{ prefs: AlertPrefs }>
}

export async function saveAlerts(address: string, patch: { on?: Partial<Record<AlertKind, boolean>>; quiet?: AlertPrefs['quiet'] }): Promise<AlertPrefs> {
  const r = await fetch(`${API}/alerts/${address}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...patch, tz: -new Date().getTimezoneOffset() }) })
  const j = (await r.json()) as { prefs?: AlertPrefs; error?: string }
  if (!r.ok || !j.prefs) throw new Error(j.error ?? `alerts ${r.status}`)
  return j.prefs
}
