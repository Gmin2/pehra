// a stand in for the global WebSocket that lets a test script the server side
export type Sent = Record<string, unknown>

export class FakeSocket {
  static instances: FakeSocket[] = []
  static OPEN = 1
  readyState = 0
  url: string
  sent: Sent[] = []
  onopen: ((e: unknown) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}) })
  }
  private handlers = new Map<string, ((e: { data: Uint8Array }) => void)[]>()
  addEventListener(type: string, fn: (e: { data: Uint8Array }) => void) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]) }
  send(data: string) { this.sent.push(JSON.parse(data)) }
  // a protocol level ping from the server, which bun reports as a 'ping' event
  serverPing() { for (const fn of this.handlers.get("ping") ?? []) fn({ data: new Uint8Array() }) }
  close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }) }
  // server side helpers
  serverSend(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }) }
  serverSnapshot(account: Record<string, unknown> = {}) {
    this.serverSend({ mt: 19, sn: 1000, addr: '0xabc', n: 1, fl: 0, as: [{ id: 649, fw: true, fr: false, ft: 0, lfr: 7, b: '199946095', lb: '0', ...account }] })
    this.serverSend({ mt: 23, d: [] })
    this.serverSend({ mt: 26, d: [] })
  }
}

export function installFakeSocket() {
  const real = globalThis.WebSocket
  FakeSocket.instances = []
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket
  return () => { globalThis.WebSocket = real }
}

export const tick = () => new Promise(r => setTimeout(r, 0))
