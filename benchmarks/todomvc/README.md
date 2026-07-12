# TodoMVC benchmark

The canonical app-shaped comparison: the SAME TodoMVC (uncontrolled inputs,
keyed filtered list, inline editing, footer/filters) implemented faithfully and
idiomatically in seven frameworks, driven through identical Speedometer-style
scripted interactions, with the DOM verified after every timed sample.

Unlike the js-framework rows suite (synthetic table churn), TodoMVC is made of
the shapes real apps are made of — forms, conditional sections, per-item edit
state — which makes it the primary vehicle for the **app-code size**
comparison: the `bundle-size` suite builds these apps too (ops prefixed
`todo_`), and the octane source is in the `codegen-size` corpus.

## Columns

| app           | port | notes                                                                 |
| ------------- | ---- | --------------------------------------------------------------------- |
| `octane-tsrx` | 5240 | `.tsrx` directives; immutable `useState` updates                      |
| `react`       | 5241 | React 19; `flushSync` per handler (sync commit inside the timed window) |
| `solid`       | 5242 | Solid 2.0-beta; `flush()` per handler; class STRINGS (beta `classList` is inert) |
| `ripple`      | 5243 | deriveds are FUNCTIONS called in template expressions (fine-grained: the body runs once — a setup-time `const` freezes) |
| `vue-vapor`   | 5244 | Vapor SFC; `window.__benchFlush = () => nextTick()` (no public sync flush) |
| `preact`      | 5261 | Preact core/hooks; `flushSync` commits each handler inside the timed window |
| `svelte`      | 5272 | Svelte 5 runes; `flushSync` commits each handler inside the timed window |

## DOM contract (shared by every app)

`.todoapp > .header > .new-todo` (Enter adds; uncontrolled — handlers read
`e.target.value`), `.main > .toggle-all` + `.todo-list li` (`.toggle`,
`label` [dblclick → edit], `.destroy`; `li.completed` / `li.editing`; `.edit`
input: Enter commits, Escape cancels, blur commits), `.footer > .todo-count
strong`, `.filters a[data-filter=all|active|completed]` (`.selected`),
`.clear-completed` (only when any completed). Filters are plain state — no
routing, no storage, no PRNG: fully deterministic.

## Ops (each a batch of real dispatched events, verified after the timer)

- `add100` — 100 × (set `.new-todo` value + keydown Enter), from empty
- `toggleAllOn` / `toggleAllOff` — `.toggle-all` click at 100 items
- `complete25` — 25 individual `.toggle` clicks (every 4th item)
- `filterCycle` — active → completed → all at 75/25 split
- `edit10` — dblclick label, set `.edit`, Enter — first 10 items
- `clearCompleted` — at 75/25 split
- `destroy25` — 25 first-item `.destroy` clicks
- `comments_100` — comment-node DOM weight at 100 mounted todos (marker-elision
  tripwire, deterministic)

Timing protocol matches ../js-framework/run.mjs: interactions dispatch inside
one `page.evaluate`, frameworks commit synchronously in the window (or via the
awaited `__benchFlush` hook), `--expose-gc` + a gc() before each sample.

React's column runs its dev-mode transform under the vite dev server (same as
the js-framework react column) — compare react-to-react across commits, not
react-to-compiled-frameworks absolute.

The target matrix also includes native **Preact** on `:5261` and runes-mode
**Svelte 5** on `:5272`. Both preserve the same native input/change semantics,
uncontrolled edit fields, keyed todo identity, and DOM-only harness contract.

## Run

```bash
node benchmarks/bench.mjs todomvc            # via the suite runner (starts servers)
node benchmarks/bench.mjs --quick todomvc    # reduced smoke pass
```
