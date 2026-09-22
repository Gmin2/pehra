import { getRandomValues } from 'expo-crypto'

// hermes has no webcrypto. mera and the scure libs need getRandomValues before they load.
const g = globalThis as any
if (!g.crypto) g.crypto = {}
if (typeof g.crypto.getRandomValues !== 'function') g.crypto.getRandomValues = getRandomValues
