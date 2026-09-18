import { NativeNbdServer } from './browser-media-nbd.mjs'
import { readFileSync } from 'node:fs'
import { registerBrowserMediaRest } from './browser-media-rest.mjs'
import { randomBytes } from 'node:crypto'
import { WebSocketServer } from 'ws'

const PREFIX = '/api/browser-media/'
const MAX_READ = 1024 * 1024
const token = () => randomBytes(32).toString('hex')

// Session capabilities are deliberately separate: a host cannot impersonate the browser.
export class BrowserMedia {
  sessions = new Map()

  constructor({ timeout = 30000, transport = 'http' } = {}) {
    this.transport = transport
    this.timeout = timeout
    this.webSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_READ + 4, perMessageDeflate: false })
    this.timer = setInterval(
      () => {
        for (const session of this.sessions.values()) {
          if (session.expires < Date.now()) this.close(session)
          else if (session.socket !== undefined) session.socket.ping()
        }
      },
      Math.min(timeout, 15000)
    ).unref()
  }

  create({ owner, vm, name, size }) {
    if (!Number.isSafeInteger(size) || size < 32768 || size % 512 !== 0 || size > 128 * 1024 ** 3) {
      throw new Error('Select a sector-aligned ISO between 32 KiB and 128 GiB')
    }
    if (this.sessions.size >= 16) throw new Error('Too many virtual media sessions')
    const session = {
      id: token(),
      browserToken: token(),
      readToken: token(),
      owner,
      vm,
      name,
      size,
      pending: new Map(),
      pairs: new Map(),
      nextId: 0,
      expires: Date.now() + this.timeout,
      closed: false,
    }
    this.sessions.set(session.id, session)
    return session
  }

  get(id, owner) {
    const session = this.sessions.get(id)
    if (session === undefined || session.owner !== owner || session.closed) throw new Error('Media session unavailable')
    return session
  }

  close(session) {
    if (session.closed) return
    session.closed = true
    this.sessions.delete(session.id)
    session.socket?.terminate()
    for (const pair of session.pairs.values()) pair.close()
    for (const pending of session.pending.values()) pending.reject(new Error('Media disconnected'))
    session.pending.clear()
    // The attachment layer owns asynchronous XAPI cleanup and retries.
    session.onClose?.()
  }

  upgrade(req, socket, head) {
    if (!req.url.startsWith(PREFIX)) return
    if (this.transport !== 'http' && this.upgradeNbd(req, socket, head)) return
    const session = [...this.sessions.values()].find(s => req.url === `${PREFIX}${s.browserToken}/socket`)
    // Browser capability is one-use; reject cross-origin browser upgrades too.
    let sameOrigin = true
    try {
      sameOrigin = req.headers.origin === undefined || new URL(req.headers.origin).host === req.headers.host
    } catch (_) {
      sameOrigin = false
    }
    if (session === undefined || session.socket !== undefined || !sameOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    this.webSockets.handleUpgrade(req, socket, head, ws => {
      session.socket = ws
      session.expires = Date.now() + this.timeout
      ws.on('pong', () => {
        session.expires = Date.now() + this.timeout
      })
      ws.on('error', () => this.close(session))
      ws.on('close', () => this.close(session))
      ws.on('message', (data, binary) => {
        if (this.transport !== 'http') return this.close(session)
        if (!binary || data.length < 4) return this.close(session)
        const id = data.readUInt32BE(0)
        const pending = session.pending.get(id)
        if (pending === undefined || data.length !== pending.length + 4) return this.close(session)
        pending.resolve(data.subarray(4))
      })
      ws.send(JSON.stringify({ ready: true }))
    })
  }

  // One independent NBD byte stream per host connection. No disk protocol
  // parsing in XO: capabilities and lifetime are the relay's only concerns.
  upgradeNbd(req, socket, head) {
    const hostSession = [...this.sessions.values()].find(s => req.url === `${PREFIX}${s.readToken}/nbd`)
    if (hostSession !== undefined) {
      if (hostSession.socket?.readyState !== 1 || hostSession.pairs.size >= 8) {
        socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
        return true
      }
      this.webSockets.handleUpgrade(req, socket, head, host => {
        this.pairNbd(hostSession, host)
      })
      return true
    }
    for (const session of this.sessions.values()) {
      const prefix = `${PREFIX}${session.browserToken}/nbd/`
      if (!req.url.startsWith(prefix)) continue
      const pair = session.pairs.get(req.url.slice(prefix.length))
      let sameOrigin = false
      try {
        sameOrigin = req.headers.origin === undefined || new URL(req.headers.origin).host === req.headers.host
      } catch (_) {}
      if (pair === undefined || pair.producer !== undefined || !sameOrigin) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        return true
      }
      this.webSockets.handleUpgrade(req, socket, head, producer => {
        clearTimeout(pair.timer)
        pair.producer = producer
        producer.on('error', pair.close).on('close', pair.close)
        producer.on('message', (data, binary) => {
          if (!binary) return pair.close()
          this.forwardNbd(pair, producer, pair.host, data)
        })
      })
      return true
    }
    return false
  }

  pairNbd(hostSession, host) {
    const id = token()
    const pair = { host, producer: undefined, closed: false }
    pair.close = () => {
      if (pair.closed) return
      pair.closed = true
      clearTimeout(pair.timer)
      hostSession.pairs.delete(id)
      host.terminate()
      pair.producer?.terminate()
    }
    pair.timer = setTimeout(pair.close, this.timeout).unref()
    hostSession.pairs.set(id, pair)
    host.on('error', pair.close).on('close', pair.close)
    // The NBD server speaks first, so host data before pairing is invalid.
    host.on('message', (data, binary) => {
      if (!binary || pair.producer?.readyState !== 1) return pair.close()
      this.forwardNbd(pair, host, pair.producer, data)
    })
    hostSession.socket.send(JSON.stringify({ openNbd: `${PREFIX}${hostSession.browserToken}/nbd/${id}` }))
  }

  forwardNbd(pair, source, target, data) {
    // Stop receiving until this frame is flushed. Bound slow-peer buffering
    // and tear down a stalled stream without affecting another host's stream.
    if (target.readyState !== 1 || target.bufferedAmount > 4 * MAX_READ) return pair.close()
    source.pause()
    const timer = setTimeout(pair.close, this.timeout).unref()
    target.send(data, { binary: true }, error => {
      clearTimeout(timer)
      if (error) pair.close()
      else if (!pair.closed) source.resume()
    })
  }

  read(session, offset, length) {
    if (session.closed || session.socket?.readyState !== 1) return Promise.reject(new Error('Media disconnected'))
    if (session.pending.size >= 16) return Promise.reject(new Error('Too many outstanding reads'))
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length < 1 ||
      length > MAX_READ ||
      offset + length > session.size
    )
      return Promise.reject(new Error('Invalid read'))
    const id = session.nextId++ >>> 0
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(session), this.timeout)
      const finish = fn => value => {
        clearTimeout(timer)
        session.pending.delete(id)
        fn(value)
      }
      session.pending.set(id, { length, resolve: finish(resolve), reject: finish(reject) })
      session.socket.send(JSON.stringify({ id, offset, length }), error => {
        if (error) this.close(session)
      })
    })
  }

  async http(req, res, next) {
    if (!req.url.startsWith(PREFIX)) return next()
    if (this.transport !== 'http') return res.writeHead(404).end()
    const session = [...this.sessions.values()].find(s => req.url === `${PREFIX}${s.readToken}/iso`)
    if (session === undefined) {
      res.writeHead(404).end()
      return
    }
    if (session.socket?.readyState !== 1) {
      res.writeHead(503).end()
      return
    }
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store, no-transform',
      'Content-Length': session.size,
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, headers).end()
      return
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
    const start = Number(match?.[1])
    const requestedEnd = match?.[2] === '' ? session.size - 1 : Number(match?.[2])
    const end = Math.min(requestedEnd, session.size - 1)
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(requestedEnd) ||
      start < 0 ||
      end < start ||
      start >= session.size
    ) {
      res.writeHead(416, { 'Content-Range': `bytes */${session.size}` }).end()
      return
    }
    try {
      // Bound memory even when the NBD client requests a large range.
      for (let offset = start; offset <= end && !res.destroyed; ) {
        const length = Math.min(MAX_READ, end - offset + 1)
        const data = await this.read(session, offset, length)
        if (res.destroyed) return
        if (!res.headersSent)
          res.writeHead(206, {
            ...headers,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${session.size}`,
          })
        if (!res.write(data))
          await new Promise(resolve => {
            const done = () => {
              res.off('drain', done)
              res.off('close', done)
              resolve()
            }
            res.once('drain', done).once('close', done)
          })
        offset += length
      }
      res.end()
    } catch (_) {
      if (res.headersSent) res.destroy()
      else res.writeHead(503).end()
    }
  }

  stop() {
    this.nativeNbd?.stop()
    clearInterval(this.timer)
    for (const session of this.sessions.values()) this.close(session)
    this.webSockets.close()
  }
}

export function installBrowserMedia(webServer, express, xo) {
  // Explicit opt-in until host integration has been validated on supported releases.
  if (process.env.XO_BROWSER_MEDIA_ORIGIN === undefined) return
  const origin = new URL(process.env.XO_BROWSER_MEDIA_ORIGIN)
  const allowHttp = process.env.XO_BROWSER_MEDIA_ALLOW_HTTP === '1'
  if (
    (origin.protocol !== 'https:' && !(allowHttp && origin.protocol === 'http:')) ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error('XO_BROWSER_MEDIA_ORIGIN must be the HTTPS origin reachable by hosts')
  }
  const transport = process.env.XO_BROWSER_MEDIA_TRANSPORT ?? 'http'
  if (!['http', 'nbd-ws', 'nbd-client'].includes(transport)) throw new Error('Invalid browser media transport')
  const media = new BrowserMedia({ transport })
  media.origin = origin.origin
  if (transport === 'nbd-client') {
    const port = Number(process.env.XO_BROWSER_MEDIA_NBD_PORT ?? 10809)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid browser NBD port')
    const allowPlaintext = process.env.XO_BROWSER_MEDIA_NBD_ALLOW_PLAINTEXT === '1'
    const keyPath = process.env.XO_BROWSER_MEDIA_NBD_TLS_KEY
    const certPath = process.env.XO_BROWSER_MEDIA_NBD_TLS_CERT
    if (!allowPlaintext && (!keyPath || !certPath)) throw new Error('Native browser NBD requires TLS key/certificate')
    media.nbdConfig = {
      host: origin.hostname,
      port: String(port),
      ...(allowPlaintext ? { allow_plaintext: 'true' } : {}),
    }
    if (process.env.XO_BROWSER_MEDIA_NBD_CA_FILE) media.nbdConfig.ca_file = process.env.XO_BROWSER_MEDIA_NBD_CA_FILE
    media.nativeNbd = new NativeNbdServer(media, {
      allowPlaintext,
      tls: keyPath && certPath ? { key: readFileSync(keyPath), cert: readFileSync(certPath) } : undefined,
    })
    media.nativeNbd.listen(port, process.env.XO_BROWSER_MEDIA_NBD_BIND ?? '0.0.0.0')
  }
  xo.defineProperty('browserMedia', media)
  const unregisterRest = registerBrowserMediaRest(xo)
  xo.hooks.on('stop', unregisterRest)
  express.use((req, res, next) => media.http(req, res, next))
  webServer.on('upgrade', (req, socket, head) => media.upgrade(req, socket, head))
  xo.hooks.on('stop', () => media.stop())
}
