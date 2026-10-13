// browsers have webcrypto already. perpl only lets listed sites read it from a browser, so the web try
// page reads perpl's public market data through the server (deploy/Caddyfile)
import { NETWORKS } from '@pehra/perpl'
import { installSim } from './web/sim'

const api = process.env.EXPO_PUBLIC_API ?? 'http://localhost:8787'
const testnet = NETWORKS.testnet as { rest: string; ws: string }
testnet.rest = `${api}/perpl`
testnet.ws = `${api.replace(/^http/, 'ws')}/perplws`
installSim()

// inside the phone on pehra.io the page gets a drawn status bar and home bar (DemoHost.web), so the
// safe area insets the app already lays out by are faked to their height. the safe area library reads
// them off a div it styles with env(safe-area-inset-*), which a stylesheet rule can outrank
export const framed = typeof window !== 'undefined' && window.top !== window.self
export const FRAME = { top: 34, bottom: 18 }

if (typeof document !== 'undefined') {
  const css = document.createElement('style')
  css.textContent = `
    * { scrollbar-width: none; }
    *::-webkit-scrollbar { display: none; }
    body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
    input, textarea { user-select: text; -webkit-user-select: text; }
    :focus:not(:focus-visible) { outline: none; }
    ${framed ? `body > div[style*="safe-area-inset"] { padding-top: ${FRAME.top}px !important; padding-bottom: ${FRAME.bottom}px !important; }` : ''}
  `
  document.head.appendChild(css)
}
