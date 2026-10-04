# Skill: Migrate a module or app to Strong mode

Use this when a module or application should adopt Strong mode, or when Strong
compile errors (`OCTANE_STRONG_*`) appear and need fixing. Strong mode is an
opt-in compile-time contract: render reads immutable snapshots and has no side
effects, and the compiler takes over memoization. `"use strong"` before a
module's imports enables it for that module; `compiler: { strong: true }` in
`octane.config.ts` enables it for every application module.

Look up any code with the `octane_strong_explain` tool (`code` accepts
`OCTANE_STRONG_RENDER_REF_READ` or `RENDER_REF_READ`; no arguments returns the
index). It returns what the code detects, the replacement, the docs URL, and
before/after recipes. `octane explain <CODE>` prints the code's entry in a
terminal. Reference: https://octanejs.dev/docs/strong-mode

## Workflow

1. **Take inventory.** Run `octane analyze --strong-preview`. It compiles every
   module as if it were Strong and reports the findings by code without failing
   the run. Note which modules are already clean and which idioms dominate.
2. **Apply the mechanical rewrites.** Run `octane analyze --strong-preview --fix`
   (add `--dry-run` to preview). It rewrites React's lazy ref initialization to
   `useLazyRef` and `useMemo`/`useCallback` to plain declarations. Without
   `--strong-preview`, `--fix` only rewrites modules that are already Strong.
   Review the diff and run the tests before going further.
3. **Opt in one module.** Put `"use strong"` at the top of the file, before
   imports. A `.tsx` file keeps a leading `@jsxImportSource` pragma first and
   needs `jsxImportSource: octane/strong` (tsconfig or pragma) for Strong JSX
   types; `.tsrx` selects them automatically. Start with modules the preview
   reported clean, then leaf components, then their parents.
4. **Fix each finding by code.** `octane analyze <file>` lists every finding in
   the file, not only the first error. For each code, call
   `octane_strong_explain` and apply its replacement or recipe. A finding's
   suggestions may carry source edits; apply them as one unit. On the hosted
   server, `octane_compile` with `strong: true` returns every finding with its
   suggestions and docs link. Narrow a run with `--code <CODE>`.
5. **Verify behavior.** Run the module's tests and typecheck (`octane-tsc` for
   programs with `.tsrx`). Rewrites that change timing, such as an effect
   becoming `useLinkedState` or `useLayoutSnapshot`, need a test that drives the
   real interaction: prop change, resize, slow request, or unmount.
6. **Keep what you converted.** Run `octane analyze --strong-baseline init`
   once to write `octane-strong-baseline.json`, the modules still allowed to be
   non-Strong. While it exists, a module leaving Strong mode or a new
   non-Strong module fails `octane analyze`
   (`OCTANE_STRONG_COVERAGE_REGRESSION`). Run
   `octane analyze --strong-baseline update` as modules convert; it only
   removes names.
7. **Switch the app on.** When every application module is Strong, set
   `compiler: { strong: true }` in `octane.config.ts` so new modules are Strong
   without the directive. Dependencies and other workspace packages keep their
   own mode.

## React idiom to Strong replacement

| React idiom | Strong replacement | Codes |
| --- | --- | --- |
| `if (ref.current === null) ref.current = create()` | `const ref = useLazyRef(() => create())` (`lazy-ref`) | `OCTANE_STRONG_RENDER_REF_READ`, `OCTANE_STRONG_RENDER_REF_WRITE` |
| `useLayoutEffect(() => setWidth(el.current.offsetWidth))` | `const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 })` (`layout-measurement`) | `OCTANE_STRONG_EFFECT_STATE_UPDATE` |
| `ref={(el) => { if (el) setWidth(el.offsetWidth); }}` | `ref={el}` and `const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 })` (`ref-measurement`) | `OCTANE_STRONG_REF_STATE_UPDATE` |
| `useMemo(() => value, deps)` / `useCallback(fn, deps)` | `const value = …` / `const fn = …` (`manual-memo`) | `OCTANE_STRONG_MANUAL_MEMO` |
| `latest.current = onTick` read from an effect | `const tick = useEffectEvent(onTick)` (`latest-ref`) | `OCTANE_STRONG_RENDER_REF_WRITE` |
| `useEffect(() => setName(user.name))` | `useLinkedState(user.id, () => user.name)` (`prop-state`) | `OCTANE_STRONG_EFFECT_STATE_UPDATE` |
| `window.innerWidth` and other browser reads in render | `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` (`browser-state`) | `OCTANE_STRONG_RENDER_AMBIENT_READ` |
| `'field-' + Math.random()` | `useId()` (`random-id`) | `OCTANE_STRONG_RENDER_IMPURE_CALL` |
| `load(id).then(setData)` in an effect | an `ignore` flag or `AbortController` released in cleanup, or `use()` (`effect-fetch`) | `OCTANE_STRONG_EFFECT_DATA_FETCH` |
| `useReducer((x) => x + 1, 0)` force update | `useSyncExternalStore(store.subscribe, store.get, store.get)` (`force-update`) | `OCTANE_STRONG_WRITE_ONLY_STATE` |
| `dangerouslySetInnerHTML={{ __html: html }}` | `dangerouslySetInnerHTML={trustHTML(sanitize(html))}` (`trusted-html`) | `OCTANE_STRONG_UNTRUSTED_HTML` |

The id in parentheses is the `recipe` argument for `octane_strong_explain`.
Omit effect dependency arrays: they are inferred, and a conflicting explicit
array is an error (`OCTANE_STRONG_EXPLICIT_DEPENDENCIES` is only a hint when
the array is equivalent).

## Fixes that are not fixes

Each of these makes an error disappear without making the code Strong. Do not
use them.

- **Deferring a state update to the same tick.** Moving a `setState` from
  effect setup into `queueMicrotask`, a zero-delay `setTimeout`,
  `startTransition`, `Promise.resolve().then`, or after `await null` still runs
  before the next paint and is still `OCTANE_STRONG_EFFECT_STATE_UPDATE`.
  Derive the value, use `useLinkedState`, or render from `useLayoutSnapshot`.
- **Moving the update into a callback ref.** Octane calls a host element's
  callback ref while the element commits, before paint, so
  `ref={(el) => setWidth(el.offsetWidth)}` or `ref={setNode}` is
  `OCTANE_STRONG_REF_STATE_UPDATE`. Keep the element in a ref object and render
  a measurement from `useLayoutSnapshot`.
- **Suppression comments.** There are none. `suppressHydrationWarning` and
  `suppressNativeChangeWarning` on DOM elements are themselves Strong errors
  (`OCTANE_STRONG_SUPPRESSION_PROP`).
- **Removing `"use strong"` or turning `compiler.strong` off** to make errors
  go away. The baseline reports it as `OCTANE_STRONG_COVERAGE_REGRESSION`;
  leaving a module non-Strong is a reviewed decision, not a fix.
- **Moving code to a compatibility module or package to dodge a check.** Only
  code that genuinely needs live accessors during render (a third-party
  integration reading mutable state, for example) belongs there, and it should
  pass an immutable snapshot into the Strong component.
- **Hiding an impure read behind a helper.** `"use strong"` is an author
  assertion: the analysis assumes an unknown call is pure, and production
  client builds memoize render work on that assumption. A `Date.now()`, ref
  read, state getter, or live store read inside a helper compiles and then
  renders stale output.
- **Replacing `useMemo` with a hand-rolled cache** in a ref or module variable.
  Write the plain `const`; Strong compilation caches it.
