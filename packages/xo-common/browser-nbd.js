'use strict'

/* eslint-env browser */
/* eslint-disable n/no-unsupported-features/es-syntax, n/no-unsupported-features/node-builtins */
// Browser-only entry point; the package's legacy Node minimum does not apply.
// Minimal read-only NBD server for a tab-owned File. Oldstyle negotiation is
// intentional: the spike's client is tapdisk, which supports this handshake.
// WebSocket frames are transport fragments, never NBD message boundaries.
function serveBrowserNbd(file, socket) {
  socket.binaryType = 'arraybuffer'
  let input = new Uint8Array(0)
  const requests = []
  let running = false
  let closed = false
  const stop = () => {
    closed = true
    requests.length = 0
    socket.close()
  }
  socket.addEventListener('close', () => {
    closed = true
    requests.length = 0
  })
  socket.addEventListener('error', stop)
  const send = async bytes => {
    const deadline = Date.now() + 30000
    while (socket.bufferedAmount > 4 * 1024 * 1024) {
      if (closed || Date.now() > deadline) throw new Error('NBD reader stalled')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    if (closed || socket.readyState !== 1) throw new Error('NBD disconnected')
    socket.send(bytes)
  }
  const run = async () => {
    if (running) return
    running = true
    try {
      while (requests.length !== 0) {
        if (closed) return
        const request = requests.shift()
        const view = new DataView(request.buffer, request.byteOffset, request.byteLength)
        const command = view.getUint32(4)
        if (command === 2) return stop() // NBD_CMD_DISC has no reply.
        // A write includes a payload. Never parse it as subsequent requests.
        if ((command & 0xffff) === 1) throw new Error('Read-only NBD export')
        const offset = view.getUint32(16) * 0x100000000 + view.getUint32(20)
        const length = view.getUint32(24)
        const valid =
          command === 0 &&
          Number.isSafeInteger(offset) &&
          length > 0 &&
          length <= 32 * 1024 * 1024 &&
          offset + length <= file.size
        const reply = new Uint8Array(16)
        const header = new DataView(reply.buffer)
        header.setUint32(0, 0x67446698)
        header.setUint32(4, valid ? 0 : 22) // EINVAL
        reply.set(request.subarray(8, 16), 8) // opaque request cookie
        await send(reply)
        if (!valid) continue
        for (let position = offset; position < offset + length; ) {
          if (closed) return
          const end = Math.min(position + 1024 * 1024, offset + length)
          const data = await file.slice(position, end).arrayBuffer()
          if (data.byteLength !== end - position) throw new Error('Short media read')
          await send(data)
          position = end
        }
      }
    } catch (_) {
      stop()
    } finally {
      // Only this runner clears the guard acquired before its first await.
      // eslint-disable-next-line require-atomic-updates
      running = false
    }
  }
  socket.addEventListener('message', ({ data }) => {
    if (closed) return
    if (!(data instanceof ArrayBuffer) || input.length + data.byteLength > 28 * 128) return stop()
    const merged = new Uint8Array(input.length + data.byteLength)
    merged.set(input)
    merged.set(new Uint8Array(data), input.length)
    input = merged
    while (input.length >= 28) {
      if (new DataView(input.buffer, input.byteOffset).getUint32(0) !== 0x25609513 || requests.length >= 128)
        return stop()
      requests.push(input.slice(0, 28))
      input = input.slice(28)
    }
    run()
  })
  socket.addEventListener('open', () => {
    const hello = new Uint8Array(152)
    const view = new DataView(hello.buffer)
    hello.set(new TextEncoder().encode('NBDMAGIC'))
    view.setUint32(8, 0x00004202)
    view.setUint32(12, 0x81861253)
    view.setUint32(16, Math.floor(file.size / 0x100000000))
    view.setUint32(20, file.size >>> 0)
    view.setUint32(24, 3) // HAS_FLAGS | READ_ONLY
    send(hello).catch(stop)
  })
  return stop
}

// The control socket is tab-owned; every requested stream gets its own NBD
// handshake and request queue. Navigation within the SPA keeps them alive.
function openBrowserNbd(file, control, path) {
  const url = new URL(path, control.url)
  if (url.origin !== new URL(control.url).origin || !url.pathname.startsWith('/api/browser-media/')) {
    throw new Error('Invalid NBD relay URL')
  }
  const socket = new WebSocket(url)
  const stop = serveBrowserNbd(file, socket)
  control.addEventListener('close', stop, { once: true })
  socket.addEventListener('close', () => control.removeEventListener('close', stop), { once: true })
}

exports.serveBrowserNbd = serveBrowserNbd
exports.openBrowserNbd = openBrowserNbd

/* eslint-enable n/no-unsupported-features/es-syntax, n/no-unsupported-features/node-builtins */
