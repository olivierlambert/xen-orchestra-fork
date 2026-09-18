import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import WebSocket from 'ws'
import { BrowserMedia } from './browser-media.mjs'
import { serveBrowserNbd } from '../../xo-common/browser-nbd.js'

async function fixture(t) {
  const media = new BrowserMedia({ transport: 'nbd-ws', timeout: 1000 })
  const server = createServer()
  server.on('upgrade', (req, socket, head) => media.upgrade(req, socket, head))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `ws://127.0.0.1:${server.address().port}`
  const bytes = Buffer.alloc(4 * 1024 * 1024)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  const file = new Blob([bytes])
  const session = media.create({ owner: 'admin', vm: 'vm', name: 'test.iso', size: file.size })
  const control = new WebSocket(`${base}/api/browser-media/${session.browserToken}/socket`)
  control.on('message', data => {
    const message = JSON.parse(data)
    if (message.openNbd) serveBrowserNbd(file, new WebSocket(base + message.openNbd))
  })
  await once(control, 'message')
  t.after(async () => {
    media.stop()
    control.terminate()
    await new Promise(resolve => server.close(resolve))
  })
  const connect = async () => {
    const socket = new WebSocket(`${base}/api/browser-media/${session.readToken}/nbd`)
    const hello = (await once(socket, 'message'))[0]
    assert.equal(hello.length, 152)
    assert.equal(hello.readBigUInt64BE(8), 0x420281861253n)
    assert.equal(Number(hello.readBigUInt64BE(16)), file.size)
    assert.equal(hello.readUInt32BE(24), 3)
    return socket
  }
  return { media, session, control, connect, bytes, base }
}
function request(offset, length, cookie = 42n, command = 0) {
  const data = Buffer.alloc(28)
  data.writeUInt32BE(0x25609513)
  data.writeUInt32BE(command, 4)
  data.writeBigUInt64BE(cookie, 8)
  data.writeBigUInt64BE(BigInt(offset), 16)
  data.writeUInt32BE(length, 24)
  return data
}
function receive(socket, length) {
  return new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0)
    const close = () => {
      cleanup()
      reject(new Error('Premature EOF'))
    }
    const message = chunk => {
      bytes = Buffer.concat([bytes, chunk])
      if (bytes.length >= length) {
        cleanup()
        resolve(bytes)
      }
    }
    const cleanup = () => {
      socket.off('message', message)
      socket.off('close', close)
    }
    socket.on('message', message).once('close', close)
  })
}
test('NBD through both WebSocket legs: fragmented requests, chunked replies, exact bytes', async t => {
  const { connect, bytes } = await fixture(t)
  const socket = await connect()
  const length = 3 * 1024 * 1024
  const received = receive(socket, 16 + length)
  const req = request(512, length)
  socket.send(req.subarray(0, 7))
  socket.send(req.subarray(7))
  const reply = await received
  assert.equal(reply.readUInt32BE(0), 0x67446698)
  assert.equal(reply.readUInt32BE(4), 0)
  assert.equal(reply.readBigUInt64BE(8), 42n)
  assert.deepEqual(reply.subarray(16), bytes.subarray(512, 512 + length))
  socket.close()
})
test('independent host sessions, coalesced requests and reconnect without revoking source', async t => {
  const { connect, bytes, session } = await fixture(t)
  const [a, b] = await Promise.all([connect(), connect()])
  const result = receive(a, 2 * (16 + 512))
  a.send(Buffer.concat([request(0, 512, 1n), request(1024, 512, 2n)]))
  const replies = await result
  assert.deepEqual(replies.subarray(16, 528), bytes.subarray(0, 512))
  assert.deepEqual(replies.subarray(544), bytes.subarray(1024, 1536))
  a.send(request(0, 0, 0n, 2))
  await once(a, 'close')
  assert.equal(session.closed, false)
  const other = receive(b, 528)
  b.send(request(2048, 512))
  assert.deepEqual((await other).subarray(16), bytes.subarray(2048, 2560))
  ;(await connect()).close()
  b.close()
})
test('EOF returns EINVAL; writes fail closed; tab loss revokes every stream', async t => {
  const { connect, bytes, control, session } = await fixture(t)
  const a = await connect()
  const reply = receive(a, 16)
  a.send(request(bytes.length - 512, 1024))
  assert.equal((await reply).readUInt32BE(4), 22)
  a.send(request(0, 512, 1n, 1))
  await once(a, 'close')
  const b = await connect()
  control.close()
  await once(b, 'close')
  assert.equal(session.closed, true)
})
test('host capability cannot become a browser producer', async t => {
  const { base, session } = await fixture(t)
  const bad = new WebSocket(`${base}/api/browser-media/${session.readToken}/socket`)
  bad.on('error', () => {})
  const [, response] = await once(bad, 'unexpected-response')
  assert.equal(response.statusCode, 403)
  bad.terminate()
})
