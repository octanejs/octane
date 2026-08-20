import type { UniversalUnheadProviderProps } from './context'
import { createElement } from 'react'
import { UnheadContext } from './context'

export { createHead, type PreparedTemplate, prepareTemplate, renderSSRHead, transformHtmlTemplate } from 'unhead/server'

export type UnheadProviderProps = UniversalUnheadProviderProps

export function UnheadProvider({ children, value }: UnheadProviderProps) {
  return createElement(UnheadContext.Provider, { value }, children)
}

export type {
  CreateServerHeadOptions,
  SSRHeadPayload,
  Unhead,
} from 'unhead/types'
