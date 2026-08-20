import type { ReactNode } from 'react'
import type { Unhead } from 'unhead/types'
import { createContext } from 'react'

export interface UniversalUnheadProviderProps {
  children: ReactNode
  value: Unhead
}

export const UnheadContext = /* @__PURE__ */ createContext<Unhead | null>(null)
