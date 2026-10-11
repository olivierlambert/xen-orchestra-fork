// Minimal client for the XO REST API, reached on the same origin (proxied by vite in development).
//
// The session token travels in the `Authorization` header, never in the cookies of XO: XO 5 and XO 6 may be served
// on the same address, a portal session must not replace the session of an administrator (and the other way round).

const BASE_URL = '/rest/v0'
const SESSION_KEY = 'xo-portal-session'
// the console proxy of xo-server only reads the `token` cookie: set for the consoles path while a console is open
const CONSOLE_COOKIE = 'token'
const CONSOLE_PATH = '/api/consoles/'

function readSession(): string | undefined {
  try {
    return localStorage.getItem(SESSION_KEY) ?? undefined
  } catch {
    return undefined
  }
}

let memorySession = readSession()
const sessionToken = () => memorySession ?? readSession()

function writeSession(token: string | undefined) {
  try {
    if (token === undefined) {
      localStorage.removeItem(SESSION_KEY)
    } else {
      localStorage.setItem(SESSION_KEY, token)
    }
  } catch {
    // storage unavailable (private mode of some browsers): the session lasts as long as the page
  }
  memorySession = token
}

export class XoApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
  }
}

async function request<T>(
  method: string,
  path: string,
  { body, headers }: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: {
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(sessionToken() !== undefined && { authorization: `Bearer ${sessionToken()}` }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // the cookies of XO are ignored by the server when the header is present, they are not needed at all
    credentials: 'omit',
  })

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  const payload = isJson ? await response.json() : undefined

  if (!response.ok) {
    // XO errors carry the reason of forbidden operations in `data`
    const reason = payload?.data?.reason ?? payload?.data?.data?.reason ?? payload?.error ?? response.statusText
    throw new XoApiError(response.status, String(reason), payload)
  }

  if (!isJson && response.status !== 204 && response.status !== 202) {
    throw new XoApiError(response.status, 'Unexpected response, is this a Xen Orchestra server?')
  }

  return payload as T
}

export const xo = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

/** Complex-matcher filter matching objects owned by a project, see the tenant model in xo-server */
export const projectFilter = (projectId: string) =>
  encodeURIComponent(`$project:/^${projectId.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$/`)

export const hasSession = () => sessionToken() !== undefined

/** Forgets the session, e.g. a token expired or revoked */
export function clearSession() {
  writeSession(undefined)
  setConsoleCookie(undefined)
}

/** `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost), not on a plain HTTP address */
function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function login(username: string, password: string) {
  clearSession()
  const { token } = await request<{ token: { id: string; expiration: number } }>(
    'POST',
    '/users/me/authentication_tokens',
    {
      // one token per sign-in: XO reuses the token of a client, a session would then outlive its logout
      body: {
        client: { id: `cloud-portal-${randomId()}` },
        description: 'Cloud portal session',
        expiresIn: '1 day',
      },
      headers: { authorization: `Basic ${btoa(`${username}:${password}`)}` },
    }
  )
  writeSession(token.id)
}

/** Revokes the session token, not only the local session */
export async function logout() {
  const token = sessionToken()
  if (token !== undefined) {
    await request('DELETE', `/account/tokens/${encodeURIComponent(token.slice(0, 8))}`).catch(() => {})
  }
  clearSession()
}

function setConsoleCookie(token: string | undefined) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSOLE_COOKIE}=${encodeURIComponent(token ?? '')}; path=${CONSOLE_PATH}; SameSite=Strict; max-age=${
    token === undefined ? 0 : 3600
  }${secure}`
}

/**
 * Lets the console proxy authenticate the session while a console is open; returns the function closing it.
 *
 * Limited to the consoles path, and more specific than a `token` cookie of XO for the whole site, which the browser
 * sends after it.
 */
export function openConsoleSession(): () => void {
  setConsoleCookie(sessionToken())
  return () => setConsoleCookie(undefined)
}

/**
 * The previous versions of the portal kept their session in the cookies of XO, for the whole site. Removes them once
 * when they belong to a tenant account, never the session of an administrator of XO.
 */
export async function dropLegacySessionCookies() {
  if (!/(^|; )(authenticationToken|token)=/.test(document.cookie)) {
    return
  }
  try {
    const response = await fetch(`${BASE_URL}/account`, {
      headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      credentials: 'same-origin',
    })
    const account = response.ok ? await response.json() : undefined
    if (account !== undefined && account.isAdmin) {
      return
    }
  } catch {
    return
  }
  for (const name of ['authenticationToken', 'token']) {
    document.cookie = `${name}=; path=/; max-age=0`
  }
}

/**
 * Server-sent events of XO with the session header (`EventSource` cannot send headers). Reconnects until `close()`.
 */
export function subscribeEvents(listeners: Record<string, (data: string) => void>): { close(): void } {
  let closed = false
  let controller: AbortController | undefined

  async function connect() {
    for (;;) {
      if (closed) {
        return
      }
      controller = new AbortController()
      try {
        const response = await fetch(`${BASE_URL}/events`, {
          headers: { accept: 'text/event-stream', authorization: `Bearer ${sessionToken()}` },
          credentials: 'omit',
          signal: controller.signal,
        })
        if (!response.ok || response.body === null) {
          throw new Error(`events: HTTP ${response.status}`)
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          buffer += value
          let end
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            let type = 'message'
            const data: string[] = []
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event:')) {
                type = line.slice(6).trim()
              } else if (line.startsWith('data:')) {
                data.push(line.slice(5).trimStart())
              }
            }
            listeners[type]?.(data.join('\n'))
          }
        }
      } catch {
        // the polling of the store covers the gap
      }
      if (!closed) {
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  connect()
  return {
    close() {
      closed = true
      controller?.abort()
    },
  }
}
