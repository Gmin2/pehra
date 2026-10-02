import { describe, expect, test } from 'bun:test'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import { canonicalJson, ruleHash, ruleMessage, summary } from '../src/ruleSign'
import { Rule } from '../src/rule'

const stop = Rule.parse({ v: 1, id: 's1', pid: 9, mkt: 64, kind: 'stop', px: 0.0332, floor: 0.0329, backstopPx: 0.0322 })
const who = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')

describe('rule signing', () => {
  test('canonicalJson json sorts keys at every level, so key order never changes the hash', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
    const shuffled = Rule.parse({ backstopPx: 0.0322, floor: 0.0329, px: 0.0332, kind: 'stop', mkt: 64, pid: 9, id: 's1', v: 1 })
    expect(ruleHash(shuffled)).toBe(ruleHash(stop))
  })

  test('the message reads as plain lines a person can check', () => {
    const m = ruleMessage('0xABC', { action: 'create', rule: stop, symbol: 'MON' }, 'n1', Date.UTC(2026, 9, 2, 12))
    expect(m.split('\n')).toEqual([
      'pehra rules for 0xabc',
      'hidden stop on MON at 0.0332, never below 0.0329, backstop 0.0322 on perpl',
      'id s1 v1',
      `sha256 ${ruleHash(stop)}`,
      'nonce n1',
      'expires 2026-10-02T12:00:00.000Z',
    ])
    expect(summary(Rule.parse({ v: 1, id: 'l', pid: 9, mkt: 64, kind: 'ladder', steps: [{ px: 0.04, share: 30, floor: 0.039 }] }), 'MON')).toBe('take profit on MON: 30% at 0.04')
  })

  test('a signature over the rebuilt message verifies, and any change to the rule breaks it', async () => {
    const exp = Date.now() + 60_000
    const sig = await who.signMessage({ message: ruleMessage(who.address, { action: 'create', rule: stop, symbol: 'MON' }, 'n2', exp) })
    expect(await verifyMessage({ address: who.address, message: ruleMessage(who.address, { action: 'create', rule: stop, symbol: 'MON' }, 'n2', exp), signature: sig })).toBe(true)
    const moved = Rule.parse({ ...stop, floor: 0.02 })
    expect(await verifyMessage({ address: who.address, message: ruleMessage(who.address, { action: 'create', rule: moved, symbol: 'MON' }, 'n2', exp), signature: sig })).toBe(false)
  })
})
