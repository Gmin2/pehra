import { getRandomValues } from 'expo-crypto'

// hermes has no webcrypto. mera and the scure libs need getRandomValues before they load.
// hermes has no webcrypto, viem and noble only need getRandomValues
const g = globalThis as { crypto?: { getRandomValues?: unknown } }
if (!g.crypto) g.crypto = {}
if (typeof g.crypto.getRandomValues !== 'function') g.crypto.getRandomValues = getRandomValues
