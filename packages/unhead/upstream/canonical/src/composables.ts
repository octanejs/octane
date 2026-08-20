import type {
  ActiveHeadEntry,
  HeadEntryOptions,
  HeadSafe,
  Unhead,
  UseHeadInput,
  UseScriptInput,
  UseScriptOptions,
  UseScriptReturn,
  UseSeoMetaInput,
} from 'unhead/types'
import { useContext, useEffect, useRef } from 'react'
import { useHead as baseHead, useHeadSafe as baseHeadSafe, useSeoMeta as baseSeoMeta, useScript as baseUseScript } from 'unhead'
import { UnheadContext } from './context'

interface ScriptCallbackRecord {
  active: boolean
  handler: any
  key: 'loaded' | 'error'
  registered: boolean
  renderScoped: boolean
  renderId: number
  script: UseScriptReturn<any>
}

export function useUnhead(): Unhead {
  // fallback to react context
  const instance = useContext<Unhead | null>(UnheadContext)
  if (!instance) {
    throw new Error('useHead() was called without provide context.')
  }
  return instance
}

function withSideEffects<T extends ActiveHeadEntry<any>>(input: any, options: any, fn: any): T {
  const head = options.head || useUnhead()
  const entryRef = useRef<T | null>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  // Server: create entry during render since useEffect doesn't run in SSR
  if (head.ssr && !entryRef.current) {
    entryRef.current = fn(head, input, options) as T
  }

  // Client: create entry in effect to avoid orphaned entries in React 18 StrictMode.
  // StrictMode resets useRef between its double-render invocations,
  // so creating entries during render causes an orphaned entry that never gets disposed.
  useEffect(() => {
    const entry = fn(head, inputRef.current, options) as T
    entryRef.current = entry
    return () => {
      entry.dispose()
      entryRef.current = null
    }
  }, [head])

  // Patch when input changes
  useEffect(() => {
    entryRef.current?.patch(input)
  }, [input])

  // Return a stable proxy that delegates to the real entry once created
  if (head.ssr) {
    return entryRef.current as T
  }
  const proxyRef = useRef<T | null>(null)
  if (!proxyRef.current) {
    proxyRef.current = {
      patch: (newInput: any) => { entryRef.current?.patch(newInput) },
      dispose: () => {
        entryRef.current?.dispose()
        entryRef.current = null
      },
      _poll: (rm?: boolean) => { (entryRef.current as any)?._poll(rm) },
    } as unknown as T
  }
  return proxyRef.current
}

export function useHead(input: UseHeadInput = {}, options: HeadEntryOptions = {}): ActiveHeadEntry<UseHeadInput> {
  return withSideEffects(input, options, baseHead)
}

export function useHeadSafe(input: HeadSafe = {}, options: HeadEntryOptions = {}): ActiveHeadEntry<HeadSafe> {
  return withSideEffects<ActiveHeadEntry<HeadSafe>>(input, options, baseHeadSafe)
}

export function useSeoMeta(input: UseSeoMetaInput = {}, options: HeadEntryOptions = {}): ActiveHeadEntry<UseSeoMetaInput> {
  return withSideEffects<ActiveHeadEntry<UseSeoMetaInput>>(input, options, baseSeoMeta)
}

export function useScript<T extends Record<symbol | string, any> = Record<symbol | string, any>>(_input: UseScriptInput, _options?: Omit<UseScriptOptions<T>, 'scope'>): UseScriptReturn<T> {
  const input = (typeof _input === 'string' ? { src: _input } : _input) as UseScriptInput
  const options = _options || {} as UseScriptOptions<T>
  const head = options.head || useUnhead()
  const trigger = options.trigger
  const resolvedOptions = {
    ...options,
    head,
    trigger: head.ssr && trigger === 'server' ? 'server' : 'manual',
  } as UseScriptOptions<T>

  const callbackRecords = useRef<ScriptCallbackRecord[]>([])
  const isMounted = useRef(false)
  const renderId = useRef(0)
  const committedRenderId = useRef(0)
  const currentRenderId = ++renderId.current

  // @ts-expect-error untyped
  const script = baseUseScript(head, input as BaseUseScriptInput, resolvedOptions)

  useEffect(() => {
    isMounted.current = true
    committedRenderId.current = currentRenderId
    reconcileScriptCallbacks(currentRenderId)
    callbackRecords.current.forEach(registerScriptCallback)
    return () => {
      isMounted.current = false
      callbackRecords.current.forEach(unregisterScriptCallback)
    }
  })

  useEffect(() => {
    return script.setupTriggerHandler(trigger)
  }, [script, trigger])

  function reconcileScriptCallbacks(activeRenderId: number) {
    callbackRecords.current.forEach((record) => {
      if (record.renderScoped && record.renderId !== activeRenderId) {
        record.active = false
        unregisterScriptCallback(record)
      }
    })
    callbackRecords.current = callbackRecords.current.filter(record => record.active && (!record.renderScoped || record.renderId === activeRenderId))
  }

  function registerScriptCallback(record: ScriptCallbackRecord) {
    if (!record.active || record.registered)
      return
    const cbs = record.script._cbs[record.key]
    if (!cbs) {
      record.handler(record.script.instance)
      return
    }
    cbs.push(record.handler)
    record.registered = true
  }

  function unregisterScriptCallback(record: ScriptCallbackRecord) {
    if (!record.registered)
      return
    const idx = record.script._cbs[record.key]?.indexOf(record.handler) ?? -1
    if (idx !== -1)
      record.script._cbs[record.key]?.splice(idx, 1)
    record.registered = false
  }

  const _registerCb = (key: 'loaded' | 'error', cb: any) => {
    const renderScoped = !(isMounted.current && committedRenderId.current === currentRenderId)
    const record: ScriptCallbackRecord = {
      active: true,
      handler: (...args: any[]) => {
        if (!record.active)
          return
        record.active = false
        record.registered = false
        return cb(...args)
      },
      key,
      registered: false,
      renderScoped,
      renderId: currentRenderId,
      script,
    }
    callbackRecords.current.push(record)
    if (isMounted.current && committedRenderId.current === currentRenderId)
      registerScriptCallback(record)
    return destroy

    function destroy() {
      if (!record.active)
        return
      record.active = false
      unregisterScriptCallback(record)
      const idx = callbackRecords.current.indexOf(record)
      if (idx !== -1)
        callbackRecords.current.splice(idx, 1)
    }
  }
  // if we have a scope we should make these callbacks reactive
  script.onLoaded = (cb: (instance: T) => void | Promise<void>) => _registerCb('loaded', cb)
  script.onError = (cb: (err?: Error) => void | Promise<void>) => _registerCb('error', cb)
  return script
}
