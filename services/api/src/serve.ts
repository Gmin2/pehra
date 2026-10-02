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

async function send(res: ServerResponse, r: Response) {
  res.statusCode = r.status
  r.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await r.arrayBuffer()))
}

export function serve(o: { hostname: string; port: number; fetch: Handler }) {
  const server = createServer((req, res) => {
    toRequest(req, `${o.hostname}:${o.port}`)
      .then(r => o.fetch(r))
      .then(r => send(res, r))
      .catch(e => { console.error('request failed', e instanceof Error ? e.message : e); res.statusCode = 500; res.end('{"error":"server error"}') })
  })
  server.listen(o.port, o.hostname)
  return { port: o.port, close: () => server.close() }
}
