import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect as connectTls } from 'node:tls'
import { test } from 'node:test'
import { readChunkStrict } from '@vates/read-chunk'
import WebSocket from 'ws'
import { BrowserMedia } from './browser-media.mjs'
import { NativeNbdServer } from './browser-media-nbd.mjs'
import { serveBrowserNbd } from '../../xo-common/browser-nbd.js'

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'browser-nbd-test-'))
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(dir, 'key'),
      '-out',
      join(dir, 'cert'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' }
  )
  const cert = readFileSync(join(dir, 'cert'))
  const media = new BrowserMedia({ transport: 'nbd-client' })
  const native = (media.nativeNbd = new NativeNbdServer(media, { tls: { cert, key: readFileSync(join(dir, 'key')) } }))
  native.listen(0, '127.0.0.1')
  await once(native.server, 'listening')
  const http = createServer()
  http.on('upgrade', (req, socket, head) => media.upgrade(req, socket, head))
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const base = `ws://127.0.0.1:${http.address().port}`
  const bytes = Buffer.alloc(4 * 1024 * 1024)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  const session = media.create({ owner: 'admin', vm: 'test', name: 'test.iso', size: bytes.length })
  const control = new WebSocket(`${base}/api/browser-media/${session.browserToken}/socket`)
  control.on('message', data => {
    const msg = JSON.parse(data)
    if (msg.openNbd) serveBrowserNbd(new Blob([bytes]), new WebSocket(base + msg.openNbd))
  })
  await once(control, 'message')
  t.after(async () => {
    media.stop()
    control.terminate()
    await new Promise(resolve => http.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  })
  const open = async (tls = true) => {
    let socket = connect(native.server.address().port, '127.0.0.1')
    socket.on('error', () => {})
    const greeting = await readChunkStrict(socket, 18)
    assert.equal(greeting.subarray(0, 8).toString(), 'NBDMAGIC')
    socket.write(Buffer.from([0, 0, 0, 3]))
    if (tls) {
      option(socket, 5)
      assert.equal((await reply(socket)).type, 1)
      socket = connectTls({ socket, ca: cert, servername: 'localhost' })
      await once(socket, 'secureConnect')
      assert.equal(socket.authorized, true)
    }
    t.after(() => socket.destroy())
    return socket
  }
  return { session, bytes, control, open }
}
function option(socket, op, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(16)
  header.writeBigUInt64BE(0x49484156454f5054n)
  header.writeUInt32BE(op, 8)
  header.writeUInt32BE(data.length, 12)
  socket.write(Buffer.concat([header, data]))
}
async function reply(socket) {
  const header = await readChunkStrict(socket, 20)
  assert.equal(header.readBigUInt64BE(), 0x3e889045565a9n)
  const length = header.readUInt32BE(16)
  return { type: header.readUInt32BE(12), data: length ? await readChunkStrict(socket, length) : Buffer.alloc(0) }
}
function infoName(name) {
  const bytes = Buffer.from(name)
  const result = Buffer.alloc(6 + bytes.length)
  result.writeUInt32BE(bytes.length)
  bytes.copy(result, 4)
  return result
}
async function go(socket, name) {
  option(socket, 7, infoName(name))
  const info = await reply(socket)
  assert.equal(info.type, 3)
  assert.equal((await reply(socket)).type, 3)
  assert.equal((await reply(socket)).type, 1)
}
function request(offset, length) {
  const req = Buffer.alloc(28)
  req.writeUInt32BE(0x25609513)
  req.writeBigUInt64BE(99n, 8)
  req.writeBigUInt64BE(BigInt(offset), 16)
  req.writeUInt32BE(length, 24)
  return req
}
test('native NBD requires TLS and rejects unknown exports without opening browser streams', async t => {
  const { open, session } = await fixture(t)
  const plain = await open(false)
  option(plain, 7, infoName(session.readToken))
  assert.equal((await reply(plain)).type, 0x80000005)
  const secure = await open()
  option(secure, 7, infoName('invalid'))
  assert.equal((await reply(secure)).type, 0x80000006)
  assert.equal(session.pairs.size, 0)
})
test('native NBD GO reads exact browser bytes over verified TLS and isolates connections', async t => {
  const { open, session, bytes, control } = await fixture(t)
  const [a, b] = await Promise.all([open(), open()])
  await Promise.all([go(a, session.readToken), go(b, session.readToken)])
  a.write(request(512, 2 * 1024 * 1024))
  const header = await readChunkStrict(a, 16)
  assert.equal(header.readUInt32BE(4), 0)
  assert.deepEqual(await readChunkStrict(a, 2 * 1024 * 1024), bytes.subarray(512, 512 + 2 * 1024 * 1024))
  a.destroy()
  b.write(request(bytes.length - 512, 512))
  await readChunkStrict(b, 16)
  assert.deepEqual(await readChunkStrict(b, 512), bytes.subarray(-512))
  const closed = once(b, 'close')
  control.close()
  await closed
})
test('native INFO does not allocate a stream; EXPORT_NAME remains compatible', async t => {
  const { open, session, bytes } = await fixture(t)
  const socket = await open()
  option(socket, 6, infoName(session.readToken))
  assert.equal((await reply(socket)).data.readBigUInt64BE(2), BigInt(bytes.length))
  await reply(socket)
  await reply(socket)
  assert.equal(session.pairs.size, 0)
  option(socket, 1, Buffer.from(session.readToken))
  const info = await readChunkStrict(socket, 10)
  assert.equal(info.readBigUInt64BE(), BigInt(bytes.length))
  assert.equal(info.readUInt16BE(8), 3)
  socket.write(request(bytes.length, 512))
  assert.equal((await readChunkStrict(socket, 16)).readUInt32BE(4), 22)
})
