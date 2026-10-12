// no push on the web try page
import { DemoError } from './web/demo'

export async function setupPush() {}
export async function refreshPush(_address: string) { return null }
export async function registerPush(_address: string, _say: (s: string) => void) { return null }
export function onPushResponse(_handler: (action: string, data: Record<string, string>, id: string) => void) { return () => {} }
export async function launchedFromPush() { return null }
export function onPushTap(_handler: (data: Record<string, string>) => void) { return () => {} }
export const testPush = async (_address: string): Promise<{ sent: number; reason?: string }> => { throw new DemoError('in the app, pehra pushes to your phone') }
export const addFromPush = async (_address: string, _pid: number, _ausd: number) => ({ error: new DemoError().message }) as { health?: { distance: number; collateral: number }; error?: string }
