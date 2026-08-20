import type { ReactNode } from 'react'
import type { ActiveHeadEntry, Unhead, ResolvableHead as UseHeadInput } from 'unhead/types'
import React, { useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { createHead as _createHead, createDebouncedFn, createDomRenderer } from 'unhead/client'
import { HasElementTags, TagsWithInnerContent, ValidHeadTags } from 'unhead/utils'
import { UnheadContext } from './context'

let _singletonHead: Unhead | null = null

function useHelmetHead(): Unhead {
  const ctx = useContext<Unhead | null>(UnheadContext)
  if (ctx) {
    return ctx
  }
  // Lazily create a singleton client head when no provider is present (client-only)
  if (!_singletonHead) {
    if (typeof window === 'undefined') {
      throw new TypeError('Helmet requires UnheadProvider on the server. Wrap your app with <UnheadProvider>.')
    }
    const domRenderer = createDomRenderer()
    let head: ReturnType<typeof _createHead<UseHeadInput>>
    const debouncedRenderer = createDebouncedFn(() => domRenderer(head), fn => setTimeout(fn, 0))
    head = _createHead<UseHeadInput>({ render: debouncedRenderer })
    _singletonHead = head
  }
  return _singletonHead!
}

export interface HelmetProps {
  children?: ReactNode
  /**
   * A default title to use unchanged when no title is provided.
   *
   * Equivalent to react-helmet's `defaultTitle`.
   */
  defaultTitle?: string
  /**
   * A template for the title. Use `%s` as a placeholder for the page title.
   * The template is not applied to `defaultTitle`.
   *
   * @example `%s | My Site`
   */
  titleTemplate?: string
  /**
   * Called after the document head has been updated in the browser.
   *
   * Equivalent to react-helmet's `onChangeClientState`.
   *
   * @param newState - The new head state after rendering.
   * @param addedTags - Always empty — unhead manages DOM diffing internally.
   * @param removedTags - Always empty — unhead manages DOM diffing internally.
   */
  onChangeClientState?: (newState: Record<string, any>, addedTags: Record<string, HTMLElement[]>, removedTags: Record<string, HTMLElement[]>) => void
  /**
   * Whether to encode special characters in attributes.
   *
   * @default true
   * @deprecated Unhead handles encoding automatically. This prop is accepted for compatibility but has no effect.
   */
  encodeSpecialCharacters?: boolean
  /**
   * Whether to defer DOM updates until the browser is idle.
   *
   * @default true
   * @deprecated Unhead batches DOM updates automatically. This prop is accepted for compatibility but has no effect.
   */
  defer?: boolean

  // Prop-based API (alternative to children)
  title?: string
  base?: Record<string, any>
  meta?: Array<Record<string, any>>
  link?: Array<Record<string, any>>
  script?: Array<Record<string, any>>
  style?: Array<Record<string, any>>
  noscript?: Array<Record<string, any>>
  htmlAttributes?: Record<string, any>
  bodyAttributes?: Record<string, any>
}

/**
 * A react-helmet compatible component powered by unhead.
 *
 * Drop-in replacement for `<Helmet>` — import from `@unhead/react/helmet` instead of `react-helmet`.
 *
 * @example
 * ```tsx
 * import { Helmet } from '@unhead/react/helmet'
 *
 * <Helmet
 *   defaultTitle="My Site"
 *   titleTemplate="%s | My Site"
 *   onChangeClientState={(newState) => console.log(newState)}
 * >
 *   <title>Page Title</title>
 *   <meta name="description" content="Page description" />
 * </Helmet>
 * ```
 */
const Helmet: React.FC<HelmetProps> = ({
  children,
  defaultTitle,
  titleTemplate,
  onChangeClientState,
  title: titleProp,
  base: baseProp,
  meta: metaProp,
  link: linkProp,
  script: scriptProp,
  style: styleProp,
  noscript: noscriptProp,
  htmlAttributes,
  bodyAttributes,
  // accepted for compat, intentionally unused
  encodeSpecialCharacters: _encodeSpecialCharacters,
  defer: _defer,
}) => {
  const head = useHelmetHead()

  const processedElements = useMemo(() =>
    React.Children.toArray(children).filter(React.isValidElement), [children])

  const getHeadChanges = useCallback(() => {
    const input: UseHeadInput = {}

    if (titleTemplate) {
      input.titleTemplate = defaultTitle
        ? title => title ? titleTemplate : defaultTitle
        : titleTemplate
    }

    // Apply prop-based API values first (children override these)
    if (titleProp != null) {
      input.title = titleProp
    }
    if (baseProp) {
      input.base = baseProp as any
    }
    if (metaProp) {
      input.meta = [...metaProp] as any
    }
    if (linkProp) {
      input.link = [...linkProp] as any
    }
    if (scriptProp) {
      input.script = [...scriptProp] as any
    }
    if (styleProp) {
      input.style = [...styleProp] as any
    }
    if (noscriptProp) {
      input.noscript = [...noscriptProp] as any
    }
    if (htmlAttributes) {
      input.htmlAttrs = htmlAttributes as any
    }
    if (bodyAttributes) {
      input.bodyAttrs = bodyAttributes as any
    }

    let hasTitle = !!titleProp
    for (const element of processedElements) {
      const reactElement = element as React.ReactElement
      const { type, props } = reactElement
      let tagName = String(type)

      // Normalize react-helmet's <html>/<body> to unhead's htmlAttrs/bodyAttrs
      if (tagName === 'html')
        tagName = 'htmlAttrs'
      else if (tagName === 'body')
        tagName = 'bodyAttrs'

      if (!ValidHeadTags.has(tagName)) {
        continue
      }

      const data: Record<string, any> = { ...(typeof props === 'object' ? props : {}) }

      if (TagsWithInnerContent.has(tagName) && data.children != null) {
        const contentKey = tagName === 'script' ? 'innerHTML' : 'textContent'
        data[contentKey] = Array.isArray(data.children)
          ? data.children.map(String).join('')
          : String(data.children)
      }
      delete data.children

      if (tagName === 'title') {
        hasTitle = true
      }

      if (HasElementTags.has(tagName)) {
        const key = tagName as keyof UseHeadInput
        if (!Array.isArray(input[key])) {
          // @ts-expect-error untyped
          input[key] = []
        }
        (input[key] as any[])!.push(data)
      }
      else {
        // @ts-expect-error untyped
        input[tagName as keyof UseHeadInput] = data
      }
    }

    // A low-priority title acts as a fallback across sibling Helmet entries.
    // When titleTemplate exists, its resolver emits defaultTitle only if no real title won.
    if (!hasTitle && defaultTitle && !titleTemplate) {
      input.title = {
        textContent: defaultTitle,
        tagPriority: 'low',
      }
    }

    return input
  }, [processedElements, titleTemplate, defaultTitle, titleProp, baseProp, metaProp, linkProp, scriptProp, styleProp, noscriptProp, htmlAttributes, bodyAttributes])

  const headRef = useRef<ActiveHeadEntry<any> | null>(null)

  // Map onChangeClientState to unhead's onRendered hook
  const onChangeClientStateRef = useRef(onChangeClientState)
  onChangeClientStateRef.current = onChangeClientState

  // Server: create entry during render since useEffect doesn't run in SSR
  if (head.ssr && !headRef.current) {
    headRef.current = head.push(getHeadChanges())
  }

  // Client: create entry in effect to avoid orphaned entries in React 18 StrictMode
  useEffect(() => {
    const options: Record<string, any> = {
      onRendered: () => {
        const cb = onChangeClientStateRef.current
        if (!cb)
          return
        // Build a state object similar to react-helmet's onChangeClientState
        const titleEl = document.querySelector('title')
        const state: Record<string, any> = {
          title: titleEl?.textContent || '',
        }
        // Collect current meta/link/script tags
        for (const tag of ['meta', 'link', 'script', 'style', 'base'] as const) {
          state[`${tag}Tags`] = Array.from(document.querySelectorAll(`head ${tag}`))
        }
        // addedTags/removedTags are always empty since unhead manages DOM diffing internally
        cb(state, {}, {})
      },
    }
    headRef.current = head.push(getHeadChanges(), options)
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

export { Helmet }
