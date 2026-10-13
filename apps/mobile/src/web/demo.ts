// the account the web try page opens. what a visitor does plays out on their own copy of it (sim.ts)
export const DEMO = (process.env.EXPO_PUBLIC_DEMO ?? '0xa8741ed6c57872498afe4f792d8d238ea1c071f9') as `0x${string}`

// the fingerprint sheet (DemoHost.web) answers true once the drawn sensor is read, false on cancel
let ask: (() => Promise<boolean>) | null = null
let open: Promise<boolean> | null = null
export const onAsk = (fn: () => Promise<boolean>) => { ask = fn }

// stands in for the passkey sheet
export async function fingerprint() {
  open ??= (ask ? ask() : Promise.resolve(true)).finally(() => { open = null })
  if (!(await open)) throw new Error('NotAllowedError: the passkey sheet was closed')
}
