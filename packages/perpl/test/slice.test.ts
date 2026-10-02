import { describe, expect, test } from 'bun:test'
import { nextSlice } from '../src/slice'

// a mon book recorded by the api on oct 2 (books table), testnet is deep
const bids: [number, number][] = [[0.03369, 4104028], [0.03365, 4609378], [0.03361, 4691420], [0.03357, 5433087]]
const asks: [number, number][] = [[0.03373, 4477985], [0.03381, 4165661], [0.03389, 4131716]]
const base = { side: 'long' as const, bids, asks, maxShare: 0.5, minSize: 1 }

describe('nextSlice', () => {
  test('a deep book takes the whole stop in one slice', () => {
    expect(nextSlice({ ...base, left: 200, floor: 0.033 })).toEqual({ size: 200, why: 'ok' })
  })

  test('only depth at or above the floor counts, at most half of it per slice', () => {
    const thin: [number, number][] = [[0.034, 40], [0.0335, 60], [0.033, 1000]]
    // floor 0.0335: depth 100, half is 50
    expect(nextSlice({ ...base, bids: thin, left: 200, floor: 0.0335 })).toEqual({ size: 50, why: 'ok' })
    // floor above every bid: nothing to sell into, hold
    expect(nextSlice({ ...base, bids: thin, left: 200, floor: 0.035 })).toEqual({ size: 0, why: 'book past the floor' })
  })

  test('a short buys back from asks at or below its floor', () => {
    const r = nextSlice({ ...base, side: 'short', left: 300, floor: 0.0338, asks: [[0.0337, 100], [0.0338, 100], [0.034, 9999]] })
    expect(r).toEqual({ size: 100, why: 'ok' })
  })

  test('never more than what is left, never less than one lot, and an empty book holds', () => {
    expect(nextSlice({ ...base, left: 3, floor: 0.033 }).size).toBe(3)
    expect(nextSlice({ ...base, bids: [[0.034, 1]], left: 50, floor: 0.033, minSize: 1 }).size).toBe(1)
    expect(nextSlice({ ...base, bids: [], left: 50, floor: 0.033 }).why).toBe('book past the floor')
    expect(nextSlice({ ...base, left: 0, floor: 0.033 }).why).toBe('nothing left')
  })

  test('slicing a thin book to the end never sells past the position', () => {
    const thin: [number, number][] = [[0.034, 30], [0.0338, 30]]
    let left = 200, sold = 0, slices = 0
    while (left > 0 && slices < 50) {
      const s = nextSlice({ ...base, bids: thin, left, floor: 0.0335 })
      if (!s.size) break
      sold += s.size; left -= s.size; slices++
    }
    expect(sold).toBe(200)
    expect(slices).toBe(7)
  })
})
