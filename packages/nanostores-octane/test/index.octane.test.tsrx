// Octane port of the @nanostores/react test suite (test/index.test.ts).
//
// Same observable contract, octane rendering model:
//  - components are authored in .tsrx (compiled by the octane vite plugin) at
//    MODULE level — the octane compiler threads call-site data per component,
//    so components (and the stores/counters they close over) receive their
//    inputs as props rather than capturing test-local lets,
//  - rendering/assertions go through @octanejs/testing-library
//    (@testing-library/dom verbatim + octane createRoot/hydrateRoot mounts),
//  - SSR renders run through the server-mode compiler in test/_ssr.ts,
//  - events are native delegated DOM events (registered once below),
//  - there is no StrictMode double-render / synthetic-event layer to work
//    around (intentional octane divergences, see the react-divergences skill).
import { act, cleanup, render, screen } from '@octanejs/testing-library'
import { delay } from 'nanodelay'
import { atom, computed, map, onMount, STORE_UNMOUNT_DELAY } from 'nanostores'
import { deepStrictEqual, equal, notEqual } from 'node:assert'
import { delegateEvents, useState } from 'octane'
import { afterEach, test, vi } from 'vitest'

import { useStore } from '../index.ts'
import { renderFixtureToString } from './_ssr.ts'
import { Wrapper as SsrWrapper } from './_fixtures/ssr-fixture.tsrx'

// Components click buttons in these tests; `click` is delegated natively.
delegateEvents(['click'])

afterEach(() => {
  cleanup()
  window.document.head.innerHTML = ''
  window.document.body.innerHTML = ''
})

// ── components (module level; state arrives via props) ─────────────────────

function RenderCounter1(props: any) @{
  props.onRender()
  let value = useStore(props.letter)
  let number = useStore(props.second)
  <div data-testid="test1">{value + number}</div>
}

function RenderCounter2(props: any) @{
  let value = useStore(props.letter)
  <div data-testid="test2">{value as string}</div>
}

function ShowHideWrapper(props: any) @{
  let [show, setShow] = useState(true)
  <div>
    <button onClick={() => setShow(false)}></button>
    @if (show) {
      <RenderCounter1
        letter={props.letter}
        second={props.second}
        onRender={props.onRender}
      />
    }
    @if (show) { <RenderCounter2 letter={props.letter} /> }
  </div>
}

function SimpleTestA(props: any) @{
  let simpleValue = useStore(props.simple)
  <div data-testid="test">{'1 ' + simpleValue}</div>
}

function SimpleTestB(props: any) @{
  let simpleValue = useStore(props.simple)
  <div data-testid="test">{'2 ' + simpleValue}</div>
}

function Switcher(props: any) @{
  let [state, setState] = useState<'a' | 'b' | 'none'>('a')
  <div>
    <button
      onClick={() => {
        setState(state === 'a' ? 'b' : 'none')
      }}
    ></button>
    @if (state === 'a') { <SimpleTestA simple={props.simple} /> }
    @else if (state === 'b') { <SimpleTestB simple={props.simple} /> }
  </div>
}

function MapTest(props: any) @{
  props.onRender()
  let [keys, setKeys] = useState<string[]>(['a'])
  let { a, b } = useStore(props.mapStore, { keys })
  <div data-testid="map-test">
    <button
      onClick={() => {
        setKeys(['a', 'b'])
      }}
    ></button>
    {'map:' + a + '-' + b}
  </div>
}

// `useStore(store)` (no options) and `useStore(store, { keys })` (with options)
// in the SAME component. The compiler appends the call-site slot as the last
// argument, so the no-options call reaches `useStore` as `useStore(atom, slot)`
// — exercising the slot-stripping guard that keeps the two `useStore` hook
// chains (and their inner useRef/useCallback slots) independent.
function MixedOptionsTest(props: any) @{
  props.onRender()
  let value = useStore(props.atom)
  let { a } = useStore(props.mapStore, { keys: ['a'] })
  <div data-testid="mixed">{value + '-' + a}</div>
}

function LifecycleTest(props: any) @{
  let value = useStore(props.store)
  if (value !== 2) throw new Error()
  <div>{value as string}</div>
}

function SubscriptionTest(props: any) @{
  let value = useStore(props.store)
  // state update before the useSyncExternalStore subscription happen
  props.store.set('updated content')

  <div data-testid="subscription-test">{value as string}</div>
}

// ── tests ──────────────────────────────────────────────────────────────────

test('renders simple store', async () => {
  let renders = 0

  let letter = atom('a')

  let second = atom(0)

  render(ShowHideWrapper, {
    props: { letter, second, onRender: () => renders++ }
  })
  equal(screen.getByTestId('test1').textContent, 'a0')
  equal(screen.getByTestId('test2').textContent, 'a')
  equal(renders, 1)

  await act(async () => {
    letter.set('b')
    letter.set('c')
    second.set(1)
    await delay(1)
  })

  equal(screen.getByTestId('test1').textContent, 'c1')
  equal(screen.getByTestId('test2').textContent, 'c')
  equal(renders, 2)

  notEqual(screen.queryByTestId('test1'), null)
  act(() => {
    screen.getByRole('button').click()
  })
  equal(screen.queryByTestId('test1'), null)
  equal(renders, 2)
})

