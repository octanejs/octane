# @octanejs/tanstack-virtual

[TanStack Virtual](https://tanstack.com/virtual) for the [octane](https://github.com/octanejs/octane) UI framework.

TanStack Virtual separates a framework-agnostic core (`@tanstack/virtual-core`:
the `Virtualizer` + scroll/rect observers + all windowing math) from a small
React adapter (`useVirtualizer`, `useWindowVirtualizer`). This package reuses
the core unchanged (re-exported verbatim) and transcribes only the adapter onto
octane's hooks, preserving upstream's exact shape — a force-update reducer
wired into the instance's `onChange` (`flushSync` for sync scroll notifies), a
create-once `Virtualizer`, options re-composed every render, and the
`_didMount`/`_willUpdate` layout-effect lifecycle. The public surface matches
`@tanstack/react-virtual` 1:1 — existing code works by changing the import.

```tsx
// before
import { useVirtualizer } from '@tanstack/react-virtual';
// after
import { useVirtualizer } from '@octanejs/tanstack-virtual';

function List() @{
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: 10000,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
  });
  <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
    <div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
      @for (const item of virtualizer.getVirtualItems(); key item.key) {
        <div
          ref={virtualizer.measureElement}
          data-index={item.index}
          style={{
            position: 'absolute',
            top: '0px',
            left: '0px',
            width: '100%',
            transform: 'translateY(' + item.start + 'px)',
          }}
        >
          {'Row ' + item.index}
        </div>
      }
    </div>
  </div>
}
```

## Entry points

| import | what you get | notes |
| --- | --- | --- |
| `@octanejs/tanstack-virtual` | everything `@tanstack/virtual-core` exports + `useVirtualizer`, `useWindowVirtualizer` (+ `ReactVirtualizer`/`ReactVirtualizerOptions` types) | core verbatim + the octane-bound adapter (single entry, mirroring upstream) |

## How it works

`useVirtualizer` is a line-for-line transcription of the upstream adapter: the
`Virtualizer` instance is created once, a force-update reducer is wired into
its `onChange` (sync scroll notifies go through octane's `flushSync`), options
are re-composed into the instance during every render, and the
`_didMount`/`_willUpdate` lifecycle runs in layout effects. Dynamic measurement
works React-19 style: `ref={virtualizer.measureElement}` on item elements (a
member-expression callback ref). The experimental `directDomUpdates` surface is
ported verbatim.

One octane nuance (consumer-invisible, pinned by tests): octane's `flushSync`
called while a flush is already on the stack — e.g. a scroll dispatched from
inside a click handler — degrades to a plain call drained by the ambient
flush, so the update lands at that flush's boundary instead of nested.

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as
the last argument of every `use*` call. The hooks here forward that slot into
their composed base hooks, so two virtualizers in one component stay
independent, exactly like in React.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
