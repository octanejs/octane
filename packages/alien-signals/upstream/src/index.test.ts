import { GlobalRegistrator } from "@happy-dom/global-registrator";
import * as matchers from "@testing-library/jest-dom/matchers";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, jest } from "bun:test";
import { createElement, startTransition, StrictMode } from "react";
import { renderToString } from "react-dom/server";

import {
  batch,
  createComputed,
  createEffect,
  createSignal,
  createSignalScope,
  trigger,
  useComputed,
  useDeferredSignalValue,
  useSetSignal,
  useSignal,
  useSignalEffect,
  useSignalInsertionEffect,
  useSignalLayoutEffect,
  useSignalPassiveEffect,
  useSignalScope,
  useSignalSelector,
  useSignalValue,
} from ".";

// Register Happy DOM environment and jest-dom matchers
GlobalRegistrator.register();
expect.extend(matchers);

afterEach(() => {
  cleanup();
});

describe("Alien React Library", () => {
  /* ------------------------------------------------------------------
   *  1) BASIC & COMPUTED SIGNALS
   * ------------------------------------------------------------------ */
  it("should create a writable signal", () => {
    const mySignal = createSignal(0);
    expect(mySignal()).toBe(0);

    mySignal(10);
    expect(mySignal()).toBe(10);
  });

  it("should create and update a computed signal", () => {
    const countSignal = createSignal(1);
    const doubleSignal = createComputed(() => countSignal() * 2);

    expect(doubleSignal()).toBe(2);

    countSignal(2);
    expect(doubleSignal()).toBe(4);

    // Another update
    countSignal(3);
    expect(doubleSignal()).toBe(6);
  });

  /* ------------------------------------------------------------------
   *  2) EFFECTS & SCOPES
   * ------------------------------------------------------------------ */
  it("should create and run an effect", () => {
    const countSignal = createSignal(1);
    let observed = 0;

    createEffect(() => {
      observed = countSignal();
    });

    expect(observed).toBe(1);

    countSignal(2);
    expect(observed).toBe(2);
  });

  it("should create a signal scope", () => {
    let value = 0;
    const stopScope = createSignalScope(() => {
      createEffect(() => {
        value = 99;
      });
    });
    expect(stopScope).toBeDefined();

    expect(value).toBe(99);

    stopScope(); // stop the scope
  });

  /* ------------------------------------------------------------------
   *  3) REACT HOOKS
   * ------------------------------------------------------------------ */
  it("useSignal should return [value, setter]", () => {
    const countSignal = createSignal(0);
    const { result } = renderHook(() => useSignal(countSignal));
    const [count, setCount] = result.current;

    expect(count).toBe(0);
    act(() => setCount(10));
    expect(result.current[0]).toBe(10);
  });

  it("useSignalValue should return read-only value from a signal", () => {
    const countSignal = createSignal(0);
    const { result } = renderHook(() => useSignalValue(countSignal));

    expect(result.current).toBe(0);
    act(() => countSignal(5));
    expect(result.current).toBe(5);
  });

  it("useSetSignal should return setter only", () => {
    const countSignal = createSignal(0);
    const { result } = renderHook(() => useSetSignal(countSignal));

    act(() => {
      result.current(10);
    });
    expect(countSignal()).toBe(10);

    // Functional update
    act(() => {
      result.current((prev) => prev + 5);
    });
    expect(countSignal()).toBe(15);
  });

  it("useSignalEffect should register an effect in React", () => {
    const countSignal = createSignal(0);
    const effectFn = jest.fn(() => {
      countSignal(); // track
    });

    renderHook(() => useSignalEffect(effectFn));
    expect(effectFn).toHaveBeenCalledTimes(1);

    act(() => countSignal(5));
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  it("useSignalScope should create and manage an effect scope in React", () => {
    const { result, unmount } = renderHook(() => useSignalScope(() => {}));
    expect(result.current).toBeDefined();
    unmount(); // triggers scope stopper internally
  });

  it("useComputed should return a computed value", () => {
    const countSignal = createSignal(0);
    const { result } = renderHook(() =>
      useComputed(() => countSignal() * 2, []),
    );

    expect(result.current).toBe(0);
    act(() => countSignal(5));
    expect(result.current).toBe(10);
  });

  /* ------------------------------------------------------------------
   *  4) ADVANCED SIGNAL SCENARIOS
   * ------------------------------------------------------------------ */
  it("should handle nested signal updates correctly", () => {
    const outerSignal = createSignal(1);
    const innerSignal = createSignal(2);
    const computedSignal = createComputed(() => outerSignal() * innerSignal());

    expect(computedSignal()).toBe(2); // 1 * 2

    act(() => {
      outerSignal(2);
      innerSignal(3);
    });
    expect(computedSignal()).toBe(6); // 2 * 3
  });

  it("should handle signal updates within effects", () => {
    const countSignal = createSignal(0);
    const doubleSignal = createSignal(0);

    createEffect(() => {
      doubleSignal(countSignal() * 2);
    });

    expect(doubleSignal()).toBe(0);

    act(() => {
      countSignal(5);
    });
    expect(doubleSignal()).toBe(10);
  });

  it("should properly cleanup effects when scope is stopped", () => {
    const countSignal = createSignal(0);
    let effectRuns = 0;

    const stopScope = createSignalScope(() => {
      createEffect(() => {
        countSignal(); // track
        effectRuns++;
      });
    });

    expect(effectRuns).toBe(1);

    act(() => {
      countSignal(1);
    });
    expect(effectRuns).toBe(2);

    stopScope(); // Stop all effects in scope

    act(() => {
      countSignal(2);
    });
    expect(effectRuns).toBe(2); // Should not increase after scope is stopped
  });

  /* ------------------------------------------------------------------
   *  5) REACT HOOK EDGE CASES
   * ------------------------------------------------------------------ */
  it("useSignal should handle functional updates correctly", () => {
    const countSignal = createSignal(0);
    const { result } = renderHook(() => useSignal(countSignal));
    const [, setCount] = result.current;

    act(() => {
      setCount((prev) => prev + 1);
      setCount((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(2);
  });

  it("useComputed should update when dependencies change", () => {
    const countSignal = createSignal(0);
    const multiplierSignal = createSignal(2);

    const { result } = renderHook(() =>
      useComputed(() => countSignal() * multiplierSignal(), []),
    );

    expect(result.current).toBe(0);

    act(() => {
      countSignal(5);
    });
    expect(result.current).toBe(10);

    act(() => {
      multiplierSignal(3);
    });
    expect(result.current).toBe(15);
  });

  it("useComputed should not enter a render loop after a dependency update", () => {
    const countSignal = createSignal(0);
    let renders = 0;

    const { result } = renderHook(() => {
      renders++;

      if (renders > 20) {
        throw new Error("Infinite render loop");
      }

      return useComputed(() => ({ count: countSignal() }), []);
    });

    expect(result.current).toEqual({ count: 0 });

    act(() => {
      countSignal(1);
    });

    expect(result.current).toEqual({ count: 1 });
    expect(renders).toBe(2);
  });

  it("useComputed should reuse the computed across re-renders when deps are unchanged", () => {
    const sig = createSignal(1);
    let getterCalls = 0;

    const { result, rerender } = renderHook(() =>
      useComputed(() => {
        getterCalls++;
        return sig() * 2;
      }, []),
    );

    expect(result.current).toBe(2);
    const callsAfterMount = getterCalls;

    rerender();
    rerender();
    rerender();

    // If `useMemo` deps were wrapped (e.g. `[deps]` instead of `deps`),
    // the computed would be rebuilt every render and the getter would
    // run again on each re-read.
    expect(getterCalls).toBe(callsAfterMount);
    expect(result.current).toBe(2);
  });

  it("useComputed should rebuild the computed when deps change", () => {
    const sig = createSignal(1);
    let getterCalls = 0;

    const { result, rerender } = renderHook(
      ({ offset }: { offset: number }) =>
        useComputed(() => {
          getterCalls++;
          return sig() + offset;
        }, [offset]),
      { initialProps: { offset: 10 } },
    );

    expect(result.current).toBe(11);
    const callsAfterFirst = getterCalls;

    rerender({ offset: 20 });

    expect(result.current).toBe(21);
    expect(getterCalls).toBeGreaterThan(callsAfterFirst);
  });

  it("useSignalEffect should handle cleanup correctly", () => {
    const countSignal = createSignal(0);
    const cleanupFn = jest.fn();

    const { unmount } = renderHook(() =>
      useSignalEffect(() => {
        countSignal(); // track
        return cleanupFn;
      }),
    );

    act(() => {
      countSignal(1);
    });
    expect(cleanupFn).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanupFn).toHaveBeenCalledTimes(2);
  });

  /* ------------------------------------------------------------------
   *  6) PERFORMANCE & EFFICIENCY TESTS
   * ------------------------------------------------------------------ */
  it("should handle signal updates correctly", () => {
    const signal = createSignal({ a: 1, b: 2 });

    const { result } = renderHook(() => useSignal(signal));

    // Initial value check
    expect(result.current[0]).toEqual({ a: 1, b: 2 });

    // Update value
    act(() => {
      result.current[1]({ a: 2, b: 2 });
    });

    // Check both the signal and the hook value
    expect(signal()).toEqual({ a: 2, b: 2 });
    expect(result.current[0]).toEqual({ a: 2, b: 2 });
  });

  it("should handle multiple signal updates", () => {
    const signal = createSignal(0);
    const effectFn = jest.fn();

    renderHook(() =>
      useSignalEffect(() => {
        signal();
        effectFn();
      }),
    );

    expect(effectFn).toHaveBeenCalledTimes(1);

    // Multiple updates
    act(() => {
      signal(1);
      signal(2);
      signal(3);
    });

    expect(effectFn).toHaveBeenCalledTimes(4); // Initial + 3 updates
  });

  /* ------------------------------------------------------------------
   *  7) EDGE CASES & ERROR HANDLING
   * ------------------------------------------------------------------ */
  it("should handle undefined/null signal values", () => {
    const signal = createSignal<number | undefined | null>(123);
    const { result } = renderHook(() => useSignal(signal));

    act(() => {
      result.current[1](undefined);
    });
    expect(result.current[0]).toBeUndefined();

    act(() => {
      result.current[1](null);
    });
    expect(result.current[0]).toBe(null);
  });

  it("should handle computed dependencies correctly", () => {
    const a = createSignal(1);
    const b = createSignal(2);

    const computedA = createComputed(() => b() + 1);
    const computedB = createComputed(() => a() + 1);

    const { result } = renderHook(() =>
      useComputed(() => computedA() + computedB(), []),
    );
    expect(result.current).toBe(5); // (2 + 1) + (1 + 1)

    act(() => {
      a(2);
    });
    expect(result.current).toBe(6); // (2 + 1) + (2 + 1)
  });

  /* ------------------------------------------------------------------
   *  8) MEMORY MANAGEMENT & CLEANUP
   * ------------------------------------------------------------------ */
  it("should cleanup all subscriptions on unmount", () => {
    const signal = createSignal(0);
    const effectFn = jest.fn();
    let hook: any;

    act(() => {
      hook = renderHook(() => {
        useSignal(signal);
        useComputed(() => signal() * 2, []);
        useSignalEffect(() => {
          signal();
          effectFn();
        });
      });
    });

    expect(effectFn).toHaveBeenCalledTimes(1);

    // Unmount should cleanup all subscriptions
    hook.unmount();

    act(() => {
      signal(5);
    });
    expect(effectFn).toHaveBeenCalledTimes(1); // Should not increase after unmount
  });

  it("should handle multiple mount/unmount cycles", () => {
    const signal = createSignal(0);
    const effectFn = jest.fn();

    function mount() {
      return renderHook(() => {
        useSignalEffect(() => {
          signal();
          effectFn();
        });
      });
    }

    // Multiple mount/unmount cycles
    const hook1 = mount();
    expect(effectFn).toHaveBeenCalledTimes(1);

    hook1.unmount();
    const hook2 = mount();
    expect(effectFn).toHaveBeenCalledTimes(2);

    hook2.unmount();
    expect(effectFn).toHaveBeenCalledTimes(2);
  });

  /* ------------------------------------------------------------------
   *  9) CONCURRENT MODE COMPATIBILITY
   * ------------------------------------------------------------------ */
  it("should handle concurrent updates correctly", async () => {
    const signal = createSignal(0);
    const effectFn = jest.fn();

    const { result } = renderHook(() => {
      useSignalEffect(() => {
        signal();
        effectFn();
      });
      return useSignal(signal);
    });

    // Perform multiple updates concurrently in a single batched act call
    await act(async () => {
      await Promise.all([
        Promise.resolve().then(() => result.current[1](1)),
        Promise.resolve().then(() => result.current[1](2)),
        Promise.resolve().then(() => result.current[1](3)),
        Promise.resolve().then(() => result.current[1](4)),
      ]);
    });

    expect(signal()).toBe(4);
  });

  describe("Alien Signals 3 and React 19.2 integration", () => {
    it("lets React automatically batch multiple signal notifications into one render", () => {
      const first = createSignal(0);
      const second = createSignal(0);
      let renders = 0;
      const hook = renderHook(() => {
        renders++;
        return [useSignalValue(first), useSignalValue(second)] as const;
      });

      act(() => {
        first(1);
        second(1);
        first(2);
      });

      expect(hook.result.current).toEqual([2, 1]);
      expect(renders).toBe(2);
    });

    it("batches multiple writes into one propagation", () => {
      const first = createSignal(1);
      const second = createSignal(2);
      const snapshots: number[] = [];
      const stop = createEffect(() => {
        snapshots.push(first() + second());
      });

      batch(() => {
        first(10);
        second(20);
      });

      expect(snapshots).toEqual([3, 30]);
      stop();
    });

    it("manually triggers dependents after an in-place mutation", () => {
      const items = createSignal<number[]>([]);
      const size = createComputed(() => items().length);

      expect(size()).toBe(0);
      items().push(1);
      expect(size()).toBe(0);
      trigger(items);
      expect(size()).toBe(1);
    });

    it("shares a source safely across multiple React subscribers", () => {
      const count = createSignal(0);
      const first = renderHook(() => useSignalValue(count));
      const second = renderHook(() => useSignalValue(count));
      const third = renderHook(() => useSignalValue(count));

      act(() => count(1));
      expect(first.result.current).toBe(1);
      expect(second.result.current).toBe(1);
      expect(third.result.current).toBe(1);

      second.unmount();
      act(() => count(2));
      expect(first.result.current).toBe(2);
      expect(third.result.current).toBe(2);

      first.unmount();
      act(() => count(3));
      expect(third.result.current).toBe(3);
      third.unmount();
    });

    it("skips React renders when a selected signal slice is unchanged", () => {
      const state = createSignal({ selected: 1, unrelated: 1 });
      const select = (value: { selected: number; unrelated: number }) => value.selected;
      let renders = 0;
      const hook = renderHook(() => {
        renders++;
        return useSignalSelector(state, select);
      });

      act(() => state({ selected: 1, unrelated: 2 }));
      expect(hook.result.current).toBe(1);
      expect(renders).toBe(1);

      act(() => state({ selected: 2, unrelated: 2 }));
      expect(hook.result.current).toBe(2);
      expect(renders).toBe(2);
    });

    it("does not create a signal scope during server rendering", () => {
      const callback = jest.fn();

      function ServerComponent() {
        useSignalScope(callback, []);
        return null;
      }

      renderToString(createElement(ServerComponent));
      expect(callback).not.toHaveBeenCalled();
    });

    it("keeps snapshots consistent when a signal write occurs in a transition", () => {
      const count = createSignal(0);
      const hook = renderHook(() => useSignalValue(count), {
        wrapper: StrictMode,
      });

      act(() => {
        startTransition(() => count(1));
      });

      expect(hook.result.current).toBe(1);
    });

    it("offers a deferred snapshot without changing the source value", async () => {
      const count = createSignal(0);
      const hook = renderHook(() => ({
        current: useSignalValue(count),
        deferred: useDeferredSignalValue(count),
      }));

      act(() => count(1));
      expect(hook.result.current.current).toBe(1);

      await act(async () => {});
      expect(hook.result.current.deferred).toBe(1);
    });

    it("runs insertion, layout, and passive signal effects in React order", () => {
      const order: string[] = [];
      const source = createSignal(0);
      const dependencies = [source] as const;

      renderHook(() => {
        useSignalInsertionEffect(dependencies, () => {
          order.push("insertion");
        });
        useSignalLayoutEffect(dependencies, () => {
          order.push("layout");
        });
        useSignalPassiveEffect(dependencies, () => {
          order.push("passive");
        });
      });

      expect(order).toEqual(["insertion", "layout", "passive"]);

      act(() => source(1));
      expect(order).toEqual([
        "insertion",
        "layout",
        "passive",
        "insertion",
        "layout",
        "passive",
      ]);
    });

    it("cleans a manually stopped React scope exactly once", () => {
      const source = createSignal(0);
      const cleanupEffect = jest.fn();
      const hook = renderHook(() =>
        useSignalScope(() => {
          createEffect(() => {
            source();
            return cleanupEffect;
          });
        }, []),
      );

      act(() => hook.result.current());
      expect(cleanupEffect).toHaveBeenCalledTimes(1);
      hook.unmount();
      expect(cleanupEffect).toHaveBeenCalledTimes(1);
    });
  });
});
