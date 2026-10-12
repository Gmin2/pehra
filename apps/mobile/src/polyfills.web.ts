// browsers have webcrypto already. perpl only lets listed sites read it from a browser, so the web try
// page reads perpl's public market data through the server (deploy/Caddyfile)
import { NETWORKS } from '@pehra/perpl'

const api = process.env.EXPO_PUBLIC_API ?? 'http://localhost:8787'
const testnet = NETWORKS.testnet as { rest: string; ws: string }
testnet.rest = `${api}/perpl`
testnet.ws = `${api.replace(/^http/, 'ws')}/perplws`
