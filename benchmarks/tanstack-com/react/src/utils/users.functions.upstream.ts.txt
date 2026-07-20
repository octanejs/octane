import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import { SIGNUP_SOURCES, type Capability } from '~/db/types'
import {
  addUserSignupSource as addUserSignupSourceServer,
  adminSetAdsDisabled as adminSetAdsDisabledServer,
  bulkUpdateUserCapabilities as bulkUpdateUserCapabilitiesServer,
  getUser as getUserServer,
  listUsers as listUsersServer,
  removeProfileImage as removeProfileImageServer,
  revertProfileImage as revertProfileImageServer,
  setInterestedInHidingAds as setInterestedInHidingAdsServer,
  updateAdPreference as updateAdPreferenceServer,
  updateLastUsedFramework as updateLastUsedFrameworkServer,
  updateUserCapabilities as updateUserCapabilitiesServer,
} from '~/utils/users.server'
import { pageIndexSchema, pageSizeSchema } from './schemas'

const listUsersInput = v.pipe(
  v.object({
    pagination: v.object({
      limit: pageSizeSchema,
      page: v.optional(pageIndexSchema),
    }),
    emailFilter: v.optional(v.pipe(v.string(), v.maxLength(255))),
    nameFilter: v.optional(v.pipe(v.string(), v.maxLength(255))),
    capabilityFilter: v.optional(v.pipe(v.array(v.string()), v.maxLength(32))),
    noCapabilitiesFilter: v.optional(v.boolean()),
    adsDisabledFilter: v.optional(v.boolean()),
    interestedInHidingAdsFilter: v.optional(v.boolean()),
    useEffectiveCapabilities: v.optional(v.boolean(), true),
    sortBy: v.optional(v.pipe(v.string(), v.maxLength(64))),
    sortDir: v.optional(v.picklist(['asc', 'desc'])),
  }),
  v.transform((data) => ({
    ...data,
    capabilityFilter: data.capabilityFilter as Array<Capability> | undefined,
  })),
)

export const listUsers = createServerFn({ method: 'POST' })
  .validator(listUsersInput)
  .handler(async ({ data }) => listUsersServer({ data }))

export const getUser = createServerFn({ method: 'POST' })
  .validator(v.object({ userId: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ data }) => getUserServer({ data }))

export const updateAdPreference = createServerFn({ method: 'POST' })
  .validator(v.object({ adsDisabled: v.boolean() }))
  .handler(async ({ data }) => updateAdPreferenceServer({ data }))

export const updateLastUsedFramework = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      framework: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
    }),
  )
  .handler(async ({ data }) => updateLastUsedFrameworkServer({ data }))

export const updateUserCapabilities = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      userId: v.pipe(v.string(), v.uuid()),
      capabilities: v.pipe(v.array(v.string()), v.maxLength(64)),
    }),
  )
  .handler(async ({ data }) =>
    updateUserCapabilitiesServer({
      data: {
        userId: data.userId,
        capabilities: data.capabilities as Array<Capability>,
      },
    }),
  )

export const adminSetAdsDisabled = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      userId: v.pipe(v.string(), v.uuid()),
      adsDisabled: v.boolean(),
    }),
  )
  .handler(async ({ data }) => adminSetAdsDisabledServer({ data }))

export const bulkUpdateUserCapabilities = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      userIds: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(100)),
      capabilities: v.pipe(v.array(v.string()), v.maxLength(64)),
    }),
  )
  .handler(async ({ data }) =>
    bulkUpdateUserCapabilitiesServer({
      data: {
        userIds: data.userIds,
        capabilities: data.capabilities as Array<Capability>,
      },
    }),
  )

export const setInterestedInHidingAds = createServerFn({ method: 'POST' })
  .validator(v.object({ interested: v.boolean() }))
  .handler(async ({ data }) => setInterestedInHidingAdsServer({ data }))

export const addUserSignupSource = createServerFn({ method: 'POST' })
  .validator(v.object({ source: v.picklist(SIGNUP_SOURCES) }))
  .handler(async ({ data }) => addUserSignupSourceServer({ data }))

export const revertProfileImage = createServerFn({ method: 'POST' }).handler(
  async () => revertProfileImageServer(),
)

export const removeProfileImage = createServerFn({ method: 'POST' }).handler(
  async () => removeProfileImageServer(),
)
