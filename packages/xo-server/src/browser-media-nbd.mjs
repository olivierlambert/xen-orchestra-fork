import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:net'
import { createSecureContext, TLSSocket } from 'node:tls'

const MAGIC = 0x49484156454f5054n
const FLAGS = 3 // HAS_FLAGS | READ_ONLY
const MAX_READ = 32 * 1024 * 1024

async function read(socket, size) {
  while (true) {
    const bytes = socket.read(size)
    if (bytes !== null) return bytes
    if (socket.destroyed || socket.readableEnded) throw new Error('NBD disconnected')
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off('readable', ready).off('close', close).off('end', close).off('error', error)
      }
      const ready = () => {
        cleanup()
        resolve()
      }
      const close = () => {
        cleanup()
        reject(new Error('NBD disconnected'))
      }
      const error = err => {
        cleanup()
        reject(err)
      }
      socket.once('readable', ready).once('close', close).once('end', close).once('error', error)
    })
  }
}

function optionReply(socket, option, type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(20)
  header.writeBigUInt64BE(0x3e889045565a9n)
  header.writeUInt32BE(option, 8)
  header.writeUInt32BE(type, 12)
  header.writeUInt32BE(payload.length, 16)
  socket.write(Buffer.concat([header, payload]))
}

// The browser still speaks oldstyle NBD. Only negotiation terminates in XO;
// transmission requests/replies are forwarded without parsing disk operations.
class BrowserStream extends EventEmitter {
  readyState = 1
  hello = Buffer.alloc(0)
  constructor(socket, size) {
    super()
    this.socket = socket
    this.size = size
    socket.once('close', () => this.terminate())
    socket.on('error', () => this.terminate())
  }
  get bufferedAmount() {
    return this.socket.writableLength
  }
  pause() {
    this.socket.pause()
  }
  resume() {
    if (this.started) this.socket.resume()
  }
  terminate() {
    if (this.readyState !== 1) return
    this.readyState = 3
    this.socket.destroy()
    this.emit('close')
  }
  send(data, options, done) {
    if (this.hello.length < 152) {
      this.hello = Buffer.concat([this.hello, data])
      if (
        this.hello.length > 152 ||
        (this.hello.length === 152 &&
          (this.hello.readBigUInt64BE() !== 0x4e42444d41474943n ||
            this.hello.readBigUInt64BE(8) !== 0x420281861253n ||
            this.hello.readBigUInt64BE(16) !== BigInt(this.size) ||
            (this.hello.readUInt32BE(24) & FLAGS) !== FLAGS))
      ) {
        this.terminate()
        done(new Error('Invalid browser NBD export'))
        return
      }
      if (this.hello.length === 152) this.emit('ready')
      done()
    } else {
      this.socket.write(data, done)
    }
  }
  start() {
    this.started = true
    // Bound request fragments even when TCP coalesces a full client queue.
    this.socket.on('data', data => {
      for (let offset = 0; offset < data.length && this.readyState === 1; offset += 1024) {
        this.emit('message', data.subarray(offset, offset + 1024), true)
      }
    })
    this.socket.resume()
  }
}

