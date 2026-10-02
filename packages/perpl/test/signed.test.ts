import { describe, expect, test } from 'bun:test'
import { canonical } from '../src/signed'

describe('signed rest', () => {
  test('canonical string is six lines, the last the sha256 hex of the body', () => {
    const c = canonical(10143, 'GET', '/v1/trading/orders', '1790927212000', 'abc', '')
    expect(c.split('\n')).toEqual(['10143', 'GET', '/v1/trading/orders', '1790927212000', 'abc', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'])
    const p = canonical(10143, 'POST', '/v1/trading/orders', '1', 'n', '{"a":1}')
    expect(p.split('\n')[5]).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862')
  })
})
