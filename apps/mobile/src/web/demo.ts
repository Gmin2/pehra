// the account the web try page opens, read only
export const DEMO = (process.env.EXPO_PUBLIC_DEMO ?? '0xa8741ed6c57872498afe4f792d8d238ea1c071f9') as `0x${string}`

// the store shows every demo stop as a notice, so a tap that would sign always says why nothing happened
let say: ((s: string) => void) | null = null
export const onDemo = (fn: (s: string) => void) => { say = fn }

export class DemoError extends Error {
  constructor(what = 'in the app that fingerprint signs it and it goes to perpl, here nothing was sent') {
    super(`this is the demo. ${what}`)
    say?.(this.message)
  }
}

// the fingerprint sheet (DemoHost.web) answers true once the drawn sensor is read, false on cancel
let ask: (() => Promise<boolean>) | null = null
let open: Promise<boolean> | null = null
export const onAsk = (fn: () => Promise<boolean>) => { ask = fn }

// stands in for the passkey sheet: the fingerprint is drawn and read, the signing never happens
export async function fingerprint(what?: string): Promise<never> {
  open ??= (ask ? ask() : Promise.resolve(true)).finally(() => { open = null })
  if (!(await open)) throw new Error('NotAllowedError: the passkey sheet was closed')
  throw new DemoError(what)
}