export class NativeNbdServer {
  connections = new Set()
  constructor(media, { tls, allowPlaintext = false, timeout = 30000 } = {}) {
    if (!tls && !allowPlaintext) throw new Error('NBD requires TLS')
    this.media = media
    this.allowPlaintext = allowPlaintext
    this.secureContext = tls && createSecureContext(tls)
    this.server = createServer(socket => {
      if (this.connections.size >= 64) return socket.destroy()
      const state = { socket }
      this.connections.add(state)
      socket.setNoDelay(true)
      socket.on('error', () => {})
      socket.once('close', () => this.connections.delete(state))
      const timer = setTimeout(() => state.socket.destroy(), timeout).unref()
      this.negotiate(state)
        .catch(() => state.socket.destroy())
        .finally(() => clearTimeout(timer))
    })
  }
  listen(port, host) {
    return this.server.listen(port, host)
  }
  stop() {
    for (const state of this.connections) state.socket.destroy()
    this.server.close()
  }
  async negotiate(state) {
    let socket = state.socket
    const hello = Buffer.alloc(18)
    hello.write('NBDMAGIC')
    hello.writeBigUInt64BE(MAGIC, 8)
    hello.writeUInt16BE(3, 16) // FIXED_NEWSTYLE | NO_ZEROES
    socket.write(hello)
    const flags = (await read(socket, 4)).readUInt32BE()
    if (!(flags & 1) || flags & ~3) throw new Error('Invalid NBD client flags')
    let encrypted = false
    for (let count = 0; count < 64; count++) {
      const header = await read(socket, 16)
      if (header.readBigUInt64BE() !== MAGIC) throw new Error('Invalid NBD option magic')
      const option = header.readUInt32BE(8)
      const length = header.readUInt32BE(12)
      if (length > 4096) throw new Error('NBD option too large')
      const data = length === 0 ? Buffer.alloc(0) : await read(socket, length)
      if (option === 2) {
        optionReply(socket, option, 1)
        socket.end()
        return
      } // ABORT
      if (option === 5) {
        // STARTTLS, before any session capability is accepted
        if (length || encrypted || !this.secureContext) {
          optionReply(socket, option, 0x80000001)
          continue
        }
        if (socket.readableLength !== 0) throw new Error('Pipelined plaintext across STARTTLS')
        optionReply(socket, option, 1)
        socket = state.socket = new TLSSocket(socket, { isServer: true, secureContext: this.secureContext })
        socket.on('error', () => {})
        await once(socket, 'secure')
        encrypted = true
        continue
      }
      if (!encrypted && !this.allowPlaintext) {
        optionReply(socket, option, 0x80000005)
        continue
      }
      if (![1, 6, 7].includes(option)) {
        optionReply(socket, option, 0x80000001)
        continue
      }
      let name = data
      if (option !== 1) {
        if (length < 6) throw new Error('Invalid NBD export info')
        const nameLength = data.readUInt32BE()
        if (nameLength > length - 6 || 6 + nameLength + 2 * data.readUInt16BE(4 + nameLength) !== length) {
          throw new Error('Invalid NBD export info length')
        }
        name = data.subarray(4, 4 + nameLength)
      }
      const session = [...this.media.sessions.values()].find(s => Buffer.from(s.readToken).equals(name))
      if (!session || session.closed || session.socket?.readyState !== 1 || session.pairs.size >= 8) {
        if (option === 1) throw new Error('Export unavailable')
        optionReply(socket, option, 0x80000006)
        continue
      }
      let bridge
      if (option !== 6) {
        bridge = new BrowserStream(socket, session.size)
        const ready = new Promise((resolve, reject) => {
          bridge.once('ready', resolve)
          bridge.once('close', () => reject(new Error('Browser disconnected during negotiation')))
        })
        this.media.pairNbd(session, bridge)
        await ready
      }
      const info = Buffer.alloc(12)
      info.writeBigUInt64BE(BigInt(session.size), 2)
      info.writeUInt16BE(FLAGS, 10)
      if (option === 1) {
        socket.write(Buffer.concat([info.subarray(2), Buffer.alloc(flags & 2 ? 0 : 124)]))
      } else {
        optionReply(socket, option, 3, info) // NBD_INFO_EXPORT
        const blocks = Buffer.alloc(14)
        blocks.writeUInt16BE(3)
        blocks.writeUInt32BE(1, 2)
        blocks.writeUInt32BE(512, 6)
        blocks.writeUInt32BE(MAX_READ, 10)
        optionReply(socket, option, 3, blocks)
        optionReply(socket, option, 1)
      }
      if (bridge) {
        bridge.start()
        return
      }
    }
    throw new Error('Too many NBD options')
  }
}
