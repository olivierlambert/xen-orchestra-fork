// Minimal client for the XO REST API, reached on the same origin (proxied by vite in development).

const BASE_URL = '/rest/v0'
const TOKEN_COOKIE = 'authenticationToken'

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

export async function login(username: string, password: string) {
  const { token } = await request<{ token: { id: string; expiration: number } }>(
    'POST',
    '/users/me/authentication_tokens',
    {
      body: { client: { id: 'cloud-portal' }, description: 'Cloud portal session', expiresIn: '1 day' },
      headers: { authorization: `Basic ${btoa(`${username}:${password}`)}` },
    }
  )
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token.id)}; path=/; SameSite=Strict; max-age=86400`
}

export function logout() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; SameSite=Strict; max-age=0`
}
