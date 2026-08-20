import type { ReactNode } from 'react'
import type { UniversalUnheadProviderProps } from '../context'
import { createElement } from 'react'
import { UnheadContext } from '../context'

export type UnheadProviderProps = UniversalUnheadProviderProps

export function UnheadProvider({ value, children }: UnheadProviderProps): ReactNode {
  return createElement(UnheadContext.Provider, { value }, children)
}

/**
 * Client-side HeadStream - renders empty script with suppressHydrationWarning
 * to match server-side structure without hydration mismatch errors.
 */
export function HeadStream(): ReactNode {
  return createElement('script', { suppressHydrationWarning: true })
}

export {
  type CreateStreamableClientHeadOptions,
  createStreamableHead,
  type UnheadStreamQueue,
} from 'unhead/stream/client'
