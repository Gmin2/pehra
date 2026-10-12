// the account the web try page opens, read only
export const DEMO = (process.env.EXPO_PUBLIC_DEMO ?? '0xa8741ed6c57872498afe4f792d8d238ea1c071f9') as `0x${string}`

// the store shows every demo stop as a notice, so a tap that would sign always says why nothing happened
let say: ((s: string) => void) | null = null
export const onDemo = (fn: (s: string) => void) => { say = fn }

export class DemoError extends Error {
  constructor(what = 'in the app, your fingerprint signs this and it runs on perpl') {
    super(`this is the demo. ${what}`)
    say?.(this.message)
  }
}
