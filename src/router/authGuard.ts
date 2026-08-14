import type { RouteLocationNormalized } from 'vue-router'

export function hasResetPasswordToken(route: Pick<RouteLocationNormalized, 'name' | 'query'>): boolean {
  return route.name === 'reset-password' &&
    typeof route.query.token === 'string' &&
    route.query.token.length > 0
}

export function shouldRedirectAuthenticatedGuest(
  route: Pick<RouteLocationNormalized, 'name' | 'query' | 'meta'>,
  authenticated: boolean
): boolean {
  return authenticated && Boolean(route.meta.guestOnly) && !hasResetPasswordToken(route)
}
