import { createLogger } from '@xen-orchestra/log'
import type { NextFunction, Request, Response } from 'express'
import { unauthorized } from 'xo-common/api-errors.js'
import type { XoApp } from '@vates/types/xo-app'

import { ApiError } from '../helpers/error.helper.mjs'
import type { AuthenticatedRequest } from '../helpers/helper.type.mjs'

import { iocContainer } from '../ioc/ioc.mjs'
import { RestApi } from '../rest-api/rest-api.mjs'
import { ACL_MIDDLEWARE_NAME } from './acl.middleware.mjs'
import type { SecurityName } from '@vates/types'
const log = createLogger('xo:rest-api:authentication')

// TSOA spec require this function to be async
export async function expressAuthentication(req: AuthenticatedRequest, securityName: SecurityName, scopes: 'acl'[]) {
  if (securityName === 'none') {
    return undefined
  }

  const restApi = iocContainer.get(RestApi)
  const user = restApi.getCurrentUser()
  const authType = req.res.locals.authType

  if (securityName !== '*' && authType !== securityName) {
    throw new ApiError(`invalid authentification. please use ${securityName} authentication`, 401)
  }

  if (user.permission === 'admin') {
    return user
  }

  // This means the route requires authentication, but it doesn't need to be associated with a specific ACL.
  // The route's content will depend on the users' ACLs.
  // (For example: GET /vms -> empty array if no VMs ACL; GET /events -> only changes related to the users' ACLs will be sent)
  if (scopes.includes('acl')) {
    return user
  }

  const aclMiddleware = req.route.stack.find(layer => layer.name === ACL_MIDDLEWARE_NAME)
  if (aclMiddleware === undefined) {
    log.error(`${req.route.path} can only be used by an administrator`)
    throw unauthorized()
  }

  return user
}

export function setupApiContext(xoApp: XoApp) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { cookies, headers, ip, query } = req
    const { authorization } = headers

    // An explicit `Authorization` header wins over the cookies: the session cookie of another application served
    // on the same address (XO 6 and the tenant portal) must not make the request fail, and other sites can make a
    // browser send cookies but not headers. `Bearer` carries an authentication token, any other scheme is Basic.
    let token: string | undefined
    let basic: string | undefined
    if (authorization !== undefined) {
      const [scheme, value] = authorization.split(' ')
      if (value === undefined) {
        return next(new ApiError('Malformed Authorization header', 400))
      }
      if (scheme.toLowerCase() === 'bearer') {
        token = value
      } else {
        basic = value
      }
    } else {
      token = cookies.authenticationToken ?? cookies.token
    }

    if (!token && basic === undefined) {
      return xoApp.runWithApiContext(undefined, next)
    }

    const hasToken = Boolean(token)
    const credentials = {}
    if (hasToken) {
      Object.assign(credentials, { token })
      res.locals.authType = 'token'
    } else {
      const [username, password] = Buffer.from(basic!, 'base64').toString().split(':')
      Object.assign(credentials, { username, password, otp: query.otp })
      res.locals.authType = 'basic'
    }

    try {
      const { user } = await xoApp.authenticateUser(credentials, { ip }, { bypassTaskCreation: hasToken })
      return xoApp.runWithApiContext(user, next)
    } catch (error) {
      return next(error)
    }
  }
}
