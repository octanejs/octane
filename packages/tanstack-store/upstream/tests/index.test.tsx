import { act, render, renderHook, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, test, vi } from 'vitest'
import { createAtom, createStore } from '@tanstack/store'
import {
  _useStore,
  createStoreContext,
  shallow,
  useAtom,
  useCreateAtom,
  useCreateStore,
  useSelector,
  useStore,
} from '../src/index'

const user = userEvent.setup()

describe('atom hooks', () => {
  it('useCreateAtom creates a stable atom instance across rerenders', () => {
    const { result, rerender } = renderHook(() => useCreateAtom(0))
    const atom = result.current

    act(() => {
      atom.set(1)
    })

    rerender()

    expect(result.current).toBe(atom)
    expect(result.current.get()).toBe(1)
  })

  it('useSelector reads mutable atom state and rerenders when updated', async () => {
    const atom = createAtom(0)

    function Comp() {
      const value = useSelector(atom)

      return (
        <div>
          <p>Value: {value}</p>
          <button type="button" onClick={() => atom.set((prev) => prev + 1)}>
            Update
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)

    expect(getByText('Value: 0')).toBeInTheDocument()

    await user.click(getByText('Update'))

    await waitFor(() => expect(getByText('Value: 1')).toBeInTheDocument())
  })

  it('useSelector reads readonly atom state', async () => {
    const countAtom = createAtom(1)
    const doubledAtom = createAtom(() => countAtom.get() * 2)

    function Comp() {
      const value = useSelector(doubledAtom)

      return (
        <div>
          <p>Value: {value}</p>
          <button
            type="button"
            onClick={() => countAtom.set((prev) => prev + 1)}
          >
            Update
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)

    expect(getByText('Value: 2')).toBeInTheDocument()

    await user.click(getByText('Update'))

    await waitFor(() => expect(getByText('Value: 4')).toBeInTheDocument())
  })

  it('useSelector respects custom compare', async () => {
    const atom = createAtom({
      select: 0,
      ignored: 1,
    })
    const renderSpy = vi.fn()

    function Comp() {
      const value = useSelector(atom, undefined, {
        compare: (prev, next) => prev.select === next.select,
      })
      renderSpy()

      return (
        <div>
          <p>Renders: {renderSpy.mock.calls.length}</p>
          <p>Value: {value.select}</p>
          <button
            type="button"
            onClick={() =>
              atom.set((prev) => ({
                ...prev,
                ignored: prev.ignored + 1,
              }))
            }
          >
            Update ignored
          </button>
          <button
            type="button"
            onClick={() =>
              atom.set((prev) => ({
                ...prev,
                select: prev.select + 1,
              }))
            }
          >
            Update select
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)

    expect(getByText('Renders: 1')).toBeInTheDocument()
    expect(getByText('Value: 0')).toBeInTheDocument()

    await user.click(getByText('Update ignored'))
    expect(getByText('Renders: 1')).toBeInTheDocument()

    await user.click(getByText('Update select'))

    await waitFor(() => expect(getByText('Value: 1')).toBeInTheDocument())
    expect(getByText('Renders: 2')).toBeInTheDocument()
  })

  it('useAtom returns the current value and setter', () => {
    const atom = createAtom(0)
    const { result } = renderHook(() => useAtom(atom))

    expect(result.current[0]).toBe(0)

    act(() => {
      result.current[1]((prev) => prev + 5)
    })

    expect(result.current[0]).toBe(5)
  })
})

describe('store contexts', () => {
  it('provides bundled writable atoms and stores', async () => {
    const countAtom = createAtom(0)
    const totalStore = createStore({ count: 0 })
    const { StoreProvider, useStoreContext } = createStoreContext<{
      countAtom: typeof countAtom
      totalStore: typeof totalStore
    }>()

    function Comp() {
      const { countAtom: currentAtom, totalStore: currentStore } =
        useStoreContext()
      const value = useSelector(currentAtom)
      const total = useSelector(currentStore, (state) => state.count)

      return (
        <div>
          <p>Value: {value}</p>
          <p>Total: {total}</p>
          <button
            type="button"
            onClick={() => currentAtom.set((prev) => prev + 1)}
          >
            Update
          </button>
          <button
            type="button"
            onClick={() =>
              currentStore.setState((state) => ({
                ...state,
                count: state.count + 1,
              }))
            }
          >
            Update total
          </button>
        </div>
      )
    }

    const { getByText } = render(
      <StoreProvider value={{ countAtom, totalStore }}>
        <Comp />
      </StoreProvider>,
    )

    expect(getByText('Value: 0')).toBeInTheDocument()
    expect(getByText('Total: 0')).toBeInTheDocument()

    await user.click(getByText('Update'))
    await user.click(getByText('Update total'))

    await waitFor(() => expect(getByText('Value: 1')).toBeInTheDocument())
    await waitFor(() => expect(getByText('Total: 1')).toBeInTheDocument())
  })

  it('supports readonly atoms and stores in the same context', async () => {
    const baseAtom = createAtom(1)
    const readonlyAtom = createAtom(() => baseAtom.get() * 2)
    const baseStore = createStore(1)
    const readonlyStore = createStore(() => ({ value: baseStore.state * 2 }))
    const { StoreProvider, useStoreContext } = createStoreContext<{
      readonlyAtom: typeof readonlyAtom
      readonlyStore: typeof readonlyStore
    }>()

    function Comp() {
      const { readonlyAtom: currentAtom, readonlyStore: currentStore } =
        useStoreContext()
      const atomValue = useSelector(currentAtom)
      const storeValue = useSelector(currentStore, (state) => state.value)

      return (
        <div>
          <p>Atom: {atomValue}</p>
          <p>Store: {storeValue}</p>
        </div>
      )
    }

    const { getByText } = render(
      <StoreProvider value={{ readonlyAtom, readonlyStore }}>
        <Comp />
      </StoreProvider>,
    )

    expect(getByText('Atom: 2')).toBeInTheDocument()
    expect(getByText('Store: 2')).toBeInTheDocument()

    act(() => {
      baseAtom.set((prev) => prev + 1)
      baseStore.setState((prev) => prev + 1)
    })

    await waitFor(() => expect(getByText('Atom: 4')).toBeInTheDocument())
    await waitFor(() => expect(getByText('Store: 4')).toBeInTheDocument())
  })

  it('works with useAtom against contextual atoms', async () => {
    const countAtom = createAtom(0)
    const { StoreProvider, useStoreContext } = createStoreContext<{
      countAtom: typeof countAtom
    }>()

    function Comp() {
      const { countAtom: atom } = useStoreContext()
      const [value, setValue] = useAtom(atom)

      return (
        <div>
          <p>Value: {value}</p>
          <button type="button" onClick={() => setValue((prev) => prev + 5)}>
            Add 5
          </button>
        </div>
      )
    }

    const { getByText } = render(
      <StoreProvider value={{ countAtom }}>
        <Comp />
      </StoreProvider>,
    )

    await user.click(getByText('Add 5'))

    await waitFor(() => expect(getByText('Value: 5')).toBeInTheDocument())
  })

  it('throws a clear error when a store provider is missing', () => {
    const { useStoreContext } = createStoreContext<{ countAtom: number }>()

    function Comp() {
      useStoreContext()
      return null
    }

    expect(() => render(<Comp />)).toThrowError(
      'Missing StoreProvider for StoreContext',
    )
  })

  it('nested providers override parent values', async () => {
    const outerAtom = createAtom(1)
    const innerAtom = createAtom(5)
    const { StoreProvider, useStoreContext } = createStoreContext<{
      countAtom: typeof outerAtom
    }>()

    function Value() {
      const { countAtom: atom } = useStoreContext()
      const value = useSelector(atom)

      return <p>Value: {value}</p>
    }

    const { getAllByText } = render(
      <StoreProvider value={{ countAtom: outerAtom }}>
        <Value />
        <StoreProvider value={{ countAtom: innerAtom }}>
          <Value />
        </StoreProvider>
      </StoreProvider>,
    )

    expect(getAllByText(/Value:/).map((node) => node.textContent)).toEqual([
      'Value: 1',
      'Value: 5',
    ])

    act(() => {
      innerAtom.set(7)
    })

    await waitFor(() =>
      expect(getAllByText(/Value:/).map((node) => node.textContent)).toEqual([
        'Value: 1',
        'Value: 7',
      ]),
    )
  })
})

describe('store hooks', () => {
  it('useCreateStore creates a stable store instance across rerenders', () => {
    const { result, rerender } = renderHook(() => useCreateStore(0))
    const store = result.current

    act(() => {
      store.setState((prev) => prev + 1)
    })

    rerender()

    expect(result.current).toBe(store)
    expect(result.current.state).toBe(1)
  })

  it('useCreateStore supports actions and keeps them stable', () => {
    const { result, rerender } = renderHook(() =>
      useCreateStore({ count: 0 }, ({ get, setState }) => ({
        inc: () => setState((prev) => ({ count: prev.count + 1 })),
        current: () => get().count,
      })),
    )
    const store = result.current
    const actions = store.actions

    act(() => {
      store.actions.inc()
    })

    rerender()

    expect(result.current).toBe(store)
    expect(result.current.actions).toBe(actions)
    expect(result.current.actions.current()).toBe(1)
  })

  it('useSelector allows us to select state using a selector', () => {
    const store = createStore({
      select: 0,
      ignored: 1,
    })

    function Comp() {
      const storeVal = useSelector(store, (state) => state.select)

      return <p>Store: {storeVal}</p>
    }

    const { getByText } = render(<Comp />)
    expect(getByText('Store: 0')).toBeInTheDocument()
  })

  it('useSelector reads writable and readonly store state', async () => {
    const baseStore = createStore(1)
    const readonlyStore = createStore(() => ({ value: baseStore.state * 2 }))

    function Comp() {
      const value = useSelector(baseStore)
      const readonlyValue = useSelector(readonlyStore)

      return (
        <div>
          <p>Value: {value}</p>
          <p>Readonly: {readonlyValue.value}</p>
          <button
            type="button"
            onClick={() => baseStore.setState((prev) => prev + 1)}
          >
            Update
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)

    expect(getByText('Value: 1')).toBeInTheDocument()
    expect(getByText('Readonly: 2')).toBeInTheDocument()

    await user.click(getByText('Update'))

    await waitFor(() => expect(getByText('Value: 2')).toBeInTheDocument())
    await waitFor(() => expect(getByText('Readonly: 4')).toBeInTheDocument())
  })

  it('useSelector only triggers a re-render when selector state is updated', async () => {
    const store = createStore({
      select: 0,
      ignored: 1,
    })

    const renderSpy = vi.fn()
    function Comp() {
      const storeVal = useSelector(store, (state) => state.select)
      renderSpy()

      return (
        <div>
          <p>Number rendered: {renderSpy.mock.calls.length}</p>
          <p>Store: {storeVal}</p>
          <button
            type="button"
            onClick={() =>
              store.setState((v) => ({
                ...v,
                select: 10,
              }))
            }
          >
            Update select
          </button>
          <button
            type="button"
            onClick={() =>
              store.setState((v) => ({
                ...v,
                ignored: 10,
              }))
            }
          >
            Update ignored
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)
    expect(getByText('Store: 0')).toBeInTheDocument()
    expect(getByText('Number rendered: 1')).toBeInTheDocument()

    await user.click(getByText('Update select'))

    await waitFor(() => expect(getByText('Store: 10')).toBeInTheDocument())
    expect(getByText('Number rendered: 2')).toBeInTheDocument()

    await user.click(getByText('Update ignored'))
    expect(getByText('Number rendered: 2')).toBeInTheDocument()
  })

  it('useSelector allows specifying a custom equality function', async () => {
    const store = createStore({
      array: [
        { select: 0, ignore: 1 },
        { select: 0, ignore: 1 },
      ],
    })

    function deepEqual<T>(objA: T, objB: T) {
      return JSON.stringify(objA) === JSON.stringify(objB)
    }

    const renderSpy = vi.fn()
    function Comp() {
      const storeVal = useSelector(
        store,
        (state) => state.array.map(({ ignore, ...rest }) => rest),
        { compare: deepEqual },
      )
      renderSpy()

      const value = storeVal
        .map((item) => item.select)
        .reduce((total, num) => total + num, 0)

      return (
        <div>
          <p>Number rendered: {renderSpy.mock.calls.length}</p>
          <p>Store: {value}</p>
          <button
            type="button"
            onClick={() =>
              store.setState((v) => ({
                array: v.array.map((item) => ({
                  ...item,
                  select: item.select + 5,
                })),
              }))
            }
          >
            Update select
          </button>
          <button
            type="button"
            onClick={() =>
              store.setState((v) => ({
                array: v.array.map((item) => ({
                  ...item,
                  ignore: item.ignore + 2,
                })),
              }))
            }
          >
            Update ignored
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)
    expect(getByText('Store: 0')).toBeInTheDocument()
    expect(getByText('Number rendered: 1')).toBeInTheDocument()

    await user.click(getByText('Update select'))

    await waitFor(() => expect(getByText('Store: 10')).toBeInTheDocument())
    expect(getByText('Number rendered: 2')).toBeInTheDocument()

    await user.click(getByText('Update ignored'))
    expect(getByText('Number rendered: 2')).toBeInTheDocument()
  })

  it('useSelector works with mounted derived stores', async () => {
    const store = createStore(0)
    const derived = createStore(() => ({ val: store.state * 2 }))

    function Comp() {
      const derivedVal = useSelector(derived, (state) => state.val)

      return (
        <div>
          <p>Derived: {derivedVal}</p>
          <button type="button" onClick={() => store.setState((v) => v + 1)}>
            Update select
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)
    expect(getByText('Derived: 0')).toBeInTheDocument()

    await user.click(getByText('Update select'))

    await waitFor(() => expect(getByText('Derived: 2')).toBeInTheDocument())
  })
})

describe('useStore', () => {
  it('is a compatibility alias for useSelector', async () => {
    const store = createStore(0)

    function Comp() {
      const value = useStore(store, (state) => state)

      return (
        <div>
          <p>Value: {value}</p>
          <button
            type="button"
            onClick={() => store.setState((prev) => prev + 1)}
          >
            Update
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)

    expect(getByText('Value: 0')).toBeInTheDocument()

    await user.click(getByText('Update'))

    await waitFor(() => expect(getByText('Value: 1')).toBeInTheDocument())
  })

  it('supports atom sources through the deprecated alias', async () => {
    const atom = createAtom(0)

    function Comp() {
      const value = useStore(atom, (state) => state)

      return (
        <div>
          <p>Value: {value}</p>
          <button type="button" onClick={() => atom.set((prev) => prev + 1)}>
            Update
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)

    expect(getByText('Value: 0')).toBeInTheDocument()

    await user.click(getByText('Update'))

    await waitFor(() => expect(getByText('Value: 1')).toBeInTheDocument())
  })
})

describe('_useStore', () => {
  it('returns selected state and actions for stores with actions', async () => {
    const store = createStore({ count: 0 }, ({ setState }) => ({
      inc: () => setState((prev) => ({ count: prev.count + 1 })),
    }))

    function Comp() {
      const [count, { inc }] = _useStore(store, (state) => state.count)

      return (
        <div>
          <p>Count: {count}</p>
          <button type="button" onClick={() => inc()}>
            Inc
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)
    expect(getByText('Count: 0')).toBeInTheDocument()

    await user.click(getByText('Inc'))

    await waitFor(() => expect(getByText('Count: 1')).toBeInTheDocument())
  })

  it('returns selected state and setState for plain stores', async () => {
    const store = createStore(0)

    function Comp() {
      const [value, setState] = _useStore(store, (state) => state)

      return (
        <div>
          <p>Value: {value}</p>
          <button type="button" onClick={() => setState((prev) => prev + 1)}>
            Inc
          </button>
        </div>
      )
    }

    const { getByText } = render(<Comp />)
    expect(getByText('Value: 0')).toBeInTheDocument()

    await user.click(getByText('Inc'))

    await waitFor(() => expect(getByText('Value: 1')).toBeInTheDocument())
  })
})

describe('shallow', () => {
  test('should return true for shallowly equal objects', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = { a: 1, b: 'hello' }
    expect(shallow(objA, objB)).toBe(true)
  })

  test('should return false for objects with different values', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = { a: 2, b: 'world' }
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return false for objects with different keys', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = { a: 1, c: 'world' }
    // @ts-expect-error
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return false for objects with different structures', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = [1, 'hello']
    // @ts-expect-error
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return false for one object being null', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = null
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return false for one object being undefined', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = undefined
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return true for two null objects', () => {
    const objA = null
    const objB = null
    expect(shallow(objA, objB)).toBe(true)
  })

  test('should return false for objects with different types', () => {
    const objA = { a: 1, b: 'hello' }
    const objB = { a: '1', b: 'hello' }
    // @ts-expect-error
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return true for shallow equal objects with symbol keys', () => {
    const sym = Symbol.for('key')
    const objA = { [sym]: 1 }
    const objB = { [sym]: 1 }
    expect(shallow(objA, objB)).toBe(true)
  })

  test('should return false for shallow different values for symbol keys', () => {
    const sym = Symbol.for('key')
    const objA = { [sym]: 1 }
    const objB = { [sym]: 2 }
    expect(shallow(objA, objB)).toBe(false)
  })

  test('should return true for non-enumerable keys', () => {
    const objA = {}
    const objB = {}

    Object.defineProperty(objA, 'a', {
      enumerable: false,
      value: 1,
    })

    Object.defineProperty(objB, 'a', {
      enumerable: false,
      value: 2,
    })

    expect(shallow(objA, objB)).toBe(true)
  })
})