test('useStore with and without options in one component', async () => {
  let atomStore = atom('x')
  let keyed = map<{ a?: string }>({ a: 'A' })
  let renders = 0

  render(MixedOptionsTest, {
    props: { atom: atomStore, mapStore: keyed, onRender: () => renders++ }
  })
  equal(screen.getByTestId('mixed').textContent, 'x-A')
  equal(renders, 1)

  // both stores update in one batch — the no-options atom (slot stripped from
  // `options`) and the keys-filtered map re-render together
  await act(async () => {
    atomStore.set('y')
    keyed.setKey('a', 'B')
    await delay(1)
  })
  equal(screen.getByTestId('mixed').textContent, 'y-B')
  equal(renders, 2)

  // a map key NOT in `keys` must not re-render, while the atom still does
  await act(async () => {
    keyed.setKey('b', 'ignored')
    atomStore.set('z')
    await delay(1)
  })
  equal(screen.getByTestId('mixed').textContent, 'z-B')
  equal(renders, 3)
})

test('does not reload store on component changes', async () => {
  let destroyed = ''
  let simple = atom('')

  onMount(simple, () => {
    simple.set('S')
    return () => {
      destroyed += 'S'
    }
  })

  render(Switcher, { props: { simple } })
  equal(screen.getByTestId('test').textContent, '1 S')

  act(() => {
    screen.getByRole('button').click()
  })
  equal(screen.getByTestId('test').textContent, '2 S')
  equal(destroyed, '')

  act(() => {
    screen.getByRole('button').click()
  })
  equal(screen.queryByTestId('test'), null)
  equal(destroyed, '')

  await delay(STORE_UNMOUNT_DELAY)
  equal(destroyed, 'S')
})

test('handles keys option', async () => {
  type MapStore = {
    a?: string
    b?: string
  }
  let mapStore = map<MapStore>()
  let renderCount = 0

  render(MapTest, { props: { mapStore, onRender: () => renderCount++ } })

  equal(screen.getByTestId('map-test').textContent, 'map:undefined-undefined')
  equal(renderCount, 1)

  // updates on init: a whole-store `set` re-renders only when a watched key's
  // value actually changes. nanostores >=1.4 made `listenKeys` value-aware, so
  // re-setting `a` to the same `undefined` it already held no longer emits —
  // set it to a real value to exercise the whole-store-set re-render path
  // (works across the full supported range 1.2.0 – 1.4.x).
  await act(async () => {
    mapStore.set({ a: 'x', b: undefined })
    await delay(1)
  })

  equal(screen.getByTestId('map-test').textContent, 'map:x-undefined')
  equal(renderCount, 2)

  // updates when has key
  await act(async () => {
    mapStore.setKey('a', 'a')
    await delay(1)
  })

  equal(screen.getByTestId('map-test').textContent, 'map:a-undefined')
  equal(renderCount, 3)

  // does not update when has no key
  await act(async () => {
    mapStore.setKey('b', 'b')
    await delay(1)
  })

  equal(screen.getByTestId('map-test').textContent, 'map:a-undefined')
  equal(renderCount, 3)

  // reacts on parameter changes
  await act(async () => {
    screen.getByRole('button').click()
    await delay(1)
  })

  equal(screen.getByTestId('map-test').textContent, 'map:a-b')
  equal(renderCount, 4)
})

test('works with stores that set their values in lifecycle hooks', () => {
  let $1 = atom(1)
  let $2 = atom(1)

  let $c = computed([$1, $2], (a, b) => a + b)

  render(LifecycleTest, { props: { store: $c } })
})

test('useSyncExternalStore late subscription handling', () => {
  let store = atom('original content')

  render(SubscriptionTest, { props: { store } })

  equal(screen.getByTestId('subscription-test').textContent, 'updated content')
})

test('support for SSR does not break server behaviour in non-SSR projects', async () => {
  type Value = 'new' | 'old'
  let atomStore = atom<Value>('old')
  let mapStore = map<{ value: Value }>({ value: 'old' })

  // Simulate store state change on server side
  atomStore.set('new')
  mapStore.set({ value: 'new' })

  // Create a "server" rendered element (no ssr option; map uses ssr:false,
  // which should be equivalent to not setting ssr at all)
  let ssrElement = document.createElement('div')
  document.body.appendChild(ssrElement)
  ssrElement.innerHTML = await renderFixtureToString(
    resolveFixture(),
    'Wrapper',
    { atomStore, mapStore, mapOpts: { ssr: false } }
  )

  // Confirm server rendered HTML includes the latest store data
  equal(screen.getByTestId('atom-test').textContent, 'new')
  equal(screen.getByTestId('map-test').textContent, 'new')
})

