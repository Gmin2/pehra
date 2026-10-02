import { describe, expect, test } from 'bun:test'
import { decodeFunctionData } from 'viem'
import { closeAllCalls, escapeAbi } from '../src/escape'
import { exchangeAbi } from '../src/onchain'

describe('escape hatch calls', () => {
  const open = [{ perpId: 64, long: true, lots: 200n, mark: 3400n }, { perpId: 32, long: false, lots: 5n, mark: 250000n }]

  test('forwarding off first, then one ioc close per position, 5% through the mark', () => {
    const calls = closeAllCalls(open, { forwardingOff: true, now: 1_790_000_000_000 })
    expect(calls.length).toBe(2)
    const off = decodeFunctionData({ abi: exchangeAbi, data: calls[0].data! })
    expect(off.functionName).toBe('allowOrderForwarding')
    expect(off.args).toEqual([false])
    const ex = decodeFunctionData({ abi: escapeAbi, data: calls[1].data! })
    expect(ex.functionName).toBe('execOrders')
    const [descs, revertOnFail] = ex.args as [{ orderDescId: bigint; perpId: bigint; orderType: number; pricePNS: bigint; lotLNS: bigint; immediateOrCancel: boolean }[], boolean]
    expect(revertOnFail).toBe(false)
    expect(descs.map(d => [d.perpId, d.orderType, d.pricePNS, d.lotLNS, d.immediateOrCancel])).toEqual([[64n, 2, 3230n, 200n, true], [32n, 3, 262500n, 5n, true]])
    expect(descs[0].orderDescId).toBe(1_790_000_000_000n)
    expect(descs[1].orderDescId).toBe(1_790_000_000_001n)
    expect(calls[1].gas).toBe(900_000n)
  })

  test('without positions only the forwarding switch goes out, or nothing', () => {
    expect(closeAllCalls([], { forwardingOff: true }).length).toBe(1)
    expect(closeAllCalls([], { forwardingOff: false }).length).toBe(0)
  })
})
