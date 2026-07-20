import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  getAuthGuards,
  getAuthService,
  type Capability,
} from '~/auth/index.server'
import { ADMIN_ACCESS_CAPABILITIES } from '~/db/types'

export const getCurrentUser = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest()
    const authService = getAuthService()

    return authService.getCurrentUser(request)
  },
)

export const requireAuth = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest()
    const guards = getAuthGuards()

    return guards.requireAuth(request)
  },
)

export const requireCapability = createServerFn({ method: 'POST' })
  .validator((data: { capability: string }) => ({
    capability: data.capability as Capability,
  }))
  .handler(async ({ data: { capability } }) => {
    const request = getRequest()
    const guards = getAuthGuards()

    return guards.requireCapability(request, capability)
  })

export async function loadUser() {
  try {
    return await getCurrentUser()
  } catch {
    return null
  }
}

export async function requireAuthUser() {
  try {
    return await requireAuth()
  } catch {
    throw new Error('Not authenticated')
  }
}

export async function requireCapabilityUser(capability: string) {
  try {
    return await requireCapability({ data: { capability } })
  } catch {
    throw new Error(`Missing required capability: ${capability}`)
  }
}

export { ADMIN_ACCESS_CAPABILITIES as ADMIN_CAPABILITIES } from '~/db/types'

export const requireAnyAdminCapability = createServerFn({
  method: 'POST',
}).handler(async () => {
  const request = getRequest()
  const authService = getAuthService()
  const user = await authService.getCurrentUser(request)

  if (!user) {
    throw new Error('Not authenticated')
  }

  const hasAdminCapability = user.capabilities.some((cap) =>
    (ADMIN_ACCESS_CAPABILITIES as readonly string[]).includes(cap),
  )

  if (!hasAdminCapability) {
    throw new Error('Admin access required')
  }

  return user
})