test('support SSR to fix client hydration errors, use initial data', async () => {
  type Value = 'new' | 'old'
  let atomStore = atom<Value>('old')
  let mapStore = map<{ value: Value }>({ value: 'old' })

  let atomValues: Value[] = [] // Track values used across renders
  let mapValues: Value[] = [] // Track values used across renders

  let props = {
    atomStore,
    mapStore,
    atomOpts: { ssr: 'initial' },
    mapOpts: { ssr: 'initial' },
    onAtomValue: (value: Value) => atomValues.push(value),
    onMapValue: (value: Value) => mapValues.push(value)
  }

  // Create a "server" rendered element to re-hydrate
  let ssrElement = document.createElement('div')
  document.body.appendChild(ssrElement)
  ssrElement.innerHTML = await renderFixtureToString(
    resolveFixture(),
    'Wrapper',
    props
  )

  equal(screen.getByTestId('atom-test').textContent, 'old')
  equal(screen.getByTestId('map-test').textContent, 'old')

  // Simulate store change on client, now different from value at "server" SSR
  atomStore.set('new')
  mapStore.set({ value: 'new' })

  // Hydrate into SSR element. Logs errors to console on hydration failure
  let consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => {
    render(SsrWrapper, { hydrate: true, container: ssrElement, props })
  })

  // Check nothing was logged to `console.error()`
  equal(consoleErrorMock.mock.calls[0]?.[0] === undefined, true)
  consoleErrorMock.mockRestore()

  // Confirm "server" render (renderToString) got old values, initial client
  // render got old values at hydration, then post-hydration render got new
  // values
  deepStrictEqual(atomValues, ['old', 'old', 'new'])
  deepStrictEqual(mapValues, ['old', 'old', 'new'])

  equal(screen.getByTestId('atom-test').textContent, 'new')
  equal(screen.getByTestId('map-test').textContent, 'new')
})

test('support SSR to fix client hydration errors, server passes data to client', async () => {
  type Value = 'initial' | 'update on client' | 'update on server'
  let atomStore = atom<Value>('initial')
  let mapStore = map<{ value: Value }>({ value: 'initial' })

  let atomValues: Value[] = [] // Track values used across renders
  let mapValues: Value[] = [] // Track values used across renders

  let opts: { atomOpts: { ssr?: any }; mapOpts: { ssr?: any } } = {
    atomOpts: { ssr: undefined },
    mapOpts: { ssr: undefined }
  }

  let getProps = () => ({
    atomStore,
    mapStore,
    ...opts,
    onAtomValue: (value: Value) => atomValues.push(value),
    onMapValue: (value: Value) => mapValues.push(value)
  })

  // Simulate store state change on server side
  atomStore.set('update on server')
  mapStore.set({ value: 'update on server' })

  // Create a "server" rendered element to re-hydrate
  let ssrElement = document.createElement('div')
  document.body.appendChild(ssrElement)
  ssrElement.innerHTML = await renderFixtureToString(
    resolveFixture(),
    'Wrapper',
    getProps()
  )

  // Confirm server render includes latest updates to server store
  equal(screen.getByTestId('atom-test').textContent, 'update on server')
  equal(screen.getByTestId('map-test').textContent, 'update on server')

  // Simulate store change on client, now different from value at "server" SSR
  atomStore.set('update on client')
  mapStore.set({ value: 'update on client' })

  // Simulate passing of store state data from server to client, provided to
  // hook via `ssr` option
  opts.atomOpts.ssr = (): Value => 'update on server'
  let serverDataForMap = { value: 'update on server' as Value }
  opts.mapOpts.ssr = (): { value: Value } => serverDataForMap

  // Hydrate into SSR element. Logs errors to console on hydration failure
  let consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => {
    render(SsrWrapper, { hydrate: true, container: ssrElement, props: getProps() })
  })

  // Check nothing was logged to `console.error()`
  equal(consoleErrorMock.mock.calls[0]?.[0] === undefined, true)
  consoleErrorMock.mockRestore()

  // Confirm "server" render (renderToString) got latest update on server,
  // initial client render got latest server update at hydration, then
  // post-hydration render got latest client update
  deepStrictEqual(atomValues, [
    'update on server',
    'update on server',
    'update on client'
  ])
  deepStrictEqual(mapValues, [
    'update on server',
    'update on server',
    'update on client'
  ])

  // Confirm final rendered version has latest updates to client store
  equal(screen.getByTestId('atom-test').textContent, 'update on client')
  equal(screen.getByTestId('map-test').textContent, 'update on client')
})

function resolveFixture(): string {
  return new URL('./_fixtures/ssr-fixture.tsrx', import.meta.url).pathname
}
