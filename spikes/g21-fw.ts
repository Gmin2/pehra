// g21: read forwarding for the dev account (679) with its guard key, no secrets printed
import { readFileSync } from 'node:fs'
import { restWallet } from '../packages/perpl/src/index'
type Stored = { address: string; key: { apiKey: string; secret: `0x${string}` } }
const k = (JSON.parse(readFileSync('../services/api/data/guard-keys.json', 'utf8')) as Stored[]).find(s => s.address.toLowerCase().startsWith('0xa8741e'))!
const w = await restWallet({ apiKey: k.key.apiKey, secret: k.key.secret })
console.log('account', w.as[0]?.id, 'forwarding (fw)', w.as[0]?.fw)
