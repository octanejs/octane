
import type { NuxtModule } from '@nuxt/schema'
import type { default as Module } from './module'

declare module '@nuxt/schema' {
  interface NuxtConfig { ['autoAnimate']?: Partial<ModuleOptions> }
  interface NuxtOptions { ['autoAnimate']?: ModuleOptions }
}

declare module 'nuxt/schema' {
  interface NuxtConfig { ['autoAnimate']?: Partial<ModuleOptions> }
  interface NuxtOptions { ['autoAnimate']?: ModuleOptions }
}

export type ModuleOptions = typeof Module extends NuxtModule<infer O> ? Partial<O> : Record<string, any>

