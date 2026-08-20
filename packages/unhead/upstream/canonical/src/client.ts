import type { ReactNode } from 'react'
import type { ClientUnhead } from 'unhead/client'
import type { CreateClientHeadOptions, Unhead } from 'unhead/types'
import type { UniversalUnheadProviderProps } from './context'
import { createElement, useRef } from 'react'
import { createHead as _createHead, createDebouncedFn, createDomRenderer } from 'unhead/client'
import { UnheadContext } from './context'

export { renderDOMHead } from 'unhead/client'

export function createHead(options: CreateClientHeadOptions = {}): ClientUnhead {
  const domRenderer = createDomRenderer()
  let head: ClientUnhead
  const debouncedRenderer = createDebouncedFn(() => domRenderer(head), fn => setTimeout(fn, 0))
  head = _createHead({ render: debouncedRenderer, ...options })
  return head
}

interface LegacyUnheadProviderProps {
  children: ReactNode
  value?: never
  /**
   * @deprecated Use `value` for a consistent provider API across client and server entries.
   */
  head?: Unhead
}

export type UnheadProviderProps
  = | (UniversalUnheadProviderProps & { head?: never })
    | LegacyUnheadProviderProps

export function UnheadProvider({ children, value, head }: UnheadProviderProps) {
  const headRef = useRef<Unhead | null>(null)
  if (value !== undefined && head !== undefined)
    throw new TypeError('UnheadProvider received both value and head props')

  const suppliedHead = value ?? head
  if (suppliedHead === undefined && headRef.current === null)
    headRef.current = createHead()
  return createElement(UnheadContext.Provider, { value: suppliedHead ?? headRef.current }, children)
}

export type {
  CreateClientHeadOptions,
  Unhead,
}
