// Minimal client for the XO REST API, reached on the same origin (proxied by vite in development).

const BASE_URL = '/rest/v0'
const TOKEN_COOKIE = 'authenticationToken'
// the console proxy of xo-server only reads the `token` cookie
const CONSOLE_TOKEN_COOKIE = 'token'

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
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
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

/** Drops the session cookies, e.g. a token expired or revoked: XO refuses a request carrying both a token and a password */
export function clearSession() {
  setCookie(TOKEN_COOKIE, '', 0)
  setCookie(CONSOLE_TOKEN_COOKIE, '', 0)
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
  setCookie(TOKEN_COOKIE, token.id, 86400)
  setCookie(CONSOLE_TOKEN_COOKIE, token.id, 86400)
}

/** Revokes the session token, not only the cookies */
export async function logout() {
  const token = getCookies()[TOKEN_COOKIE]
  if (token !== undefined) {
    await request('DELETE', `/account/tokens/${encodeURIComponent(decodeURIComponent(token).slice(0, 8))}`).catch(
      () => {}
    )
  }
  clearSession()
}

function getCookies(): Record<string, string> {
  return Object.fromEntries(document.cookie.split('; ').map(cookie => cookie.split('=')))
}

function setCookie(name: string, value: string, maxAge: number) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Strict; max-age=${maxAge}${secure}`
}

/** For sessions opened before the console cookie existed */
export function ensureConsoleCookie() {
  const cookies = getCookies()
  if (cookies[TOKEN_COOKIE] !== undefined && cookies[CONSOLE_TOKEN_COOKIE] === undefined) {
    setCookie(CONSOLE_TOKEN_COOKIE, decodeURIComponent(cookies[TOKEN_COOKIE]), 86400)
  }
}
