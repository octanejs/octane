import type { ReactNode } from 'react'
import type { ActiveHeadEntry, ResolvableHead as UseHeadInput } from 'unhead/types'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { HasElementTags, TagsWithInnerContent, ValidHeadTags } from 'unhead/utils'
import { useUnhead } from './composables'

export interface HeadProps {
  children: ReactNode
  titleTemplate?: string
}

function normalizeRawContent(tagName: string, data: Record<string, any>) {
  const rawContent = data.dangerouslySetInnerHTML
  delete data.dangerouslySetInnerHTML

  if (rawContent == null)
    return

  if (!TagsWithInnerContent.has(tagName)) {
    throw new Error(`${tagName} is a self-closing tag and must neither have \`children\` nor use \`dangerouslySetInnerHTML\`.`)
  }
  if (typeof rawContent !== 'object' || !('__html' in rawContent)) {
    throw new Error('`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`.')
  }
  if (data.children != null) {
    throw new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.')
  }

  const content = rawContent.__html
  if (content != null)
    data[tagName === 'title' ? 'textContent' : 'innerHTML'] = String(content)
}

function normalizeReactPropAliases(props: unknown): Record<string, any> {
  if (!props || typeof props !== 'object')
    return {}

  const normalized: Record<string, any> = {}
  for (const [prop, value] of Object.entries(props)) {
    if (prop === 'ref' || prop === 'suppressContentEditableWarning' || prop === 'suppressHydrationWarning')
      continue

    const name = prop === 'className'
      ? 'class'
      : prop === 'httpEquiv' ? 'http-equiv' : prop
    normalized[name] = value
  }
  return normalized
}

function flattenHeadElements(children: ReactNode): React.ReactElement[] {
  const elements: React.ReactElement[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child))
      return

    if (child.type === React.Fragment) {
      elements.push(...flattenHeadElements((child.props as { children?: ReactNode }).children))
      return
    }

    elements.push(child)
  })
  return elements
}

const Head: React.FC<HeadProps> = ({ children, titleTemplate }) => {
  const head = useUnhead()

  // Process children only when they change
  const processedElements = useMemo(() => flattenHeadElements(children), [children])

  const getHeadChanges = useCallback(() => {
    const input: UseHeadInput = {
      titleTemplate,
    }

    for (const element of processedElements) {
      const reactElement = element as React.ReactElement
      const { type, props } = reactElement
      const tagName = String(type)

      if (!ValidHeadTags.has(tagName)) {
        continue
      }

      const data = normalizeReactPropAliases(props)
      normalizeRawContent(tagName, data)

      if (TagsWithInnerContent.has(tagName) && data.children != null) {
        const contentKey = tagName === 'script' ? 'innerHTML' : 'textContent'
        data[contentKey] = Array.isArray(data.children)
          ? data.children.map(String).join('')
          : String(data.children)
      }
      delete data.children
      if (HasElementTags.has(tagName)) {
        const key = tagName as keyof UseHeadInput
        if (!Array.isArray(input[key])) {
          // @ts-expect-error untyped
          input[key] = []
        }
        (input[key] as any[])!.push(data)
      }
      else {
        // For singleton tags (title, base, etc.)
        // @ts-expect-error untyped
        input[tagName as keyof UseHeadInput] = data
      }
    }

    return input
  }, [processedElements, titleTemplate])

  const headRef = useRef<ActiveHeadEntry<any> | null>(null)

  // Server: create entry during render since useEffect doesn't run in SSR.
  if (head.ssr && !headRef.current)
    headRef.current = head.push(getHeadChanges())

  // Client: create entry in effect to avoid orphaned entries in React 18 StrictMode.
  useEffect(() => {
    headRef.current = head.push(getHeadChanges())
    return () => {
      headRef.current?.dispose()
      headRef.current = null
    }
  }, [head])

  useEffect(() => {
    headRef.current?.patch(getHeadChanges())
  }, [getHeadChanges])

  return null
}

export { Head }
