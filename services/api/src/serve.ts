// a fetch style handler on node's http server, the shape Bun.serve took. the api moved to node on oct 2:
// bun's websocket client loses perpl's protocol pongs and the trading sessions dropped about once a minute,
// node held 7 sessions for 90s with none (spikes/g10*.ts, STATUS.md)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

type Handler = (req: Request) => Response | Promise<Response>

async function toRequest(req: IncomingMessage, host: string): Promise<Request> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers })
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return new Request(url, { method, headers, body: Buffer.concat(chunks) })
}

async function send(res: ServerResponse, r: Response, cors?: string) {
  res.statusCode = r.status
  r.headers.forEach((v, k) => res.setHeader(k, v))
  if (cors) { res.setHeader('access-control-allow-origin', cors); res.setHeader('vary', 'origin') }
  res.end(Buffer.from(await r.arrayBuffer()))
}

// origins: the sites allowed to call the api from a browser (the web try page, the shared link page)
export function serve(o: { hostname: string; port: number; fetch: Handler; origins?: string[] }) {
  const server = createServer((req, res) => {
    const origin = req.headers.origin
    const cors = origin && o.origins?.includes(origin) ? origin : undefined
    if (req.method === 'OPTIONS') {
      if (cors) {
        res.setHeader('access-control-allow-origin', cors)
        res.setHeader('access-control-allow-methods', 'GET, POST')
        res.setHeader('access-control-allow-headers', 'content-type, authorization')
        res.setHeader('access-control-max-age', '86400')
        res.setHeader('vary', 'origin')
      }
      res.statusCode = cors ? 204 : 403
      res.end()
      return
    }
    toRequest(req, `${o.hostname}:${o.port}`)
      .then(r => o.fetch(r))
      .then(r => send(res, r, cors))
      .catch(e => { console.error('request failed', e instanceof Error ? e.message : e); res.statusCode = 500; res.end('{"error":"server error"}') })
  })
  server.listen(o.port, o.hostname)
  return { port: o.port, close: () => server.close() }
}
