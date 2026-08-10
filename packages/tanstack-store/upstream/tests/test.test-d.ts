import { expectTypeOf, test } from 'vitest'
import { createAtom, createStore } from '@tanstack/store'
import {
  _useStore,
  createStoreContext,
  useAtom,
  useCreateAtom,
  useCreateStore,
  useSelector,
  useStore,
} from '../src'
import type { Atom, ReadonlyStore, Store } from '@tanstack/store'

test('useCreateAtom returns a writable atom for initial values', () => {
  const atom = useCreateAtom(12)

  expectTypeOf(atom.get()).toExtend<number>()
  expectTypeOf(atom.set).toBeFunction()
})

test('useCreateAtom returns a readonly atom for derived values', () => {
  const atom = useCreateAtom(() => 12, {
    compare: (prev, next) => prev === next,
  })

  expectTypeOf(atom.get()).toExtend<number>()
  expectTypeOf(atom).not.toHaveProperty('set')
})

test('useSelector infers value from mutable and readonly atoms', () => {
  const writableAtom = createAtom(12)
  const readonlyAtom = createAtom(() => 24)
  const writableStore = createStore(12)
  const readonlyStore = createStore(() => 24)

  expectTypeOf(useSelector(writableAtom)).toExtend<number>()
  expectTypeOf(useSelector(readonlyAtom)).toExtend<number>()
  expectTypeOf(useSelector(writableStore)).toExtend<number>()
  expectTypeOf(useSelector(readonlyStore)).toExtend<number>()
  expectTypeOf(
    useSelector(writableAtom, undefined, {
      compare: (prev, next) => prev === next,
    }),
  ).toExtend<number>()
})

test('useAtom only accepts writable atoms', () => {
  const writableAtom = createAtom(12)
  const readonlyAtom = createAtom(() => 24)

  const [value, setValue] = useAtom(writableAtom)
  const [valueWithOptions] = useAtom(writableAtom, {
    compare: (prev, next) => prev === next,
  })

  expectTypeOf(value).toExtend<number>()
  expectTypeOf(valueWithOptions).toExtend<number>()
  expectTypeOf(setValue).toBeFunction()
  // @ts-expect-error readonly atoms cannot be used with useAtom
  useAtom(readonlyAtom)
})

test('useCreateStore returns writable and readonly store types', () => {
  const writableStore = useCreateStore(12)
  const writableStoreWithActions = useCreateStore(
    { count: 0 },
    ({ setState }) => ({
      inc: () => setState((prev) => ({ count: prev.count + 1 })),
    }),
  )
  const readonlyStore = useCreateStore(() => 24)

  expectTypeOf(writableStore.state).toExtend<number>()
  expectTypeOf(writableStore.setState).toBeFunction()
  expectTypeOf(writableStoreWithActions.state).toMatchObjectType<{
    count: number
  }>()
  expectTypeOf(writableStoreWithActions.actions.inc).toBeFunction()
  expectTypeOf(readonlyStore.state).toExtend<number>()
  expectTypeOf(readonlyStore).not.toHaveProperty('setState')

  useCreateStore({ count: 0 }, () => ({
    // @ts-expect-error actions must be functions
    asdf: 123,
    inc: () => {},
  }))
})

test('useSelector infers state and selected types for stores', () => {
  const baseStore = createStore(12)
  const derivedStore = createStore(() => {
    return { val: baseStore.state * 2 }
  })

  const val = useSelector(derivedStore, (state) => {
    expectTypeOf(state).toMatchObjectType<{ val: number }>()
    return state.val
  })
  const valWithOptions = useSelector(derivedStore, (state) => state.val, {
    compare: (prev, next) => prev === next,
  })

  expectTypeOf(val).toExtend<number>()
  expectTypeOf(valWithOptions).toExtend<number>()
})

test('useSelector infers state and selected types for atoms', () => {
  const atom = createAtom({ val: 12 })

  const val = useSelector(atom, (state) => {
    expectTypeOf(state).toMatchObjectType<{ val: number }>()
    return state.val
  })

  expectTypeOf(val).toExtend<number>()
})

test('useStore matches useSelector types for compatibility', () => {
  const baseStore = createStore(12)
  const derivedStore = createStore(() => {
    return { val: baseStore.state * 2 }
  })

  const selectorValue = useSelector(derivedStore, (state) => state.val)
  const compatValue = useStore(
    derivedStore,
    (state) => state.val,
    (prev, next) => prev === next,
  )

  expectTypeOf(selectorValue).toExtend<number>()
  expectTypeOf(compatValue).toExtend<number>()
})

test('createStoreContext preserves keyed atom and store types', () => {
  const countAtom = createAtom(12)
  const readonlySource = createStore(() => ({ value: 24 }))
  const storeFactory = createStoreContext<{
    countAtom: typeof countAtom
    readonlyStore: typeof readonlySource
  }>()
  const contextValue = storeFactory.useStoreContext()

  expectTypeOf(contextValue.countAtom).toExtend<Atom<number>>()
  expectTypeOf(contextValue.countAtom.set).toBeFunction()

  const [value, setValue] = useAtom(contextValue.countAtom)
  expectTypeOf(value).toExtend<number>()
  expectTypeOf(setValue).toBeFunction()

  const readonlyStore = contextValue.readonlyStore
  expectTypeOf(readonlyStore).toExtend<ReadonlyStore<{ value: number }>>()
  expectTypeOf(readonlyStore).not.toHaveProperty('setState')

  const selected = useSelector(readonlyStore, (state) => state.value)
  expectTypeOf(selected).toExtend<number>()
})

test('_useStore returns actions for stores with actions', () => {
  const store = createStore({ count: 0 }, ({ setState }) => ({
    inc: () => setState((prev) => ({ count: prev.count + 1 })),
  }))

  const [selected, actions] = _useStore(store, (state) => state.count)

  expectTypeOf(selected).toExtend<number>()
  expectTypeOf(actions.inc).toBeFunction()
})

test('_useStore returns setState for plain stores', () => {
  const store = createStore(0)

  const [selected, setState] = _useStore(store, (state) => state)

  expectTypeOf(selected).toExtend<number>()
  expectTypeOf(setState).toEqualTypeOf<Store<number>['setState']>()
})
