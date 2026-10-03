# octane

## 0.8.0

### Minor Changes

- 53db436: `'use dom bindings'` views can now drive whole islands without the renderer:

  - Imported signal reads (`count$.get()`, `count$.latest(fallback)`) in projections, branch tests, lists and setup or block `const` declarations subscribe instead of raising an activation diagnostic. A pending read keeps the last DOM until its source changes.
  - `@try`/`@pending`/`@catch` compile into binding programs, select their arm like the renderer, adopt whichever arm the server rendered, and claim a boundary that is still streaming.
  - `useLayoutEffect(callback, [])` and `useEffect(callback, [])` run once after a view activates and clean up when it leaves.
  - An independent `<Hydrate>` whose only child is a prop-less, zero-argument binding view imported from a `.tsrx` module activates through that view's program, so its chunk no longer loads the renderer. Other islands keep the renderer activator.
  - A live binding over signals whose owner retires, as a document's signals do when the page is left, now stops quietly with its last DOM instead of throwing.
- 3e3749d: Let `interaction({ events })` opt into `pointermove` and `pointercancel`, so a deferred boundary woken by a press can replay whether that press moved, was released, or was cancelled by the browser before hydration finished.

  Both events only extend an interaction that another selected event already captured: they never start hydration or prefetch on their own, so selecting `pointermove` does not make a boundary hydrate on hover. Octane registers their document listeners only after a boundary that selects one captures intent, so pages that do not opt in never listen for pointer movement. The default `interaction()` events are unchanged.

  Capture no longer cancels the native default of a captured `pointerup` or `pointermove`, matching how it already treats `pointerdown`.
- 950ef0b: Development server renders now report the client work an islands-only shell actually renders. The Vite dev server renders a `hydrate: 'islands'` route with the new `shellWitness` render option and warns once per site when the shell, outside its independent `<Hydrate>` islands, renders an event handler or function form action, a ref, an effect or store-subscription hook, a controlled `value` or `checked` the user can edit, or a live signal-handle binding. None of these would run, because the shell's modules never load in the browser.

  The report follows the render rather than the source, so it also catches what the build's source check cannot follow: components passed by reference, local aliases, handlers and refs passed through spreads, and elements a plain helper creates with `createElement`. It covers only the branches, rows, and streamed boundaries a request reaches. The route keeps serving either way, and the production build check is unchanged.

  `renderToString`, `renderToReadableStream`, and the other server renderers accept `shellWitness` in development. Production renders ignore it at no cost, and the production compiler output is unchanged.
- dc4800b: Strong mode now requires state updaters and reducers to be pure
  (`OCTANE_STRONG_IMPURE_UPDATER`). Octane evaluates queued updaters and reducers
  while their owner renders and can call them more than once: a transition
  update is evaluated when it is staged and again when the transition renders,
  and an urgent update made while a transition is held is rebased onto the held
  value. A `useState` or `useLinkedState` updater, a `useReducer` reducer, or a
  `useOptimistic` reducer that calls `fetch`, schedules a timer, microtask, or
  promise callback, updates state, calls a state getter or Effect Event, touches
  `useRef.current`, reads a browser global or reassigned module variable, or
  calls `Date.now()`, `Math.random()`, `performance.now()`, or `new Date()` is a
  compile error. Inline functions, local and same-module declarations, and
  synchronous helpers are followed. Mutating the state an updater or reducer
  receives reports `OCTANE_STRONG_SNAPSHOT_MUTATION`. Do the work in the event
  handler and pass the result in. Compatibility mode is unchanged.
- dc4800b: Strong mode now rejects mutating a state value outside render
  (`OCTANE_STRONG_SNAPSHOT_MUTATION`): in event handlers, effects, cleanup,
  timer and promise callbacks, and local helpers that receive the value. Passing
  a mutated array back to its setter does not re-render, and copying only the
  outer object leaves identity-based consumers stale and rewrites the value that
  transitions and `useOptimistic` revert to. Pass a new value instead, such as
  `setItems([...items, item])`, or keep mutable objects in `useRef`. Array
  mutators are now also recognized on nested literal properties and on state
  initialized lazily or through `useReducer`, `Map` and `Set` mutators on state
  created with `new Map()` or `new Set()`, and `Object.assign`-style targets;
  render-time mutations keep `OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION`.
  Compatibility mode is unchanged.
- dc4800b: Strong mode now rejects a deferred state update computed from the same state's
  render snapshot (`OCTANE_STRONG_STALE_STATE_UPDATE`). After an `await`, or in a
  `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`,
  `queueMicrotask`, or promise callback, `setCount(count + 1)` can overwrite an
  update that happened in between. Locals computed from the snapshot before the
  `await`, copied aliases, and closures are followed. Use the updater form,
  `setCount((current) => current + 1)`, or read the latest value with the state
  getter. Synchronous handlers such as `onClick={() => setCount(count + 1)}`
  remain valid. Compatibility mode is unchanged.
- 752028d: Strong mode now rejects a `useSyncExternalStore` `getSnapshot` or
  `getServerSnapshot` that provably returns a new object or array on every call
  (`OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT`), such as a literal, a spread copy,
  `.map()`, `.filter()`, `Object.keys()`, a standard constructor, or a
  same-module function or local constant that allocates. Snapshots are compared
  with `Object.is`, so such a component warns in development and then renders
  until the update-depth limit throws. Return a value the store keeps, or read
  each field with its own `useSyncExternalStore` call. Compatibility mode is
  unchanged.
- dc4800b: Strong mode now rejects write-only state (`OCTANE_STRONG_WRITE_ONLY_STATE`): a
  state tuple whose value is elided, unused, or read only to compute its own next
  value, whose getter is unused, and whose setter is called or passed on. This is
  the force-update pattern, including `useReducer((x) => x + 1, 0)` and
  `useState(0)[1]`. It reads the external source during render and subscribes
  afterwards, so a change in between is never rendered. Subscribe with
  `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` instead.
  Compatibility mode is unchanged.
- 7422815: Universal renderers now ship host-binding and template-program code only when they use it. A Three scene's production bundle is about 5.2 KB gzip smaller.

  - `universalHostBinding()` installs the subscription, flush, and binding-only transaction code on its first call, so roots in an app that never creates a binding no longer carry it. Binding behavior is unchanged.
  - Template programs are now opt-in per driver. A driver's `templateProgramMount`, `templateProgramRuns`, and `collapsedTemplateMount` capabilities take effect only when the driver also sets `templates: universalHostTemplates`, a new export from `octane/universal` and `octane/universal/native`. A driver that declares these capabilities without it mounts and updates those trees through ordinary host commands. The Lynx background driver passes it.

### Patch Changes

- fbf6e40: Remove the server content left after a component's content during hydration. When the server rendered more in a component's range than the client renders there, the client adopted the matching prefix and kept the rest on screen without a report. This happened for a component whose identity differs on the client, for a hookless component in a renderable hole, and for a component that returns less on the client, including one rendered as a list item. Hydration now discards the stale remainder and reports it once through `onRecoverableError`, plus a located development warning. The nodes the client adopted keep their identity. To find where a multi-root template's roots end without parsing it in production, the compiler now passes the template's root count to `template()`.
- a50b846: When hydration adopts an element whose children are all component calls but
  the server rendered other content inside it, the first call now reports the
  server node it found in place of its range once, the element's server children
  are discarded, and the components are built inside the adopted element. A
  single-root component used to compare its template with the element itself,
  reporting that element, keeping the stale server children, and appending its
  output after them; a lite component removed the adopted element entirely. Later
  sibling calls in the same element no longer discard the rebuilt content of an
  earlier one, and an element the server left empty reports "nothing".
- 9ef7385: Fix a crash when a pending `<Hydrate>` boundary resumes a component that
  suspended inside content its parent opened in a server-rendered row.

  A deferred boundary's retry resumes the component that suspended before it
  renders the rest of the boundary. When a hookless sibling component followed
  that component, for example a later row of the same list, the retry picked the
  sibling instead and threw `TypeError: Cannot read properties of undefined
  (reading 'clear')` once the promise settled. The retry now resumes the
  component that suspended.
- 6ea582e: Hydrate a component call at a hole in an `@if` or `@switch` arm when the server rendered another arm with the same static roots, for a call that cannot render in place of one server node. The server node at the call's position is an element of the other arm, not the component's range. A keyed or dynamic call, or a component that renders several roots, a fragment, or nothing, left that element on screen. A call after one of the arm's adopted roots also deleted that root. A component with several roots in a development build lost the adopted node after the hole. The call now replaces exactly the server node at its position, the arm's adopted nodes keep their identity and keep updating, and hydration reports the mismatch once through `onRecoverableError`.
- 52c9d33: Discard the server content left after a hydrated `@if` or `@switch` arm that ends with a `@try` whose body throws on the client. The boundary builds its catch arm and leaves the hydration cursor on its own close marker, so the server components the server's longer arm rendered after it stayed on screen with no report. Hydration now looks past that marker, removes them, and reports one structural `onRecoverableError`.
- 8f8349b: Compile a bare-left `@for (item of items)` or `@for ({ id } of items)` header instead of crashing. Each row binds its own item, as a `let` header does, and shadows any outer name, on the DOM client, the server, hydration, split `<Hydrate>` boundaries, and the universal and Valdi renderers. A header that would assign an existing target, such as `@for (obj.x of items)`, now reports a located compile error.
- f355acd: Keep a binding island's server content and input while its client data is still loading at activation:

  - A `@try` in a `'use dom bindings'` view no longer replaces server-rendered content with `@pending` when the client's own read is still pending. Like the renderer's resolved boundary, the server content stays and hydrates in place when the read settles; its handlers and mount-only effects start with that commit. After the first commit, a later pending read shows `@pending` as before.
  - An island whose binding view suspends outside `@try` on its first render no longer loses input. Clicks captured before activation, and input that reaches the island before its data arrives, now wait for the first commit and then replay in order. Input held by an island that is disposed before it commits is dropped.
- 3ffd8cc: A `'use dom bindings'` view whose text leaf casts a signal handle to `number` (`{count$ as number}`, or a handle passed through props) now server-renders the handle's text, so `adoptBindings` can adopt its own SSR output instead of throwing a mismatched-topology error. The ordinary renderer hydrates the same output in place.
- 9350268: A DOM binding program, such as an island view, no longer ends silently on any error named `ScopeDisposedError`. It ends quietly and keeps its last DOM only when the owner of a source it observes retires. Observed sources are a tracked `.get()` read, a bound signal handle (concrete, declared, optimistic, or accepted by a transition), a whole-style or projected binding, and a bound control. A read of a different, already retired scope, or any error that only shares the name, is now reported through `reportError`. Like any other failure of a committed program, it keeps the last DOM and later updates still apply.
- 4212874: Keep the hydration range-marker validator out of apps that never call
  `hydrateRoot`. A dynamic `{x}` text hole that may hold a signal handle
  previously retained the binding-marker protocol in every client bundle, about
  600 B gzip. Adopting a binding view's server text range is now a hydration
  method, so client-only apps drop it. Hydration behavior is unchanged.
- f03d812: `'use dom bindings'` views may now declare no props parameter. A view that reads only module-scope signal handles, such as an island's state, compiles for `adoptBindings`, `mountBindings` and server rendering like a view with props. Views with more than one parameter are still rejected.
- 3315f74: Keep hydration aligned after a `@try`, `<ErrorBoundary>`, `@for`, or `<Activity>`. A `@try` or `<ErrorBoundary>` left the hydration cursor inside its own server range, so a following component with several roots in a body without a template, such as `<>@try {…}<Pair /></>`, did not find its server range: it was rendered a second time beside the server's copy and reported a false mismatch, even when the server and client rendered the same props. Every boundary, list, and activity now steps past its server range as components and branches do. This also lets an `@if` or `@switch` arm that ends with one of them find where its content ends, so elements or text that the server's longer arm rendered after it are removed and reported once instead of staying on screen without a report.
- f5896c6: Discard the server content that a hydrating `@if` or `@switch` arm leaves after its last component or nested branch. When the server rendered a longer arm, such as one with a trailing element after the same components, that trailing content used to stay on the page with nothing reported. Hydration now removes it, keeps every node the client adopted, and reports the mismatch once to `onRecoverableError`, with one development diagnostic at the branch.
- 3770c1e: Discard the server elements and text that an `@if` or `@switch` arm leaves unclaimed during hydration. When the server rendered a longer arm, the client arm adopts the start of the server's range. Elements or text after the roots of the client arm's own template, or after the single root that a component in the arm adopts in place, stayed on screen with no report. Hydration now steps past those roots, removes the server content after them, and reports one structural `onRecoverableError`, with a development diagnostic at the directive. Every compiled multi-root template now carries its root count, so production hydration finds that end without parsing the template, including for a branch in a helper passed as a render prop.
- 3994e1e: Discard the server content an `@if` or `@switch` arm leaves unclaimed during hydration. When the server rendered a different arm, the client arm adopts the server's range from its start. Server components or ranges left after the client arm's content stayed on screen until the next arm swap. Hydration now removes them and reports one structural `onRecoverableError`, with a development diagnostic at the directive. A dormant `<Hydrate>` boundary whose captures changed before activation discards them without a report.
- 6f019c5: Hydrate an `@if` or `@switch` at a hole in an `@if`/`@switch` arm when the server rendered another arm with the same static roots. The hole's position then holds an element or text of the other arm, not the slot's range. The slot used to treat that node as the node after it: a branch with several roots adopted it and the arm's next static root as well, so a node was lost silently, and later updates left the server node on screen or duplicated content. An empty branch kept the server node, a branch after one of the arm's adopted roots deleted that root, and a single-root branch that did not match threw `NotFoundError` from `hydrateRoot`. The slot now takes the place of exactly that server node. It adopts the node when its branch is that node, otherwise it rebuilds over the node or removes it and reports the mismatch once through `onRecoverableError`. The arm's adopted nodes keep their identity and keep updating.
- 6c50c70: Read a component's signal and query declarations from its own `@try`, `@pending`,
  `@catch`, `@if` and `@switch` arms and keyed `@for` rows without creating a second
  cell. A query declared in setup and read again from one of those frames, directly
  or through a local `derived$`, now starts one request on the client and resumes
  the server's request during hydration, instead of starting another request per
  arm or row. A component's own signal displayed in an arm also keeps its value
  when that arm remounts.

  An arm or row still owns the declarations it evaluates itself and resets them
  when it is removed, and a child component that receives a handle as a prop still
  resolves it in its own instance.
- de31710: Cache a `const` that only another cached calculation reads. In `const labels = formatRows(rows); const view = wrapRows(labels);` with only `view` in the template, `labels` used to recompute on every render, so `view`'s cache never hit and `wrapRows` ran on every render too. Client builds now cache every link of such a chain, keyed on the chain's own inputs, in `@{}` and `return <jsx>` components alike. That includes a `const` read only by a Strong inline render expression. Declarations that are never cached (hook calls, live member calls, `let`, values only an event handler reads) still never are.

  Also fix a render crash: a cached calculation whose callback read a `const` declared after it, as in `const reader = make(() => labels); const labels = formatRows(rows);`, threw `Cannot access 'labels' before initialization` because its dependency check read `labels` early. Such a calculation is no longer cached.
- fbaf501: Release the remaining host ref array owners when a callback cleanup throws, including nested arrays, and preserve the first error for existing error delivery.
- 70ee6a3: When hydration finds other server content in a range where the client renders
  several siblings, such as server text in a `{hole}` whose client value is a
  component that renders two components, the development console now logs one
  hydration mismatch diagnostic for that recovery instead of one per sibling.
  Once a recovery reaches the end of the range, by discarding the server content
  before it or by rebuilding a single-root clone over the last server node,
  later sibling components, fragment clones, and single-root clones that find
  that end build on the client without a second "the server rendered the end of
  the parent block" diagnostic. A mismatch in a separate range still reports on
  its own.
- ab2798e: Mount and update every component without allocating a closure context. The hydration path for a component inside a client-rebuilt subtree now calls a separate helper, so ordinary component calls no longer capture their arguments up front. Rendering behavior is unchanged.
- 95421bb: A `signal$`, `derived$`, or `query$` declared inside a custom hook now belongs to each call of that hook. Calling `useUser$(a)` and `useUser$(b)` in one component previously shared one cell, so the second call showed the first call's data and never ran its own loader. Each call now owns its cells, a call skipped by a condition keeps its own, and server and browser builds key them identically for SSR seeds and streamed results. Call sites are keyed in modules with a runtime signals import and for hooks named with `$`.
- 9168bf6: Fix a runtime host element (from `createElement`) duplicating its children when
  hydration retries after suspending. When the server rendered other children than
  the client's, the first attempt built the client's children inside the adopted
  host; the retry then built a second copy beside them. The retry now replaces the
  earlier attempt's children, and a root that retries restores the server's.
  A child host element that replaces server content now calls `onRecoverableError`
  once across retries, and in development warns once at the hole that renders the
  runtime host.
- 11a9da9: Adopt the server's nodes when a list item suspends while a deferred `<Hydrate>` boundary hydrates. A component that returns JSX passes the boundary its children as descriptors, so a host's children there hydrate as a list. When the first item's first render suspended, the boundary's retry filled that list again from wherever the resumed render had left the cursor. It reported a hydration mismatch, rebuilt the item on the client, and duplicated server nodes such as the item's first root. The retry now adopts the list from its first server item, as a compiled `@for` does. An item whose render suspends inside a hydrating `@if` or `@switch` arm the server rendered no range for also leaves the server's nodes as they were, so the retry adopts that arm instead of rebuilding it.
- 92495b9: A `@catch` parameter written as an object or array pattern, such as `@catch ({ message }: Error, retry)`, now binds its names on the client. Previously the client error arm threw a `ReferenceError` or read a component local with the same name, while server rendering showed the error, so client render and hydration disagreed with SSR. Pattern defaults may read component locals, as in `@catch ({ message = fallback })`.
- bfed959: On an ordinary page exit, `installSignalDocumentLifecycle` now unmounts independent islands before it retires the document's signal owner. Island cleanups can read their document signals instead of hitting `ScopeDisposedError`, and live islands are no longer notified of the retirement. The owner still retires if an island's unmount throws.
- c016c2d: Discard and report the server's `@if`/`@switch` arm when the client's arm renders nothing during hydration. An `@if` with no client arm already discarded the server content and reported it as an empty branch, but a client arm with an empty body, such as `@else { <></> }`, left the server's other arm on screen with no report. Hydration now removes that content and reports one structural `onRecoverableError`, with a development diagnostic at the directive. When the server arm starts with an element or text node rather than a range, it is still kept.
- 21c3bfe: When hydration rebuilds an `@for` that the server rendered with no items because
  the client has items, the development diagnostic says the server rendered
  `an empty list (@empty)` only when the server rendered that arm. A list without
  an `@empty` arm now reports `an empty list`.
- 320f9e3: Mount rows with event handlers without per-row weak-map bookkeeping. A module that can receive signal handles recorded each native handler's signal authority in two weak maps, so every mounted row paid two weak-map insertions even when no signals were in use, which made prepending 100 rows to a 1,000-row keyed list about 1.6 times slower. The authority now lives on the host beside its handler, and a scope's published-authority mark is a field on the scope. Updating a text hole with a plain value in such a module also writes the text directly instead of going through the signal binding path.
- da9b1e4: Preserve the first script or stylesheet preload's options when equivalent calls are deduplicated, so a later preinit inherits the original integrity and connection metadata. Explicit preinit options continue to take precedence.
- 4ab33b6: The compiler now rejects `for…in` and C-style `@for` headers on every target.
  `@for (const k in object)` used to compile as `for…of` over the object on the
  DOM client, server, and universal renderers, rendering its values or nothing
  instead of its keys. `@for (let i = 0; i < n; i++)` crashed the DOM compiler
  with an internal `TypeError`. Each now reports a diagnostic at the directive
  that suggests the `for…of` spelling, such as
  `@for (const name of Object.keys(object); key name)`.
- 8e90048: Keep every root of a hydrating `@if` or `@switch` arm that suspends inside a deferred `<Hydrate>` boundary while the server rendered no range for it. When the arm's last root was static, after the component that suspended or after a `use()` in the arm itself, the boundary's retry still bounded the arm after its first roots. Hydration looked right, but switching to another case left the arm's later roots on screen, and a case change while the boundary was pending did the same. The arm now ends after every root its template adopted, both when it first suspends and when the boundary retries it.
- 6bb20ac: Keep the server nodes that a `@switch` or `@if` arm adopted when the arm
  suspends inside a deferred `<Hydrate>` boundary before it has a range of its
  own.

  When the server rendered no range for a `@switch` or `@if`, the client's arm
  takes the place of the server node at that position and adopts it. If that arm
  suspended inside a `<Hydrate split={false}>` boundary, the boundary's retry
  published the arm's range after the sibling that followed it, so that sibling
  reported a false mismatch and built a second copy of its server node. A case
  change while the boundary was still pending removed the wrong server nodes, with
  the same result for the next sibling. The arm now marks where its content starts
  with a comment of its own and keeps track of how far that content reached. Its
  retry finalizes the range from there, and another case replaces exactly that
  content and renders on the client without reporting a mismatch. This works for
  arms whose content is text, several roots, or a root the arm had not yet cloned.
- 6959fa0: Rebuild a hydrated fragment that starts with a hole when the server rendered something else there, such as another `@if` arm. A leading component call, text hole, or nested block matches any server node, so hydration adopted the other arm's nodes as the fragment's roots: its static roots were never built, and a component in the hole took one of the server nodes as its position. Hydration now compares the first static element root after the leading holes with the server node it would adopt. On a mismatch it rebuilds the fragment on the client, as it already did for a fragment that starts with a static root, and reports one `onRecoverableError`. The development warning names that static root and the server node found in its place. Matching fragments adopt their server nodes as before. A `HYDRATION_RANGE_BOUNDARY` passthrough root, whose owner may adopt one range level off, keeps its existing behavior.
- 105e0f0: Run a hook with an omitted dependency array on every render when its callback reads a binding declared after the hook call. That covers a later `const`, `let`, `class` or `var`, and the `const` that receives the hook's own result, such as a `useCallback` that calls itself. The compiler read the binding where the hook is called to fill the inferred array. A `let`, `const` or `class` threw `ReferenceError: Cannot access … before initialization` there. A `var` was still `undefined`, so the hook never re-ran when it changed. React runs a hook with an omitted array on every render, and Octane now does the same in this case. Strong mode reports `OCTANE_STRONG_UNTRACKED_EFFECT` instead, asking for the declaration to come before the hook.
- 0d91b93: Give a component rendered inside an `@if` or `@for` arm of a hookless component
  the same signal instance on the server and in the browser. A hookless
  component's arms, rows and value children no longer lose that component's level
  from their signal and query identity, and no longer gain a stray list-item
  segment. Hydration now resumes the server's cells for them instead of starting
  fresh ones. Hookless siblings also keep their own owners when hydration retries a
  suspended `@try` body.
- 7698907: Adopt a server-rendered `@catch` arm (or JSX `ErrorBoundary` fallback) during hydration when the client's try body throws again, instead of reporting a hydration mismatch and rebuilding it. This covers a boundary that is a component's only output and a try body that renders a host element before it throws. The server now marks a caught arm, so the client replays the try body without claiming the catch arm's DOM. A body that renders or waits on the client replaces the server's catch arm without a mismatch report. The replay also reads the `use()` values of Suspense boundaries and `Hydrate` islands the server completed inside the abandoned try body, including streamed ones, so a body with a nested boundary adopts the catch arm immediately instead of waiting for client data. When a boundary at the top level of a root rebuilds during hydration, the root's next sibling component now hydrates in place instead of being rebuilt with a mismatch report.
- 3baa492: Hydrate a server-rendered `@catch` arm when a template-less component's `use()` rejected on the server. The component now reads its rejection seed, so the boundary adopts the server's catch arm and reports the caught error instead of discarding that arm, reporting a hydration mismatch, and staying suspended. A component that renders where the server rendered something else still reports the mismatch.
- 1fa3853: Hydration no longer reports a mismatch for a `@try` body or `<ErrorBoundary>` child that throws to its catch arm after adopting server content. A component that cloned its element and then threw from a hole was compared against whatever the server rendered there, often the server's own catch arm, and logged a development mismatch warning and called `onRecoverableError` in development and production. The catch arm replaces that content, so these reports are now dropped. A body that completes or suspends still reports its mismatches, and nested boundaries pass them to the enclosing boundary.
- 62e76bf: Load the browser's own query selection when hydration finds a server result for a
  different request. When a component's props or state select a query request
  other than the one the server resolved under the same owner, hydration no longer
  fails with "The presented query definition does not match". The query loads its
  current selection as if the server had not seeded it, and adoption keeps the
  server's nodes while reporting changed text as a recoverable hydration mismatch.
- a1f136c: Deferred hydration no longer lets a live interaction overtake one captured
  before hydration. A `<Hydrate>` boundary or independent island replays its
  captured events after its hydration commits, which can be a frame later. An
  event that arrived in between reached the hydrated handlers immediately, so
  clicking option A before hydration and option B during it ran B's handler first
  and left A selected. The boundary now keeps capturing until its replay runs, so
  handlers see input in the order the user produced it. An island whose content
  is still suspended after activation also keeps those events instead of
  dropping them on the inert server markup.
- 39f3e97: Deferred hydration now replays captured interaction events with the original
  event's `timeStamp`. Each replay used to be a newly constructed event stamped
  with the replay time, so the time between a captured `pointerdown` and
  `pointerup`, or how long an input had been held, collapsed to the hydration
  delay. A boundary nested inside another boundary reset the clock a second time.
  Replays from `<Hydrate>` boundaries, nested boundaries, and independent islands
  now keep the captured value and remain untrusted (`isTrusted` is `false`).
- 11aebc7: Hydrate a single-root component whose body is an `@if` or `@switch`, called where the server rendered another branch's markup. Hydration renders such a call in place of the server node it finds there, but the branch inside the component bounded its content against that node. When the branch's root did not match the node, recovery rebuilt the root and removed the node, and `hydrateRoot` threw `NotFoundError` and left the container empty. This happened in development and production builds, for an element or component arm, including when the call was its host's last child or the last root of an arm's fragment. When the root matched, hydration adopted it outside the branch's range, so switching the branch to another arm left the server's node on screen next to the new arm. The call now renders before the node after the server's node, so the branch bounds exactly its own root. A mismatch is still reported once through `onRecoverableError`.
- 416882f: Hydrate the component after one that adopted a server element in place. When the server rendered a different `@if`/`@switch` arm, a component that found that arm's element where its own server range belonged adopted it, but the next component adopted the same element again, and the server's range for the next component stayed on the page. When the first component's own holes left the cursor inside the element, the next component claimed the enclosing block's range instead, which discarded the arm. Hydration now continues after the adopted element. A returned single-root component that hydration rebuilt at the end of its parent's server range no longer takes that range's end marker as its own, so a later render that hides it removes it, and showing it again no longer throws.
- 3ec43da: When a component call finds no server range of its own, because the server rendered another `@if` or `@switch` arm there, and hydration adopts the server markup in place, a component call inside that component's template now adopts the server node at its own position. Previously, when the server had rendered that inner call's markup inline, the inner call rendered against the first server node of the outer template instead: it reported a mismatch and replaced that node, which the outer component had already adopted.
- 0b833bb: Adopt the server's text at a renderable hole in a fragment that a component adopts in place during hydration. When a component call finds no server range of its own, because the server rendered another arm or component inline there, its fragment template adopts those server nodes in place, and the server framed none of that markup's holes. A `{value}` hole then took the server's text node as its own end marker and inserted a second copy before it, so the page showed the text twice. The hole now adopts that text, or the element an element value renders, and updates it in place. A `{null}` hole at the end of such a fragment no longer claims the server node after it as the fragment's content, so hydration removes that stale node and reports it once instead of keeping it on screen.
- 11aebc7: Hydrate a component call that has no server range of its own when a component inside the callee's branch adopts the server node at the call. This happens when the server rendered another branch's markup there, and an arm of the callee's `@if` or `@switch` renders a component whose root matches that node. Hydration rendered the inner component in place of the node, but the call itself did not record that it had adopted the node. The page looked right after hydration, but two things went wrong. Swapping the component that the call renders, for example through an imported binding, left the old component's content on screen next to the new component. When the call was the whole arm of an adopted branch, the server nodes after the adopted node in that arm were never removed. The call now adopts the node with the component inside it, in development and production builds. A swap replaces the call's content, and the leftover server nodes are removed and reported once through `onRecoverableError`.
- bc30a18: Remove the server markup left after a component's last call when that call adopted its server node in place. When the server rendered another component's markup in a component's range, and the client's content there is a sequence of calls without server ranges of their own, each call adopts its server node in place. Whatever the server rendered after the last call's nodes stayed on screen, and hydration reported nothing. Hydration now removes it and reports the mismatch once through `onRecoverableError`, while the nodes the calls adopted keep their identity. This covers single roots and fragments, in lite and full component slots, in development and production builds.
- b319c16: Production builds emit less code for inlined `useMemo` and `useCallback` calls. When the compiler supplied the memo's slot, the hook's name is no longer passed to the runtime, since only an authored slot can be missing. In plain `.ts` and `.js` modules, a dependency that is a never-reassigned local binding is now read directly instead of being copied to a temporary first. Across the repository's binding modules, this saves about 5.6 KB gzip, summed per module.
- bc6761f: The `hydrate: 'islands'` shell check now rejects more interactive shells and also runs in dev:

  - A hook is recognized through an import alias (`useEffect as onMount`) and through a namespace or member call (`O.useState()`), and so is an aliased signal declaration.
  - Every local function the shell references is checked, not only JSX tags: a component passed as a prop (`render={Item}`) and a helper called to render output. A relative import passed into JSX is checked when it can render (a function, or a component-named value), including a namespace member such as `UI.Button` and a module-level alias of a local function. Strings, asset URLs and other plain values, including any export of a non-Octane module, are not shell output. A package component or a module-level wrapper such as `memo(...)` passed as a value cannot be checked.
  - A signal handle bound through a member (`{state.count$}`), an import alias (`count$ as live`) or a module-level alias (`const live = count$`) is reported.
  - In dev, an islands-only route whose shell needs client work now logs a warning naming the module, line and problem, once per problem, while the page keeps serving. The production build still fails on it.
- f5644f7: Stop a query below a JSX `<Suspense>` from reloading without end during hydration, and resume the server value that a `.tsx` component reads in its returned JSX. A JSX `<Suspense>` or `<ErrorBoundary>` gave its try body a new identity on every render. A boundary retrying its own suspended first attempt therefore looked like it had received new children: it retired the attempt's queries and started fresh ones. When the browser had to load a query, for example one without a server seed, each load resolved into another retry and another load, and the page re-rendered indefinitely. The boundary now keeps one body and carries its children like a compiled `@try`, so only new children restart the attempt. On the server, a component's returned value rendered outside that component's signal owner, while the client renders it inside. A `query$` that a `.tsx` component reads with `.get()` in its returned JSX was therefore seeded under the parent's identity and loaded twice on the server, and the browser loaded it again with a hydration mismatch. The server now renders a returned value inside its component's owner.
- 5ef4f9a: Render private static JSX components through their compiled fragment again.

  A private `.tsx`/`.jsx` component whose body returns only static JSX, and
  whose every use is an attribute-free child of a returned host element, again
  renders through that parent's template as a lite component call. Since async
  signals, component descriptors carry their invocation site, and the proof
  recognized only the older descriptor call. Every such component therefore fell
  back to a full component slot plus a descriptor child slot. On the
  signal-favoring chain, the JSX twin's shallow bump went from 10 full component
  slots to 100.
- 18c1b77: Reorder keyed lists without journaling every row. During a root render that can still be rolled back, a keyed reorder recorded each surviving row's previous position, four journal slots per row. Rotating a 1,000-row list was about 1.4 times slower than before root renders became undoable. The list's own shape record now restores each row's position from its original order on rollback. Recording the key order for that record also uses a single bulk copy. Rows that render their index still show the right position after a held render retries.
- 2b69387: Discard a mismatched server node inside a hookless component's host during hydration. A hookless component renders into the element its call sits in, which can differ from the parent of the enclosing block's range, for example a `<section>` inside an `@if` arm. When its template did not match the server node there, hydration kept the stale server node on screen and inserted the client's element beside it. Hydration now builds the client's element in that node's place, including when the node was the host's last child, and reports the mismatch once.
- 07cc1d2: Keep a component-local `derived$` or `query$` when its captured values are unchanged. Since local declarations started following new props, every render ran the declaration's closure again, even with equal props. A `derived$` that returned an object produced a new object on each render, so an effect or memoized child that depended on it ran on every parent render. The compiler now lists the render values a local declaration captures, as it does for a hook with an omitted dependency list. A render whose captured values are all unchanged keeps the accepted definition and its value without running the closure, and skips the per-render staging work. A changed value still reruns the declaration as before. A handle from a local `signal$` with no key or a literal key is not a captured value, so a `derived$` that reads one keeps its value until the signal changes. When two declarations name one cell, such as a repeated explicit key, the first declaration in a render presents it on the server as well as in the browser. Server rendering previously threw because the second declaration replaced the cell's computation during the render.

  Declarations reached through a custom hook also no longer share a cell with an explicit key that spells out the hook's call path, such as `'user/h:…'` declared directly in the component, and their path is no longer rebuilt for each declaration on every render.
- 3d0e5e2: Re-select a component-local `query$` when a later render's selector captures new props or state, and recompute a synchronous component-local `derived$` from its captured values. Previously both kept the closure from their first render. An equal selection keeps its request and adopts the new loader without refetching. A changed selection aborts the obsolete request and starts the new one when the render is accepted. A held transition or suspended attempt keeps committed readers on the accepted selection and reuses its pending request when it retries.
- f647cef: Keep destructured `.map()` callback parameters writable on the client. A
  template `xs.map(({ label }) => <li … />)` compiles to a keyed row loop, and its
  destructured fields were re-declared with `const`, so a row handler that
  reassigned one, such as `onClick={() => { label = label + '!' }}`, threw
  `TypeError: Assignment to constant variable` after mount or hydration. Server
  rendering already treated them as ordinary parameters. Identifier parameters
  were unaffected.

  The same row prologue now keeps the kind of an authored `@for` header, so the
  fields of `@for (let { label } of xs)` can be reassigned too. Output for
  `const` headers and identifier parameters is unchanged.
- 8e90048: Keep every root of a hydrating `@if` or `@switch` branch that the server rendered no range for. Such a branch adopts the server nodes at the cursor in place, and hydration bounded its content after the first root it adopted. When the branch was the whole content of another arm or of a component the client adopted, the rules that remove the server's leftover content then deleted the branch's later roots, which the client still renders, and reported a mismatch for them. A branch that was not deleted from still owned only its first root, so switching it off left the others on screen. The branch now ends after all the roots its template adopted. The server content after them is still removed and reported once, and a branch whose roots outnumber what the server rendered there is built on the client and reported, instead of hydrating without its later roots. This also covers a branch inside a component that was adopted in place.
- d496796: Compare a memo component's plain props with fewer ownership checks. The memo bail looked up own-property membership for every prop, so that an inherited `Object.prototype` value cannot stand in for a removed prop. That lookup is now made only for values such a read can produce: `undefined`, functions and objects. A primitive prop that compares equal is already the object's own. Rows that pass mostly strings and numbers bail with one lookup instead of one per prop. An own `__proto__` prop holding `Object.prototype` still counts as a change when it is replaced.
- fdf54fe: A plain `.ts` or `.js` module that calls a hook-named method while it initializes, such as `export const initial = store.useValue()`, now evaluates instead of throwing `ReferenceError: Cannot access '_h$0' before initialization`. That covers top-level statements, optional chains, and a module-level class's static fields, static blocks, and computed keys. These calls run outside every render, so they keep their authored form with no hook slot. A hook call in an instance field initializer runs with each construction, possibly during a render, so a hook method or module-declared custom hook called there now keeps its own slot, as it would in a constructor.
- ce97a96: A plain `.ts` or `.js` module that calls a hook-named method or a custom hook inside a function it invokes in place, such as `export const value = (() => store.useValue())()`, now evaluates instead of throwing `ReferenceError: Cannot access '_h$0' before initialization`. That covers arrow and function expressions called directly or through `.call` and `.apply`, including async ones. A generator body waits for `.next()`, which a render may call, so its hook calls still get their own slot, as do those in a function invoked in place inside a component or hook.
- dc3e180: Drop the native array snapshots from client and server bundles that never map a
  list. Both runtimes record `Array.prototype.map` and the `Array[Symbol.species]`
  getter when they load, so a mapped list can tell the native `map` from one that
  user code installs later. Bundlers could not prove those two reads free of side
  effects. Every bundle that never reached the mapped-list code therefore kept
  them as dead top-level statements, including a server bundle that only escapes
  HTML.

  The reads are now marked pure, so bundlers remove them when nothing uses them.
  A bundle that maps a list still takes both snapshots at load, before user code
  can replace either intrinsic. A minimal client bundle shrinks by 89 bytes raw,
  and the smallest server bundle shrinks from 654 to 571 bytes raw.
- e219d88: Set host refs before layout effects when a nested Suspense boundary reveals
  after an update replaced its parent's pending retry. The nested boundary first
  suspended inside that retry; once the update discarded it, the boundary stayed
  hidden without its reveal bookkeeping, so refs mounted in it (including hosts
  preserved from before the suspension) were never attached and a layout effect
  reading them saw `null`. A nested boundary that suspends while its parent is
  already hidden also no longer calls a callback ref with `null` a second time,
  matching React.
- ed188d7: Leave a signal-capable only-child text hole alone when its value is unchanged.

  A `{props.value}` hole that is its element's only child compiles to
  `bindSignalChild` whenever the value could carry a signal. That binding kept
  the Text node as its token, so every render read the node's `nodeValue` to tell
  an unchanged value from a changed one, and an unchanged value overwrote any
  outside edit to the text. The binding now keeps the last written primitive, as
  compiled text holes did before signal-capable bindings: an unchanged primitive
  does nothing and leaves the DOM alone, and a changed one rewrites the same Text
  node.
- afbad9f: Discard and report server content that an only-child text hole cannot adopt during hydration.

  A text hole that is its element's only child adopts the server's leading Text
  node. When the server rendered something else there, such as an element or a
  comment, hydration kept that content and appended the client's text after it.
  It reported nothing, and every later update wrote the text beside the stale
  server nodes. Hydration now removes that content, so the element holds only the
  client's text. It reports the mismatch through `onRecoverableError` and, in
  development, a located warning. `suppressHydrationWarning` silences the report,
  here and when the client renders nothing over such content. An empty server
  frame is not reported, the same as an empty element.
- 09cf476: Preserve the submitter's document order in function form actions and manual transition form status data. Include its entry before the native `formdata` event fires.
- 0887a68: A delegated event listener that the browser runs synchronously during a render's
  DOM writes, such as `onBlur` when a render disables or removes a focused input,
  can now write signals. Before, it inherited the render's signal write guard and
  threw `SignalWriteError`. Its reads no longer become dependencies of that render.
  Subscribers notified by its writes also run outside the render, so they can
  write signals and their updates schedule like any other event's. The rest of the
  render stays write-guarded, and a listener called from inside a pure computation
  is still rejected.
- b319c16: Plain `.ts` and `.js` modules emit fewer custom-hook call boundaries. A call to a hook the module declares gets no `withSlot` boundary when that hook reads no slot, calling nothing but `useContext` and other such hooks. The same holds for a hook's only use when another module-declared hook makes it directly, provided that caller is used only by name and the omitted calls form no cycle. Every call still keeps its own state. Signal-reading modules and `$` hooks keep every boundary. Across the repository's bindings, this removes 37 boundaries.
- 3514dc7: Production client builds now lower `useMemo` and `useCallback` inline in plain `.ts`/`.js` hook modules that contain template literals, `switch` statements, `try`/`catch`, default or namespace imports, import attributes, or method overloads. Before, any of that syntax kept the whole module on the slower callback-allocating path.

  A plain hook module also stays on that path, with its source unchanged, when the inline printer would emit different code. That covers `declare global`, an empty `import type {}`, a cast assignment target such as `(ref.current as any) = value`, a non-null assertion that continues an optional chain such as `box?.item!.label`, and a few TypeScript-only forms. Previously, such a module could fail to build, turn the type-only import into a side-effect import, throw where the optional chain should short-circuit, or lose authored types.
- 3f1a7b2: Keep `import.defer()` deferred in plain hook modules that production client builds reprint; it previously compiled to an eager `import()`.
- 985a81e: A custom hook in a plain `.ts`/`.js` module that calls another hook declared in
  the same module now gives each call its own state, as a `.tsrx` module does.
  Previously two calls to a local hook shared their `useState`, `useRef`, `useId`
  and memo cells on the client, while the server kept them apart, so hydration
  replaced the server's output. This applies to hook functions, hook-named
  `const` values and parameters, and aliases of them. Calls to `use*`
  functions made while a module initializes, outside any function, are no longer
  rewritten, so they no longer throw a `ReferenceError`.
- cb71034: Hydrating an `@for` that the server rendered with items while the client has
  none and builds its `@empty` arm now reports the rebuild through
  `onRecoverableError`, in production as well as development. The development
  diagnostic is still logged once, now also when a pending sibling replays the
  hydration attempt. A dormant `<Hydrate>` boundary whose list emptied before it
  activated rebuilds it without reporting.
- 69b02f1: Keep a module-private Context on the public provider in production builds when any of its providers receives element descriptors as children: under a `descriptorChildren` component or `ReactCompat`, or inside a `@{ … }` function that code calls directly. Production builds previously threw `TypeError: body is not a function` there, while development rendered correctly.
- 3041f5d: When hydration rebuilds an element whose server markup does not match, the
  rebuilt element's dynamic attributes, `class`, and `style` now apply the client
  values without a second report. Development builds used to log a false value
  mismatch for each of them after the one structural mismatch. With
  `suppressHydrationWarning` on the rebuilt element, those client values were
  dropped entirely, in development and production, because suppression kept the
  "server" value, which was only the client template's empty placeholder. A value
  mismatch on an adopted server element still reports, and suppression still keeps
  the server value there.
- b58c783: When hydration rebuilds an element whose server markup does not match, the
  `@if`, `@switch`, `@for`, `@try`, `<Activity>`, and `<ErrorBoundary>` blocks
  inside the rebuilt element now mount as client content. They used to keep
  hydrating against the server output that follows the mismatch. Development
  builds logged a second, false mismatch for the same recovery, an `@for` could
  throw, and a block could take a following server element, list range, or
  `use()` result as its own, so the rebuilt element showed the wrong content or
  went missing. A block mismatch inside an element that hydration adopts from the
  server still reports as before.
- 02e4eb0: Keep a component root that hydration rebuilt after a mismatch where the server
  node it replaced stood.

  When a component's template root did not match the server node at that
  position, hydration reported the mismatch and rebuilt the root on the client,
  but inserted it at the end of its range. Server siblings that later components
  adopted then rendered before it, and server content after it that no client
  sibling claimed stayed on the page. The rebuilt root now takes the replaced
  node's place. Unclaimed server content after it in the same `@if` or `@switch`
  arm is removed as part of the one reported mismatch. A `@switch` or `@if` that
  the server did not render keeps the rebuilt root inside its own range. A text
  hole after the rebuilt root no longer throws `NotFoundError`. A Suspense
  boundary that resumes hydration after the rebuild places the root the same way
  and keeps the server siblings it adopted.
- 5f354d2: When hydration rebuilds an element whose server markup does not match, a text
  hole inside the rebuilt element now shows the client's text even when its
  element carries `suppressHydrationWarning`. Suppression keeps the server's text,
  but a rebuilt element holds the client template's placeholder rather than
  server output, so the client text was dropped and the element rendered blank in
  both development and production builds. Suppression still keeps a differing
  server text on an element that hydration adopts from the server.
- 02e4eb0: Keep the server node on screen until a root that hydration rebuilt over it
  commits.

  When a template root did not match the server node at its position, hydration
  removed that node as soon as it built the replacement. If the replacement then
  suspended (a `use()` after the mismatched root), the server content vanished
  while it waited. A deferred `<Hydrate split={false}>` boundary also retried the
  suspended arm from the next server sibling, so the retry mismatched that sibling
  too, reported a second mismatch and rebuilt it. The server node now stays until
  its replacement commits in its place. A retry rebuilds over the same node
  without reporting it again. A `@switch` or `@if` arm that suspended this way
  still owns the node, so a case change replaces it.
- ad203e9: When hydration rebuilds an element whose server markup does not match, it now
  reports only the structural mismatch. A text hole inside the rebuilt element
  used to compare the client template's own placeholder as if it were server
  text, so development builds logged a second, false "server rendered text"
  mismatch for the same recovery. A text mismatch inside an element that
  hydration adopts from the server still reports as before.
- 5e586e2: Fix a `<Hydrate>` activation that suspends on a child inside a hydrated component fragment.

  - **Following components:** when the activation resumed, each component after that one in the same block found the hydration cursor still inside the earlier component's server range. It removed or duplicated server nodes, even when the server rendered exactly what the client did. Those components now adopt their own server ranges.
  - **Client-built children:** a child that mounted inside content hydration rebuilt on the client now completes as a client render when it resumes. It no longer adopts a server node outside the rebuilt content.
  - **Fragments with extra roots:** a component fragment that holds more roots than the server rendered in its range, such as a component call followed by text, is now rebuilt and reported once. It is no longer adopted over another component's content. This also applies when the component suspends before its fragment is hydrated and then resumes. Below a passthrough root, whose ranges can sit one level off, hydration keeps its previous behavior.
- cdc9b07: Hydrate a single-root component call that is its host element's last child when the server rendered a different element there. Hydration rebuilds the component's root in place of that element. In any production build, and in a development build for a component with hooks, `hydrateRoot` threw `NotFoundError` and left the container empty: the rebuilt root was inserted before the server element it had just removed. The rebuilt root is now appended where that element stood. The mismatch is reported once through `onRecoverableError`, and the server siblings before it keep their identity.
- 90c209e: When hydration rebuilds a component's single root over a server element that does not match it, it now also removes whatever else the server rendered in that component's range, such as the rest of another component the server rendered there. Previously, that server content stayed on screen after the rebuilt root, and nothing reported it. The mismatch is still reported once, and the server nodes after the range keep their identity. This also applies when the rebuilding attempt suspended and a later attempt, or a `<Hydrate>` boundary's resume, completes it.
- f34be34: Call `hydrateRoot`'s `onRecoverableError` when hydration discards server content
  for an `@if` arm the client does not render, a branch range the server encoded as
  something else, or a runtime host element's content. These recoveries already
  rebuilt the DOM but reported nothing, in development or production. A list whose
  server rendered its `@empty` arm while the client has items now reports at the
  list itself, once, including when a suspended boundary or root retries
  hydration. A dormant boundary whose props changed before it activated still
  repairs these ranges without reporting or warning.
- d5030cf: Stop a focused host's removal from running handlers of components that already
  unmounted.

  Teardown disposes a component before it detaches the component's DOM, and
  Chromium dispatches `focusout` synchronously while it removes a focused element.
  That new event no longer starts handlers on hosts whose component has unmounted,
  so a signal write from `onBlur` no longer reports `ScopeDisposedError` and a
  plain `onBlur` no longer runs for an unmounted component. Still-mounted
  ancestors and other roots still receive the event, and an event that was
  already being dispatched when the component unmounted keeps its handlers until
  it finishes. A ViewTransition deletion keeps its committed handlers live until
  it publishes.
- a9594d0: Skip removed hosts' handlers when a deletion cleanup moves focus before the
  teardown reaches them.

  Deletion cleanups run parent first. A dialog that restores focus in its own
  layout cleanup used to start `onBlur` on an input owned by a child component
  that the teardown had not reached yet. The same happened for an input in a
  removed `@for` row's value hole when an earlier component in the row moved
  focus. A deletion now retires every host it removes before any of its cleanups
  run, including a portal's content. Live hosts, including focused siblings of
  the removed range, still receive the event.

  Handler publication no longer records an owner on each host, and a list clear
  retires only the row that holds focus.
- 15c7b97: A host rendered into a value hole, such as `{show && <div onBlur={…}><input /></div>}`,
  no longer runs its handlers for the `focusout` that the browser dispatches while
  the host is being removed. The component that rendered it stays mounted, so
  these hosts are now retired when they are removed rather than when a component
  unmounts. This covers value holes, nested `createElement` children, a host
  whose tag changes, a root that renders a descriptor, and removals published by
  a View Transition. Still-mounted ancestors keep receiving the event, and an
  event that was already being delivered keeps its handlers until it finishes.
- 3971840: Give a signal component below returned JSX the same instance on the server and
  in the browser. A `.tsx` component, or a plain function in a `.tsrx` module, that
  returns host elements no longer adds a level of its own to the identity of the
  signal and query declarations below it, and neither does a dynamic tag that
  resolves to a host element. Hydration now resumes the server's cells and query
  results for those components instead of starting fresh ones.

  Instance identity now follows authored component invocations only, so it no
  longer changes when a module starts importing `octane/signals`.
- d930afb: A root without a Suspense boundary that suspends while hydrating now reports a
  hydration mismatch once. When its first attempt had already rebuilt mismatched
  content, that attempt's diagnostics were published even though it was
  discarded, and the retry reported the same mismatch again, so development logged
  the warning twice and `onRecoverableError` fired twice. Some recoveries, such
  as a renderable or only-child hole over server text, or a list the server
  rendered differently, also left a half-built client subtree in place of the
  server content while the root was pending. A suspended root attempt now leaves
  the server content as the server rendered it, and its mismatch diagnostics and
  `onRecoverableError` reports are published only by the attempt that commits.
- d930afb: Keep server text and style values in place while a root without a Suspense
  boundary is suspended during hydration, and report their mismatches once when
  it commits. A first attempt that repaired a value and then suspended used to
  show the client's text or style in the server's markup while the root was
  pending, and the attempt that committed found the text already matching, so a
  text mismatch never reached `onRecoverableError` and development builds logged
  no warning. Attribute, class, style, and `dangerouslySetInnerHTML` warnings now
  wait for the committing attempt instead of logging once per attempt. When a
  suspended root render, including a client update, rolls back after removing a
  namespaced attribute such as `xlink:href`, the attribute now comes back in its
  namespace.
- 791f12e: Fixed-node `'use dom bindings'` views that bind a URL attribute (`href`, `src`, `action`, `formAction`, `xlink:href`, …) now compile to the smaller scalar adopter, with the URL sanitizer attached only to those views. A URL view adopted through `adoptBindings` ships about 32% less gzip. URL updates published by an early binding are now kept when the application later hydrates over it, as other attributes already were, instead of being reverted to the rendered value.
- 0a14c20: Enumerate a deferred JSX value with the same keys as an ordinary element on the client. A JSX value that Octane defers until it renders also listed Octane's internal `__octaneInvocationSite` field in `Object.keys`, `for...in`, and object spread, so it no longer matched an element from `createElement`. The server already hid this field. The client now hides it too, and the component's call-site identity still reaches its signals during rendering and hydration.
- 9aa6736: Select the correct SSR option when its implicit value consists of dynamic text separated by hydration comments.
- 541ecdc: Drop unused module-load work from server and universal renderer bundles. The
  server runtime built its ASCII async-identity table in a top-level loop, and
  froze a shared empty snapshot list with `Object.freeze`. Bundlers cannot prove
  either one free of side effects, so every server bundle kept both, including a
  bundle that only escapes HTML. The universal renderer core had the same problem
  with five frozen constants such as its `useFormStatus` result.

  The table is now built by a pure-annotated `Array.from`, and the frozen
  constants are marked pure, so bundlers remove them when nothing reads them. A
  bundle that encodes async identities still builds the table once at load, and
  encoding is unchanged. The smallest server bundle shrinks from 571 to 477 bytes
  raw. A universal root that never calls `useFormStatus` shrinks by 65 bytes raw.
- 5ef4f9a: Update a signal-capable text hole with one text write.

  When a module renders signal-capable bindings, its later identifier holes
  compile to `bindSignalChild`. For a plain primitive in an ordinary
  marker-bounded hole, that binding reached the general `childSlot` path on every
  render. It now keeps `textHoleUpdate`'s fast path: an unchanged primitive does
  nothing, and a changed one rewrites the slot's Text node. Signal handles,
  elements, raw-HTML hosts, and mode switches still take the general path.
- e93bb26: Re-run a component-local `derived$` or `query$` whose closure reads a variable that is declared after the declaration or assigned again. Such a value is still `undefined`, or not yet final, where the declaration runs, so comparing it could not show that the closure would compute the same result. The declaration kept its first render's closure and value after that variable changed. A declaration inside the initializer of a variable its closure reads, such as `const api = { count$: derived$(() => api.items.length), items }`, threw a `ReferenceError` instead. These declarations now reevaluate on every render, as they did before captured values were compared.
- 97618d7: A calculated descriptor array rendered as an element's only child inside a
  component's children body skips reconciliation again while it is unchanged. Since
  renderable holes started accepting signal handles, these holes lost the compiler's
  cached-array region. Every parent update then walked the unchanged list and its
  items. The region now wraps the signal-capable binding. A signal handle, or any
  other value that is not an unchanged plain data array, still rebinds on every
  render, and switching back to a previously cached array rebuilds it.
- b5277d1: Keep directive-local bindings inside split `<Hydrate>` boundaries.

  A `@catch (error, reset)` reset parameter, an `@for` index, an `@switch` arm
  local, or a `case` local inside a handler is no longer passed from the parent
  component into the split child, where it was undefined and threw a
  `ReferenceError` during hydration. `@empty` now reads the enclosing scope
  rather than the loop binding, so the outer value reaches the split child. A
  boundary nested inside one of these scopes also keeps the directive binding
  instead of picking up a same-named module declaration.
- 5ef4f9a: Encode a keyed component descriptor's key once per server render path.

  During SSR, a keyed component descriptor already carries its key in the
  enclosing child identity scope. Since async signals, the component invocation
  also appended a second encoding of the same key, which added one key encoding
  and its UTF-16 scan per keyed descriptor row. The duplicate is gone. Replay
  identity is unchanged, and signal instance keys still use the descriptor key.
- 648a8d2: Render a server `@try` boundary without allocating a closure per boundary.

  `ssrTry` built a small arrow on every call to label a presentation-binding
  view's arm. It is now a module-level helper, so each boundary on each server
  pass allocates one fewer closure. The emitted HTML is unchanged.
- 63f07f5: Stop reporting a hydration mismatch when a `@switch` or `@if` case changes
  because a `<Hydrate>` boundary's props changed before it activated.

  When a boundary's captures change before it activates, the server HTML predates
  the client's state, so hydration builds the changed case on the client without a
  report. A case whose first node is an element or a component still called
  `onRecoverableError` and logged "the client expected <b> but the server
  rendered …" in development. This happened when the case changed while the
  boundary was pending after it had adopted the server's case, or when an early
  activation rendered a different case than the server. Those cases are now
  quiet, like fragments, text, and lists already were. A case the server did not
  render is still reported when the captures are unchanged.
- 1d33932: Stop reporting hydration mismatches, and stop keeping old server values, when a
  `<Hydrate>` boundary's props changed before it activated.

  When a boundary's captures change before it activates, the server HTML predates
  the client's state, so activation is meant to repair it silently. Several
  recovery sites still called `onRecoverableError`, in development and production,
  and logged a development warning. This happened when a renderable hole's server
  text became a component, when a `createElement` child list shrank, and when a
  dynamic host tag changed. Every recovery site is now quiet under changed
  captures. Unchanged captures still report a mismatch as before.

  Under changed captures, `suppressHydrationWarning` and `dangerouslySetInnerHTML`
  also kept the server's value after activation, which was older than the client's
  state. An element could show old text and attributes next to siblings that
  showed the new ones, and `dangerouslySetInnerHTML` also logged a false
  development warning. Activation now writes the client's text, attributes, class,
  style, and HTML in these cases. With unchanged captures, both still keep the
  server's value.
- 2b4b3fc: Keep the server DOM intact when a deferred `Hydrate` boundary retries after its captures changed. If a mounted parent updated a boundary while its first activation was suspended, the retry rendered new content over server nodes that other blocks had already adopted. That content was a component swapped in by a dynamic call, a row inserted into a keyed list, or a renderable hole's new component, list, or text. Rows went missing, a sibling's server node was replaced, and the swap reported a false hydration mismatch. Content an update creates during hydration now builds on the client beside the adopted nodes, including when it suspends and a later retry resumes it, and nothing is reported.
- b98179f: Reveal a streamed Suspense boundary completely when its fallback renders an `@for` list (with items or its `@empty` arm) or a `'use dom bindings'` view directly, rather than inside a host element. The inline swap script now counts those list and binding ranges when removing the fallback. Before, it stopped early: it left the fallback's close marker, which made `hydrateRoot` throw `HierarchyRequestError`, or left fallback nodes visible beside the revealed content. The optional streaming view-transition driver uses the same rule, so it now captures the exit of every fallback element.
- 2b69559: Strong mode no longer reports `OCTANE_STRONG_EFFECT_STATE_UPDATE` for a state
  update in a `catch` clause that can only run after its `try` block yields. The
  common effect pattern
  `try { setData(await api.get(id)); } catch (error) { setError(error); }` now
  compiles. A `catch` stays synchronous when something before the `try` block's
  first guaranteed `await` can throw, such as a call, `new`, `throw`, or
  iteration. The awaited call, calls it chains from through `then`, `catch`, or
  `finally`, and calls written as array-literal elements of an awaited
  `Promise.all`, `allSettled`, `any`, or `race` are trusted to reject rather than
  throw. Their callees and arguments still count. `finally` clauses and statements
  after the `try` follow the same rule.
- 5ef4f9a: Let Strong-mode keyed `@for` rows that log with `console` skip re-rendering again.

  Since the change that keeps rows reading module state or mutable globals live,
  a row body containing a diagnostic call such as `console.log('row', item.id)`
  also lost its survivor skip, because `console` is a host global. Every console
  operation returns undefined, so the receiver of a statement-position
  `console.method(…)` call cannot reach row output. Strong production builds now
  reuse those rows again, as documented. The call's arguments are still row
  reads. A module binding named `console` still disables the skip.
- 1c44df5: Require Strong effect cleanup to actually cancel or ignore asynchronous state updates. `OCTANE_STRONG_EFFECT_DATA_FETCH` now covers any state update after an `await` or in a `.then`, `.catch`, or `.finally` callback of effect-owned work, not only `fetch`. The returned cleanup must abort an `AbortController` whose `signal` reaches the request, or assign a flag declared in the effect that guards the update after the last `await`. Empty, opaque, and unconnected cleanups, component- or module-scoped flags, and ref flags are errors. Compatibility modules and emitted code are unchanged.
- f151614: Add `OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY`. Strong effect setup may no longer call a state getter, read `current` from a value ref, or read a reassigned module `let` or `var`, because none of them is an inferred dependency. Refs attached with `ref=` or passed to a call, component, or hook remain readable, and reads in cleanup, deferred callbacks, and `useEffectEvent` callbacks remain valid. Compatibility modules and emitted code are unchanged.
- f151614: Add `OCTANE_STRONG_EFFECT_RESOURCE_LEAK`. Platform resources acquired in Strong effect setup must be released by the returned cleanup: event listeners on browser targets, `matchMedia` lists, attached elements, and connections (by matching `removeEventListener` or an aborted signal), `on<event>` handler properties, intervals and self-rescheduling timers, `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, and `PerformanceObserver`, `WebSocket`, `EventSource`, and `BroadcastChannel`, and geolocation watches. User objects' subscriptions stay legal. Compatibility modules and emitted code are unchanged.
- 1c44df5: Close zero-delay and custom-hook bypasses of Strong's synchronous effect update check. `OCTANE_STRONG_EFFECT_STATE_UPDATE` now treats callbacks that run before the next paint as effect setup: `startTransition`, a `useTransition` start function, `queueMicrotask`, `.then`/`.catch`/`.finally` on `Promise.resolve(value)` or `Promise.reject()`, `setTimeout` without a positive delay, and code after an `await` that resumes without waiting on any path, such as `await null` or `await (flag ? load() : null)`. It also follows state tuples, updaters, callbacks, and `useTransition` tuples and start functions returned by same-module custom hooks, giving each hook call its own state, in `.tsrx`, `.tsx`, and plain TypeScript modules. `requestAnimationFrame`, timers with a positive delay, and external subscription callbacks remain event-driven. Compatibility modules and emitted code are unchanged.
- cda985b: Cache Strong-mode inline render expressions the way the same expression is cached when a `const` names it. In a production client build, an eligible expression in a host child hole, a host attribute, or a component prop, such as `<output>{total.toFixed(2)}</output>` or `<List rows={visible(rows)} />`, now recomputes only when its component-local inputs change, matching React Compiler. Expressions in `@if`, `@for`, `@switch`, and `@try` arms, component children, and built-in boundaries still evaluate only when they render. Expressions that contain JSX, event handlers, refs, and keys keep their existing lowering. A component that returns JSX gets the cache only after an authored hook call, so a hookless one stays an ordinary function. Parallel `use()` warm plans still start a child's request from the authored prop expression. Compatibility mode, development builds, and the server are unchanged.
- b6a414a: Strong mode now rejects imperative writes to DOM that the template renders.
  When a `useRef` provably names exactly one intrinsic element in the same
  component, writing `textContent`, `innerText`, or the child list of an element
  with rendered children, or changing its class, a template-set attribute, or a
  template-set `style` property, reports `OCTANE_STRONG_MANAGED_DOM_WRITE`. Writing
  `innerHTML`, `outerHTML`, `insertAdjacentHTML()`, or `setHTMLUnsafe()` to a
  rendered element reports `OCTANE_STRONG_RAW_HTML_WRITE`; use
  `dangerouslySetInnerHTML={trustHTML(html)}` instead. Refs passed to components or
  helpers, reassigned refs, and writes to DOM the template does not own stay valid.
  Compatibility mode and emitted code are unchanged.
- 09565b4: Expose the bundler compiler's per-module Strong decision as `strongModuleStatus(code, id)`.

  It reports whether a module compiles under Strong mode through its own
  `"use strong"` directive, the application's `strong` policy, or both, using the
  same rules `transform` applies. `octane analyze` uses it for its Strong coverage
  baseline. `octane/compiler/bundler` also re-exports
  `findLeadingJsxImportSourcePragma`. Compiled output is unchanged.
- 752028d: Strong mode now also reports a state value mutated outside render through a
  whole state tuple passed to a local helper (including a destructured tuple
  parameter), through an Effect Event called with
  the state, and through a helper, updater, or reducer parameter that has a
  default value. A `useLinkedState` reconciler that returns a literal now proves
  array, `Map`, and `Set` mutators on that state, like a lazy `useState`
  initializer.
- b6a414a: Strong mode now rejects `document.getElementById()`, `querySelector()`,
  `querySelectorAll()`, and `getElementsByClassName()` when a literal selector
  matches a literal `id` or class that the same component renders
  (`OCTANE_STRONG_OWN_MARKUP_QUERY`). Attach a ref to the element instead. Portal
  targets, dynamic selectors, and markup rendered by other components stay valid.
  Compatibility mode and emitted code are unchanged.
- 0339abc: Strong mode closes three gaps in its render determinism checks. Callbacks that
  known array methods (`map`, `filter`, `forEach`, `reduce`, `flatMap`, `some`,
  `every`, `find`, `sort`, and their variants) run synchronously are now checked
  as render, so `items.map(item => <li key={Math.random()} />)` is rejected.
  `crypto.randomUUID()` and `crypto.getRandomValues()` join
  `OCTANE_STRONG_RENDER_IMPURE_CALL`, which now suggests `useId()` for element IDs
  and a stable item ID for keys. Formatting a provable `Date` or an `Intl` service
  during render without an explicit locale and time zone reports
  `OCTANE_STRONG_RENDER_LOCALE_FORMAT`, because server and browser output can
  differ. Compatibility mode and emitted code are unchanged.
- e936a90: Strong mode now rejects scheduling work during render. Calling `setTimeout`,
  `setInterval`, `queueMicrotask`, `requestAnimationFrame`, or
  `requestIdleCallback` while rendering reports
  `OCTANE_STRONG_RENDER_SIDE_EFFECT`. The check covers direct calls, `window` and
  `globalThis` members, unreassigned aliases, synchronous helpers, eager effect
  and event-handler factories, and lazy state initializers. Registering the
  callback is the side effect: a component can render more or fewer times than it
  commits. Schedule from an event handler, or from an effect that cancels the
  work in cleanup. Deferred callback bodies, events, effects, and compatibility
  mode are unchanged, and valid Strong modules compile to the same output.
- 752028d: `OCTANE_STRONG_STALE_STATE_UPDATE` no longer reports state an Effect Event
  captures, in its body or in helpers it calls synchronously, because an Effect
  Event reads the latest committed values even when a timer or promise calls it.
  A snapshot passed to an Effect Event from deferred code, values computed from
  it, and timer or promise callbacks created inside the Effect Event are still
  checked. So is a value computed from state at the call site and passed to an
  Effect Event or helper from deferred code, like `apply(n + 1)` after an await.
- 54ff59e: Keep a resolved Suspense arm's server content in place while its first hydrating attempt is suspended, even when that attempt had to rebuild a mismatched node. The discarded attempt no longer removes server nodes or leaves client-built ones behind, and the attempt that commits reports the structural mismatch, and calls `onRecoverableError`, once.
- 25017f3: Keep server text and attribute values in a resolved `@try` arm while its
  hydration is suspended, and report their mismatches once when it commits. An
  attempt that repaired a value and then suspended used to show the client value
  in the server's markup before the arm hydrated, and the attempt that committed
  found the value already matching, so a text mismatch never reached
  `onRecoverableError` and development builds logged no warning. Attribute,
  style, and `dangerouslySetInnerHTML` warnings now also wait for the committing
  attempt instead of logging from an attempt that is thrown away.
- c2fea71: Keep a pending `<Suspense>` boundary's `query$` loads when its parent renders again. While a boundary's first attempt was still waiting, any parent render that gave it new children (every render of a JSX `<Suspense>`, even with equal props) or new inputs (a compiled `@try`) restarted the attempt and retired its queries. Each such render started the load again, and a parent that re-rendered faster than the load settled, for example a ticking clock or typing above the boundary, kept the fallback on screen indefinitely. The same happened during hydration while the browser loaded a query the server had not resolved. The restarted attempt now takes over the earlier attempt's queries: an equal selection shares the load already in flight, and a changed one starts its own and aborts the earlier load. Hooks still start fresh from the new inputs. A component that declares a `signal$` or an asynchronous `derived$` still restarts its cells with the attempt, because those cells cannot follow new inputs.
- 5ef4f9a: Stop allocating a closure for every transition and delegated event.

  Since async signals, each `startTransition` call created a native candidate
  resolver closure. Each delegated event handler invocation also created a
  callback closure, even when it did not enter another signal owner. The
  transition resolver is now a module function that reads the active Action
  batch. The handler callback is created only when the event enters a different
  signal owner.
- 27c2a12: Keep the streamed-boundary validator out of client-only apps that use
  `@try`/Suspense. Mounting a boundary previously retained the check for a
  streamed shell's pending `<template>` sentinel, and the hydration range-marker
  helpers behind it, even in apps that never call `hydrateRoot`: about 400 B gzip.
  Claiming that sentinel is now a hydration method, so client-only apps drop it.
  Hydration behavior is unchanged.
- b682c2b: When hydration finds other server content where a component call expects its
  range, the component is now built where that content stood, and only that
  content is discarded: a later sibling component keeps its server range and
  adopts its server nodes instead of being rebuilt with a second mismatch report.
  Hookless components that return a fragment now recover the same way. A
  component that suspends while it is built this way, or a fragment rebuilt over
  another component's range whose hole suspends, now leaves the server content on
  screen until the attempt that completes, which reports the mismatch once.
- 56de31a: When hydration builds a component on the client because the server rendered no range for it, it now discards only the server nodes in that component's place and leaves the server range of a later sibling call for that call to adopt. Previously the discard ran into the sibling's range, removed its content and left a stray close marker behind, so the sibling rebuilt without a report of its own. The built component also stays ahead of those siblings instead of being placed at the end of its parent range.
- ad12525: Adopt a component whose template has several roots when hydration finds the server's nodes without a range of its own, as when the server rendered a different `@if` arm with the same markup inline. In development builds the component adopted its first root, but the next component then read that root as its own and reported a mismatch. In production builds the component was rebuilt and reported as a mismatch. Both builds now adopt the server nodes when every root matches, report nothing, and continue after the last root, so the next component adopts its own server range.
- 85cb387: Let universal-renderer modules declare `async` and generator functions that JSX
  never mounts. The universal compiler's synchronous-body restriction now applies
  only once a function is actually compiled as a component — the `@{ … }` form, a
  JSX-shaped return, or component usage — so a plain async helper in a `.tsrx`
  file no longer fails the native-renderer build.
- 517b61d: Reuse the Vite plugin's preflight classification of an unchanged module across
  client environments that share one plugin instance, such as Vite's
  `builder.sharedPlugins` or a dev server with several client environments.

  Before this change, every environment parsed and reclassified the same source
  again, including host-owned TypeScript that the plugin passes through
  unchanged. The plugin now keeps a small summary per module, keyed by
  environment, specialization flags, and the full module ID, and checked against
  a digest of the exact source. It holds neither the source nor its AST. The
  summary is cleared when the compiler is reset and on every watch event. The
  compiler still parses each module for its own transform, and output is
  unchanged.

## 0.7.1

### Patch Changes

- 9c324f6: A `@{ … }` component passed to `Object.assign`, as in
  `return Object.assign(Button, { Item })` inside a factory function, compiles
  again. Since 0.7.0 the compiler treated every function passed to a call as one
  that code would call, and rewrote it to return JSX. Inside a module-level
  function, that rewrite rejected a directive such as `@if` in the component as
  being in a module-level callback. `Object.assign` only stores or returns the
  function, so the component keeps its template body, with its props, control
  flow, and captured variables, on the client and the server. The same holds for
  `Object.defineProperty`, `Object.defineProperties`, `Object.freeze`,
  `Object.seal`, `Object.preventExtensions`, and `Object.setPrototypeOf`. A
  directive in a function passed to a call that may call it, such as `xs.map(Row)`,
  is still reported.
- 73138de: Cancel injection producers when initial document seed validation fails during
  `prerender()` or `prerenderToNodeStream()`, preserving the original validation
  failure even if producer cleanup throws.

## 0.7.0

### Minor Changes

- 4c1ca88: Keep the state of a hook declared after an early exit on the DOM renderer. A
  hook's state lasts as long as the component, `@for` row, or directive arm that
  calls it; an exit only skips the rest of one render. On the DOM renderer, the
  rest of a directive arm after `return;`, `return null;`, or `continue;`, and the
  rest of a component whose early return guards a single host element, ran in a
  scope of its own. So taking the exit reset every hook after it, while the
  universal renderer, value-returning components, custom hooks, and plain `if`
  blocks kept that state. The DOM compiler now keeps it too: only the arm's output
  is removed when the exit is taken. An effect after the exit is still cleaned up
  while renders skip it and runs again once one reaches it.

  A class declared in setup is also passed to the directive arms nested below it
  on the client, where reading it threw a `ReferenceError`.
- 4d8a93b: End a directive arm early on universal renderers the same way as on the DOM. A
  `continue;` in an `@for` row that no inner loop owns, at any nesting depth, now
  ends that row. Before, it reached the arm's compiled function unchanged and the
  module failed to load with "Illegal continue statement".

  A `break` that targets the `@for` or `@switch` around an arm failed to load the
  same way. It is now the DOM compiler's compile error, with its location.

  Returning a value from an arm, such as `if (loading) return <Spinner />;`, used
  to render that value on universal renderers and is now the same compile error as
  on the DOM. An arm's output is its final node on every renderer, and a component
  can mix DOM and universal regions across a renderer boundary. If the rule
  differed by renderer, the same arm would compile on one side of a boundary and
  fail on the other. Render the alternative from an `@if`/`@else` arm instead.

### Patch Changes

- 55c2c01: Run each queued `useActionState` dispatch with the action that was current when
  it was dispatched, matching React 19. Before, a rerender that supplied a new
  action while a submission waited in the queue made that submission run the
  replacement action. Payloads dispatched after the rerender still use the new
  action, and an action error still continues the queue.
- 38a5443: Report a compile error for a `break` or `continue` that would leave a `@{ … }`
  block, such as `if (done) continue;` in a child block inside an `@for` row. The
  parser accepted it because the jump sits lexically inside the loop, but every
  target compiles the block apart from that loop, so the module failed to load
  with "Illegal continue statement". A block is a nested template, not a directive
  arm, so it has no early exit. Skip the row with `continue;` in the row's setup
  before its output, or render the part to leave out from an `@if` arm.

  A labeled `break` or `continue` that would leave a directive arm, for a label in
  the setup around it, failed to load the same way and is now a compile error too.
- 0547835: A child `@{ … }` block inside JSX that a callback in a component body returns
  can now read the callback's params, on the client and the server, and
  hydrates. The compiler used to declare the block's render function in the
  component body, outside the callback, so
  `const row = (x) => <p>@{ const y = x + 1; <b>{y}</b> }</p>` threw
  `x is not defined` at render. The block now compiles inside the callback,
  keeps its hook state across parent updates, and its `@if`, `@for`,
  `@switch`, and `@try` arms can read the callback's names. This also covers an
  authored `{() => @{ … }}` child in such a callback, names bound in a nested
  block of the callback, and the `.map` callback in setup or over a value that is
  not an array.
- 877a7a4: `hydrateRoot` now adopts adjacent text children of a `createElement` host
  without a mismatch. `createElement('div', null, 'hello ', name)` rendered two
  text nodes on the client, but the server wrote them as one run of text, which
  the browser parses as a single node. Every hydrate reported a recoverable text
  mismatch, rewrote the first node, and built the second. The server now writes
  React's `<!-- -->` separator between adjacent texts, including across nested
  arrays and empty values. Hydration adopts each server text node and leaves the
  separator in place, as React does. `<textarea>`, `<title>`, and other raw-text
  content is unchanged, because a comment there would be literal text.

  A controlled or default `<select>` value now also preselects, during server
  rendering, an `<option>` without a `value` whose label is split across adjacent
  texts, such as `<option>{'Item '}{n as string}</option>`. The label is compared
  as its flattened text, as in React.
- 68c094d: A host element created from an uppercase or mixed-case HTML tag, such as
  `createElement('DIV', null, text)` or a dynamic `<Tag>` whose value is `'H1'`,
  now hydrates and updates like its lowercase spelling. HTML tag names are
  ASCII case-insensitive, so the server's `<DIV>` parses as a `div` and
  `document.createElement('DIV')` builds one too. The client compared the tag
  exactly, so hydration reported a recoverable mismatch and rebuilt the subtree,
  and every later render replaced the element, which lost focus, selection, and
  scroll. A host tree built from such tags was also rebuilt, rather than adopted,
  when a component child appeared in it. The client now matches an HTML element's
  tag in any casing. SVG and MathML tags stay case-sensitive (`foreignObject`),
  as the DOM requires.
- c1a86ce: A child `@{ … }` block inside a keyed element, `<noscript>`, `<html>`/`<head>`/
  `<body>`, or a host the HTML parser would repair (such as a `<p>` containing a
  `<div>`) now renders, on the client and the server, exactly as it does under an
  ordinary element. The compiler builds those hosts as element descriptors, and
  that path silently dropped the block, so `<p key={id}>@{ … }</p>` rendered an
  empty `<p>`. A component that returned such a host with a setup-bearing block
  kept the block on the client but not on the server, so hydration reported a
  mismatch and rebuilt the subtree. A render-only block now groups its output
  transparently. A block with setup runs in its own render scope and keeps its
  hook state across parent updates.
- 63baf8c: Read each component's source at most once when the development runtime looks up
  its `__octane_loc` marker. Form diagnostics walk every ancestor block for each
  mounted host element, and the lookup ran `Function.prototype.toString` plus a
  regex on every visit without caching. Output compiled without `dev: true` has
  no marker, so every lookup missed and repeated: a 50-row `createElement` list
  read component source 703 times per mount, and larger trees scanned megabytes of
  source. Development mounts no longer pay that per element. Production builds are
  unchanged.
- 489db93: A `@{ … }` function declared inside a component or another function, such as
  `const row = (v) => @{ <p>{v}</p> }` or `function row(v) @{ … }`, can now be
  called directly: `{row(props.v)}` and `{rows.map(row)}` render what
  `(v) => <p>{v}</p>` renders, on a client mount, on the server, and through
  hydration. The compiler compiled such a function only as a render body that the
  runtime calls with a render scope, so a direct call threw `Cannot read
  properties of undefined` on the client, and the server rendered its output
  without the range hydration expects. When code calls it directly, the function
  now compiles to the returned-JSX form that `function f() @{ … }` is shorthand
  for. It still renders when passed as a `{row}` child, a component, or a portal
  body.
- 687f584: A module-level `@{ … }` function, such as `function Row(v) @{ <p>{v}</p> }` or
  `const row = (v) => @{ … }`, can now be called directly from the same module:
  `{Row(props.v)}`, `Row.call(null, v)`, and `{items.map(Row)}` return what the
  returned-JSX form `function Row(v) { return <p>{v}</p>; }` returns, on a client
  mount, on the server, and through hydration. The compiler compiled such a
  function only as a component body, which the runtime calls with a render scope,
  so a direct call threw `Cannot read properties of undefined (reading 'slots')`
  on the client, and the server rendered its output without the range hydration
  expects. A directly called function now also gets its returned-JSX form, which
  its body runs when it is not called to render. Its setup and hooks run in the
  caller, an early `return null` returns null, and its JSX resolves where the
  value renders. Rendering it as `<Row />` or a `{Row}` child still runs the
  compiled template, and modules without direct calls compile unchanged.
- 1b8c949: A child `@{ … }` block written directly in a directive body with no element
  around it, such as `@if (x > 0) { @{ const y = x + 1; <b>{y}</b> } }`, now
  renders on the client and the server, and hydrates. This covers `@if`,
  `@else`, `@switch` cases, `@try`, `@pending`, `@catch`, `@for`, and `@empty`
  bodies. The compiler used to treat the block as a setup statement and discard
  it, so the body rendered nothing. The block is now that body's output, as it is
  among element children. A render-only block groups its output transparently. A
  block with setup runs in its own render scope, can read the body's own locals,
  and keeps its hook state across parent updates.
- 04df7e9: End a directive arm early the same way wherever the exit sits in its setup.
  `return null;` is now the same exit as `return;`, and so is an exit inside a
  nested `if`, block, `switch`, loop, `try`, or labeled statement. Before, only a
  top-level `if (c) return;` (or `continue;` in an `@for` body) was lowered: the
  server rendered any other exit's literal `null` or `undefined` as text, and a
  client update that took the exit left the arm's earlier output in place.

  A keyed `@for` row that can exit early no longer uses its element as the row
  boundary, because the row renders no element when it exits. Rows with an exit
  could previously crash (`insertBefore` of null) when a hidden row moved, and fail
  to update after hydration. The same applies to a row or component whose root is
  an `@if`/`@else` with an arm that can exit.

  Returning a value from an arm, or a `break` that targets the `@for` or `@switch`
  around it, is now a compile error with its location. These previously rendered
  `[object Object]` on the server or emitted JavaScript that failed to load.
- 489b121: `hydrateRoot` now adopts a container filled with the whole `html` of a
  body-only render that hoisted document metadata. The default
  `headChannel: 'fold'` prepends each hoisted `<title>`, `<meta>`, or `<link>`
  ahead of the body markup, as React 19 does. Hydrating that container reported
  a recoverable hydration mismatch and rebuilt the entire root on the client
  (in development it also logged that the client expected the root element but
  the server rendered a comment). `hydrateRoot` now moves each folded metadata
  entry into `document.head` and adopts it there, which matches a client render.
  Folded Float stylesheets, scripts, and resource hints stay in place and are
  skipped.
- ce47fae: A React-style `key` attribute on the only root of an `@for` row now compiles
  exactly like the header spelling `@for (…; key expr)`, for intrinsic and
  component roots alike. Before, an intrinsic root whose content read anything
  not provably stable, such as `{props.render(row)}`, was lowered to a keyed
  element descriptor. That cost about five times as much per update, and because
  the row was still treated as a single node, removing or reordering such rows
  left stale elements behind. A component root lost its row memo. The compiler
  now also rejects a row key that reads a declaration from inside the loop body,
  which previously failed at runtime with a `ReferenceError`.
- b2e4b9a: The compiler now rejects an `@for` row `key={…}` attribute that reads a class,
  an enum, or a `var` hoisted out of a nested block in the row body. Before, only
  top-level `const`, `let`, `var` and `function` declarations were caught, so
  such a key compiled to a key function that threw a `ReferenceError` or silently
  read an outer binding of the same name. The check now resolves the key's names
  by scope, so a name the key binds itself, such as a callback parameter, still
  compiles.
- 8de664c: Fix `FragmentInstance.blur()` for owned children focused inside a shadow root or a same-origin iframe portal. It now checks each child's own focus root instead of only the fragment marker's document.
- 5cc6b64: Recover when hydration finds different server content where a nested
  multi-root (fragment) template component renders. A renderable `{expr}` hole
  whose server value was text but whose client value is a fragment component,
  rendered directly or returned from a plain component, crashed `hydrateRoot`
  with `HierarchyRequestError: Node can't be inserted in a #text parent`. When the
  server had rendered a different fragment component in that hole, hydration
  kept the server's elements without reporting anything. The fragment now checks
  its first root against the server node, reports the mismatch to
  `onRecoverableError` once, logs the development hydration-mismatch warning,
  discards the server content it would have adopted, and builds its markup on
  the client. A matching server fragment is still adopted in place.
- 0f8cb49: Discard and report server list content that the client's items cannot adopt
  during hydration. Several list shapes previously kept stale server content on
  screen, or rebuilt it without reporting to `onRecoverableError`:

  - A renderable hole whose client value is an empty list (`[]`) kept whatever
    the server rendered there visible. Hydration now discards it and reports the
    mismatch once.
  - A list item whose server content cannot be that item now discards the rest
    of the list's server content, builds the client items, and reports once. This
    covers a bare server element where the client item needs a range of its own
    (the stale element stayed visible) and a bare element of another tag (it was
    swapped silently).
  - A list or `@for` with more client items than server items builds the extra
    items and now reports once, with one development warning in place of one per
    item.
  - A renderable list with fewer client items than server items now discards the
    extra server items and reports them, as `@for` already did.

  A boundary that retries hydration after suspending does not report these
  again. A dormant `<Hydrate>` boundary whose captures changed before it
  activated repairs its list without reporting, including when a `@for` rendered
  fewer items than the server.
- 7fa3a2d: Report a renderable value that hydration rebuilds once, including when it
  suspends and its boundary retries. When the server rendered nothing where the
  client renders a list, a fragment, or a keyed element, or where a component
  returns a list or an element, hydration built the value without reporting it to
  `onRecoverableError`, and development logged one warning per item. It now
  reports the recovery once, with one development warning that names the hole,
  the returning component, or the list's host. A list whose items all render
  nothing still hydrates silently.

  A boundary that retries hydration after its value suspended no longer reports
  or warns about content an earlier attempt already rebuilt. The retry rebuilds
  that content instead of adopting what the failed attempt left. Adopting it had
  duplicated an element a component returned in place of its server text. Two
  further shapes rendered with component children no longer throw
  `NotFoundError` during hydration: an element a component returns where it
  rendered nothing on the server, and a list item whose server range is empty.
  A list item whose server range holds another element now reports its rebuild.
- aa6753b: A `@{ … }` function passed as a call argument, such as
  `{rows.map((row) => @{ <li key={row}>{row}</li> })}`, now renders what
  `(row) => <li key={row}>{row}</li>` renders, on a client mount and update, on
  the server, and through hydration. The compiler compiled such a function only
  as a render body that the runtime calls with a render scope. `map` called it
  with the row index in that position, so a client mount threw `Cannot read
  properties of undefined`. A `@{ … }` function passed inline to any call or
  `new`, or a nested `@{ … }` helper passed to one (`rows.flatMap(row)`,
  `run(row)`), now compiles to the returned-JSX form that `@{ … }` is shorthand
  for. Render props, `{fn}` children, `<Tag />` uses, portal bodies, and the
  component given to `memo` or `createElement` still render through the compiled
  template.
- ce11f82: Read a reassigned variable's value from when a JSX value was built, matching
  React. Octane renders the non-literal children and props of a JSX value later,
  so a variable assigned again in between showed its later value: a counter
  incremented in a `.map` callback rendered its final value in every row, and
  `content = <Frame>{content}</Frame>` nested the wrapper inside itself until the
  stack overflowed. The compiler now captures such variables when the JSX
  evaluates, on the client and the server, so hydration agrees. Event handlers and
  other functions inside the JSX still read the variable's current value. JSX a
  module-level function declaration returns when called directly still reads at
  render, as documented in `docs/differences-from-react.md`.
- bd21050: Release streamed signal async iterables that resolve after an SSR response is cancelled or its request aborts.
- 5575ff6: Emit smaller client code for `.tsrx` templates and compiled `.tsx` components
  without changing what they render or the work they do. Component call sites no
  longer pad their arguments with `undefined`, text-hole updates pass only the
  arguments an update uses, and binding bags read their DOM nodes directly
  instead of through copied locals. Across the compiler's test fixtures, minified
  output shrinks by about 3% and gzipped output by about 2%.
- 5f14459: A child `@{ … }` block inside JSX that a module-level callback returns now
  renders, on the client and the server, and hydrates. The compiler used to drop
  it silently, so `const row = (x) => <p>@{ const y = x + 1; <b>{y}</b> }</p>`
  rendered an empty `<p>`. A render-only block now groups its output
  transparently. A block with setup compiles in place, as the
  `{() => @{ … }}` child it is shorthand for. It closes over the callback's
  params, runs in its own render scope, and keeps its hook state across parent
  updates. An `@if`, `@for`, `@switch`, or `@try` in that block's output, or in
  an authored `{() => @{ … }}` child in a module-level callback, can now read
  the callback's params. Its arms used to be hoisted to module scope, where
  those params do not exist.
- 9230292: A `@{ … }` component that declares parameters after `props`, such as
  `function Row(props, extra) @{ … }`, now renders. The runtime calls a component
  as `(props, scope, extra)`, but the compiled body listed the scope after every
  authored parameter, so rendering `<Row />` threw `Cannot read properties of
  undefined (reading 'slots')` on the client. The body now always takes the scope
  second, and each later parameter holds the argument at its position, exactly as
  in the returned-JSX form `function Row(props, extra) { return … }`. While a
  component renders, the parameters after `props` receive internal values rather
  than `undefined`, so pass a component's inputs through props. A rest parameter
  after the first, and a parameter default or destructuring pattern, bind the same
  way.
- e4974cc: Treat `const Row = React.memo(Component)` the same as a named `memo` import when
  `React` is `import * as React from 'octane'`. The compiler only recognized the
  named form as an immutable memo wall, so a `@for` row rendering a
  namespace-imported memo component lost its dependency-compare fast path and
  re-rendered every row on each parent update. Such rows now keep the same
  `@for` flags as the named form. A namespace import from another module stays
  opaque.
- 19f07e0: Fix a `ReferenceError` in DOM-compiled nested templates. Inside a setup-bearing
  `@{ … }` child, a `() => @{ … }` sub-template (including a `createPortal` body),
  or a `function F() @{ … }` declared in a component, an `@if`, `@for`,
  `@switch` or `@try` arm, or a lifted event handler, could read the template's
  own locals or parameters, or the enclosing component's locals, as unbound
  identifiers on mount, hydration, update, or when the event fired. The compiler
  now passes those names to the code it hoists. A child local that shadows a
  stable parent binding, such as a state setter, is also no longer treated as
  stable, so a changing handler takes effect.
- 898820a: Discard stale server text when hydrating a renderable `{expr}` hole that is its
  host element's only child and whose client value renders nothing (`null`,
  `undefined`, `false`, `true`, or `''`). Hydration kept the server's text, so a
  later value rendered beside it (`<div>AB</div>`) and nothing was reported. A
  `null` value in the root component recovered only by abandoning hydration for
  the rest of the root, which duplicated the text of a later only-child hole. The
  hole now removes the server content, reports the recovery to
  `onRecoverableError` once, and names its source location in the development
  hydration-mismatch warning. A dormant `<Hydrate>` boundary whose props changed
  before it activated still repairs the hole without reporting it.
- 25cc659: Discard stale server text when hydrating a renderable `{expr}` hole that is its
  host element's only child and whose client value is an element, a component, or
  a list. In the root component, hydration gave up on the rest of the root, so a
  later only-child hole rendered its text twice (`<b>tt</b>`) and the development
  warning named the wrong cause. In a nested component, the value rendered beside
  the server text and nothing was reported. The hole now removes the server text,
  reports the recovery to `onRecoverableError` once, names its source location in
  the development hydration-mismatch warning, and the rest of the root keeps
  hydrating. A value that suspends is reported and built once when its boundary
  retries, a textarea keeps its server text as its default value, and a dormant
  `<Hydrate>` boundary whose props changed before it activated still repairs the
  hole without reporting it.
- 8fb96a0: Hydration now recovers when the browser's HTML parser has repaired
  server-rendered markup, such as a `<div>` inside a `<p>`. The server wraps
  such an element in a hydration range, so the parser's repair stays inside it.
  The client rebuilds the element once, discards the nodes the parser split out,
  and reports the recovery through `onRecoverableError`, with a development
  hydration-mismatch warning. Previously the content appeared twice and the stale
  copy stayed on screen, a later sibling's bindings could land on a stray node,
  and a repaired element in the root component could blank the page. Hydrating an
  element with component children where the server rendered nothing no longer
  throws.
- 699e363: Remount a portal's child element when its key or type changes.

  `createPortal(<Editor key={id} />, target)` kept the same component instance when `id` changed, so its DOM and any value typed into an uncontrolled input survived a keyed reset. Switching the child between component types, or between a host element and a component, reused the old DOM the same way. The portal now remounts its child for a new key or element type, as React does. An unchanged key and type still preserve the child, and the portal's own third-argument key works as before.
- 84d2eaf: Release a portal's previous range when it rebuilds under a mounted owner.

  A `{createPortal(children, target, key)}` at JSX child position rebuilds its
  whole subtree whenever its key, target, or child element type changes. Each
  rebuild used to register the new portal alongside the old one instead of in its
  place, so an owner that stayed mounted, such as a dialog host keyed by the
  selected id, kept every replaced portal and its detached start and end markers
  alive until it unmounted. The rebuilt portal now takes over the previous one's
  registration.

  A transition that rebuilt the portal and then suspended also left the restored
  portal unable to receive delegated events, such as clicks inside a dialog,
  because rolling back released the target's event listeners twice. Rollback now
  restores the previous portal's registration and releases the abandoned one
  exactly once.
- ca7d55d: Release late-resolving streamed RPC iterables when an unread response is canceled, aborted, or times out.
- 5bc3af7: Discard stale server content when hydrating a renderable `{expr}` hole whose
  client value is text or empty. If the server rendered an element, component, or
  list into the hole but the client rendered a string, number, `null`, or
  `undefined`, hydration kept the server's content next to the client value
  through every later render and reported nothing. The hole now keeps at most one
  server text node, removes the rest, reports the recovery to `onRecoverableError`,
  and names the hole's source location in the development hydration-mismatch
  warning. A dormant `<Hydrate>` boundary whose props changed before it activated
  still repairs the hole without reporting it.
- 94ba1b6: A `@{ … }` function with a rest parameter, such as
  `export function Join(...parts: string[]) @{ … }`, now loads and renders on
  the client and the server, and hydrates. The compiled body appends its render
  scope parameters after the authored ones, so it emitted
  `function Join(...parts, __s, __extra)`, and the module threw
  `SyntaxError: Rest parameter must be last formal parameter` when it loaded.
  The server did the same for a returned-JSX function with a rest parameter,
  even a helper that code only calls directly. The rest parameter now holds what
  the returned-JSX form's rest parameter holds: a direct call's own arguments,
  and for a component render the runtime's `(props, scope, extra)` arguments
  from its position on. A TypeScript `this` parameter on a `@{ … }` function no
  longer takes the place of the props, which had crashed the client render.
- 03e7ba0: Lower an early exit inside a directive arm the same way under returned JSX as in
  a template body. For `return <div>@if (x) { if (c) return; <b /> }</div>`, the
  client kept the arm's `return` as a literal JavaScript return, while the server
  rendered the rest of the arm as a nested range. Hydration reported a mismatch and
  rebuilt the subtree. A client update that took the exit also left the arm's
  earlier output in place. The same applied to `@else`, `@switch` cases, and
  `return` in `@for` bodies, and to directives inside JSX values stored in
  setup.
- ddb655c: Discard stale server text when hydrating a renderable `{expr}` hole whose server
  value was text but whose client value is a component that returns another
  component's element or list. Hydration kept the server text beside the client
  element and reported nothing. When the returned component rendered the server's
  text instead, a later switch to a different returned component left that text
  behind. The server text now stays inside the returned components' range, so it
  is adopted as their text, or removed and reported once to `onRecoverableError`
  with the development warning naming the component that returns the element. The
  same holds when a component in the chain suspends during hydration.
- 4ebe8d4: A component that returns a keyed element, a `<noscript>`, or a document element
  such as `<body>` from an ordinary `return` now renders that element's `@if`,
  `@for`, `@switch`, and `@try` children on the client, including directives
  nested in a child element, fragment, or component inside it. The client used to
  mount the element empty on every render while the server rendered its content,
  and a directive inside a `<>…</>` fragment there failed to compile. A `.tsx`
  component returning a keyed element with a `.map()` child rendered it empty in
  the same way. The same element in a `@{ … }` body was not affected.
- e325a83: A component that returns a keyed element, a `<noscript>`, or a document element
  such as `<body>` or `<html>` from an ordinary `return` now hydrates by adopting
  the server element. The client used to mistake that element's own server range
  for the component's, so it warned about a list mismatch and rendered a second
  copy beside the server element, or silently duplicated a `<noscript>` or
  `<body>`, and a returned `<html>` failed to hydrate. Switching such a component
  between that element and other output, such as text, no longer leaves the old
  element behind. The same element in a `@{ … }` body was not affected.
- d78f279: Resume server-resolved signals such as `query$` when their component renders
  inside JSX that a parent returns with `return <…/>` rather than an `@{}` body.
  The browser used to call its own loader, replace the server text, and report a
  hydration mismatch, for two reasons. A component placed beside a directive in a
  returned fragment or host element compiled to a different call-site id on each
  side. Children of a returned fragment, array, or keyed element also missed
  their list position in the server's signal identity. Both sides now agree, and
  explicitly keyed de-opt children no longer serialize a JSON key per item on the
  server.
- ddb655c: Discard stale server text when hydrating a renderable `{expr}` hole beside other
  children whose server value was text but whose client value is a list, a
  fragment, a keyed element, or a portal, or a component that returns an element
  or a list. Hydration kept the server text next to the client value, so the
  content appeared twice (a portal's hole kept collecting text on later renders),
  and nothing was reported. The hole now removes the server text, reports the
  recovery to `onRecoverableError` once, names its source location (or the
  returning component's) in the development hydration-mismatch warning, and the
  rest of the root keeps hydrating. A dormant `<Hydrate>` boundary whose props
  changed before it activated still repairs the hole without reporting it.
- 8fb96a0: Keyed `@for` rows now reorder and remove correctly when a row's only element is
  not built from the template. That covers a `<noscript>`, a tree the HTML parser
  would repair (such as a `<div>` inside a `<p>`), a `<meta>` or other element
  hoisted into the document head, and an element with its own `key` inside an
  `@if` or `@switch` arm. It also covers components whose root is one of these.
  Octane used to treat such a row as its single element, so removing rows could
  leave elements or comment markers behind, reorders could misplace rows, and a
  hoisted row could crash the list. Server-rendered keyed and `<noscript>` rows
  now hydrate by adopting the server elements too.
- d7ffa13: Server rendering no longer wraps the only renderable child of a host that has
  a spread in hydration markers, matching how the client mounts that child.
  Inside a `<textarea>`, whose content the HTML parser keeps as text, those
  markers became part of the default value: `<textarea {...rest}>{value}</textarea>`
  showed `<!--[-->A<!--]-->` before hydration, and hydration then reported a text
  mismatch. The markers also stopped a server-rendered `<option {...rest}>{label}</option>`
  without a `value` from matching its select's `value` or `defaultValue`, so the
  wrong option was selected until hydration.

  Updating the child of a `<textarea>` that has a spread also no longer empties
  it. Authored textarea children are a live text binding, but every update after
  mount cleared the default value when the spread supplied no `value` or
  `defaultValue`, which detached the child's text.
- 32c1bf4: Let `prerender` finish when a resource reader keeps rethrowing a thenable that
  has already settled until a timer or I/O callback updates its state. These
  retries used to run on microtasks, so the render failed after 50 passes before
  the callback could run. Once the render has seen that thenable settle, it now
  retries on a timer that backs off from 1ms to 100ms. These retries no longer
  count toward the pass limit, and a reader that never recovers fails once the
  stall lasts `timeoutMs`. When a pass limit is reached on thenables thrown
  outside `use()`, buffered and streamed errors now name that cause instead of
  `use()`.
- 7ee5f1a: Let `renderToPipeableStream` and `renderToReadableStream` finish when a resource
  reader keeps rethrowing a thenable that has already settled until a timer or I/O
  callback updates its state. A lag longer than about 50 event-loop turns used to
  fail the stream after 50 passes. These retries now back off on the same timer as
  `prerender`, do not count toward either streaming pass limit, and stop waiting
  as soon as another boundary's data arrives. A reader that never recovers fails
  once the stall lasts `timeoutMs`. When the pass limit before the shell is
  reached on thenables thrown outside `use()`, the shell error now names that
  cause.
- 608ff43: Report `"use strong"` inside a function or component body as
  `OCTANE_STRONG_DIRECTIVE_PLACEMENT`. Strong mode applies to a whole module,
  but a function-body prologue parsed as an ordinary directive and was ignored, so
  the module compiled in compat mode with no diagnostic and Strong checks never
  ran. The compiler, `slotHooks`, and the Volar diagnostics now reject it and
  ask for the directive at the top of the file.
- 09c58dc: A keyed `@for` row no longer leaves a partial copy of itself behind when a child
  suspends or throws during the row's first render. When the row's only root is an
  element, a component whose only root is an element, or an `@if` whose branches
  are single elements, the row's element was already in the list when the child
  suspended. Nothing owned it, so the retry rendered the row again beside the
  stale one, or ahead of the rows that came before it. The partial element is now
  removed with the rest of the row, whether the row is mounted, inserted by an
  update, or rendered by a client that has more rows than the server. During
  hydration, the retry no longer adopts the partial element as server output.
- 28a3636: Stop a Suspense retry from livelocking the page when it keeps suspending on a
  promise that has already settled. This happens when a resource reader throws a
  resolved promise before its own state catches up, or when `use()` reads a
  thenable whose `status` React does not recognize, such as `'resolved'`. Each
  retry used to run on that promise's next microtask, so timers and network
  callbacks never ran and the suspension could never end. A retry now waits one
  task once the promise's settlement has been seen, as React's Scheduler does. A
  promise's first settlement still retries right away.
- 3f9b16b: A `<textarea>` whose children come from a spread or a `children=` prop, such as
  `<textarea {...{ children: value }} />`, no longer empties on updates after
  mount, whether it was mounted on the client or hydrated. Its default value now
  follows every render, as it already did for authored JSX children. A signal
  update to another prop in the same spread no longer clears it either.
- 25b6e6d: A `<textarea>` with more than one child now renders its children as one run of
  text on both the client and the server. The HTML parser keeps markup and comments
  inside a textarea as literal text, so the hydration markers used between
  children became part of its value. `<textarea>hello {name as string}</textarea>`
  threw "Cannot read properties of null" on a client-only mount. Server rendering
  showed `hello <!-- -->A` until hydration, which then reported a mismatch.
  `<textarea>hello {name}</textarea>` and `<textarea>{a}{b}</textarea>` mounted
  with a literal `<!>` in the value, and hydration rebuilt the textarea. The same
  text rule applies to textareas made by `createElement`, stored
  JSX, and a `children` prop from a spread. These no longer report a hydration
  mismatch or serialize array children with markers. A signal handle in a
  compiled textarea's children stays live.

  A textarea child must be text. Strings and numbers render, `null`, `undefined`
  and booleans render nothing, and arrays or iterables of text are concatenated.
  An element, function or other object now throws a clear error on both sides.
  Before, the client inserted an element that the textarea's value ignored and the
  server wrote it as literal text. An element, component, or template directive
  written inside a `<textarea>` is a compile error.
- 9d322ef: Give `useActionState` on universal renderers the React 19 queue semantics the
  DOM runtime already has. Dispatches now run one at a time, each receiving the
  previous completed result as `previousState` and running the action that was
  current when it was dispatched. The dispatcher keeps one identity across
  renders, and `isPending` stays true until the queue drains. An action error now
  reaches the nearest `universalTry` boundary (or the root's `onUncaughtError`),
  keeps the prior state, and lets later queued dispatches continue. A
  function-valued state is now stored rather than called.
- d455cb1: Universal renderers now treat a React-style `key` attribute on the only root of
  an `@for` row as the row key, exactly as the DOM renderer does. It takes
  precedence over a header key and compiles byte for byte like
  `@for (…; key expr)`, for intrinsic, component and Activity roots. Before,
  universal renderers read only the header, so a row keyed by its root attribute
  fell back to a positional key: its state followed the slot rather than the item
  across reorders, and the attribute stayed on the root as a separate key that
  kept the row off the static-prop, owner-free and template-program row lowerings.
  A root key that reads a name declared inside the row body is now a compile
  error.
- 40f4827: Import only the renderer helpers a universal module's output references.

  Universal compiler output used to import every region helper from its renderer
  module, whether or not it called them. A standalone renderer runtime exports only
  the helpers it implements, so bundlers such as esbuild rejected the unused
  imports. The Lynx main thread hit this after `universalBlock` was added: even a
  plain `<view />` component failed to link.

  `octane/universal` and `octane/universal/native` now also export `useFormState`,
  the pre-19 name for `useActionState`. The universal compiler already accepted
  that import from `octane`, but no universal runtime provided it.
- 4180828: Stop a universal renderer Suspense retry, including in Lynx, from livelocking
  when it keeps suspending on a thenable that has already settled. Before, each
  retry ran on that thenable's next microtask, so timers and native callbacks
  never ran and the suspension could never end. This happened when a thenable's
  owner publishes its `status` on a later task, or when a reverse-region DOM child
  routed the same suspension back to its universal owner. A universal root inside
  a DOM Suspense boundary could loop the same way. A retry now waits one task once
  the thenable's settlement has been seen, as React's Scheduler does. A first
  settlement still retries right away.

  Universal `use()` no longer rewrites a thenable `status` it did not set. Before,
  it replaced a status React does not recognize, such as router-core's
  `'resolved'`, with its own `'pending'`/`'fulfilled'` tracking. It now leaves the
  status alone and treats the thenable as pending, matching React and the DOM
  runtime.
- c587109: Give `useOptimistic` on universal renderers the React 19 semantics the DOM
  runtime already has. It previously ignored every passthrough value after the
  first and never reverted an optimistic update. An optimistic update now shows
  at once, even inside a transition, and rebases onto each new passthrough. It
  reverts in the same commit as the transition it was dispatched in, or the
  pending async action it follows, including when that action fails. An update
  dispatched outside any transition shows once and then reverts. Without a
  reducer, a function action updates the pending state, as in `useState`.
  Dispatching an optimistic update while its component renders now throws, as in
  React.
- ba483f4: Without a reducer, `useOptimistic` now applies a function action as an updater
  that receives the pending optimistic state, as `useState` does and as React 19
  does. It previously stored the function itself as the optimistic state. Updaters
  now chain, and they rebase onto each new passthrough while the action is
  pending. The dispatch type without a reducer is now
  `(action: State | ((pendingState: State) => State)) => void`.
- c37f922: Start a `<ViewTransition>` on the live document when a boundary is nested inside a component's compiled template that has not been inserted yet. The staged clone still belongs to the inert `<template>` document, so Octane picked that document as the transition owner. Its `startViewTransition` returns `null` because it has no browsing context, and the commit threw `Cannot read properties of null (reading 'ready')`, leaving the old screen in place. The owner now resolves through the parent block's host when the boundary's own parent belongs to a document without a `defaultView`.
- 007691e: Keep an unchanged nested `<ViewTransition>` paired when an ancestor boundary animates.

  The nested boundary was captured on the old side only, so its old snapshot played the boundary's `update` class on its own, over the ancestor's new snapshot that already paints the same element. It now keeps its name on the new side too, as React does, and cross-fades in place.

## 0.6.3

### Patch Changes

- df0a086: JSX returned by a direct call of a named `function` declaration now resolves its non-literal props and children where the value renders, the same as JSX returned by an arrow function or method. Previously such a call read context and other values during the call, and the server rendered the value to HTML immediately, so a server-rendered fragment root or `.map()` row could disagree with the client. Rendering the same function as a component (`<Row />`) is unchanged.
- 962ed16: Direct calls to hot-reloadable exports now behave the same in development as in production. Calling an exported return-JSX function directly with a second argument, as in `renderRow(item, index)`, no longer makes the next hot update throw `TypeError: Cannot read properties of undefined (reading 'disposed')`, and a `null` second argument no longer throws at the call. Direct calls also receive their `this` and every argument unchanged, where development previously passed exactly three arguments, dropping extras and padding missing ones with `undefined`.
- 9441ccb: Node now loads a build that reads `process.env.NODE_ENV` once per module instead of at every development check. ESM imports get it through a new `node` export condition, and `require()` gets it through the CommonJS build. Unbundled server rendering is faster, and deleting the `process` global after import no longer turns framework errors into `ReferenceError: process is not defined`. Set `NODE_ENV` before the first Octane import in Node. Browser bundles are unchanged.

## 0.6.2

### Patch Changes

- 010c88c: Reduce production bundle overhead for modules that only report errors without arguments, while preserving development messages and parameterized errors.

## 0.6.1

### Patch Changes

- 9b6c3a4: Include imported theme styles in server output when `$class` or a class-map entry was captured at module scope or cached during an earlier render. Collect the theme and its dependencies when the class is rendered, preserving request-specific styles, dependency order, and CSP nonces.
- 5f58b63: Production builds now report signal-engine, hydration, and DOM-binding errors as compact `Minified Octane error #<code>` messages instead of shipping their full English text. Development messages are unchanged.
- 1e4f1ee: `createElement` now accepts `null` as its config under `strictNullChecks`, matching React's `props?: P | null` signature. A bare `null` config infers props from the element type alone, and a non-null config still enforces required props. `Fragment`'s props are exported as `FragmentProps` (as in React), so declarations emitted for `createElement(Fragment, null)` reference that type instead of inlining it.
- 5a05767: Preserve and activate server-rendered content when a document shell hydrates a selected owner alongside portal siblings.
- 1bebd3b: Re-export `__methodDep` from `octane/universal` and `octane/universal/native` so compiler-emitted method-call dependency imports resolve on universal targets. Universal builds previously failed at module resolution while the default entry compiled fine.
- e813fc0: Prevent ReactCompat host elements from adding a layout box around React content.
- 211144a: Collect applied theme dependencies before a stylesheet first enters a server response, including when a component and its extending theme share a module. This preserves base-before-override CSS order and includes base-defined CSS variables for captured class-map entries.
- 5f58b63: Trim production runtime overhead: hydration root recovery no longer stringifies the root component or builds dev-only diagnostics in production builds; delegated events with no handler on their path leave the native event's `stopPropagation`/`currentTarget` untouched; and native-read modules no longer enter an empty read scope for empty `@if`/`@else` arms.

## 0.6.0

### Minor Changes

- 4b235d2: Add opt-in parser-time capture of native SSR form submissions. Forms naming a behavior owner can accept button, implicit Enter, and requestSubmit commands before client registration, preserving immutable accepted fields and submitter metadata for exactly-once behavior delivery. Behavior roots consume these commands with the optional captureFormSubmissions factory, keeping form routing out of ordinary behavior bundles. Unclaimed commands have a bounded lease, and forms without opt-in preserve native behavior.
- 6e86908: Report unsupported JSX spread children in client and server compilation and in editor diagnostics. Assigned style blocks now keep all selectors, including element and descendant rules that apply to elements carrying a class entry from the block.
- b9b0bc4: Support `@{ … }` blocks at JSX child position on universal renderers. Setup-bearing blocks now compile to a new `universalBlock` descriptor that materializes inside a persistent child scope at the block's sibling position, matching the DOM `childSlot` lowering: hook state survives parent re-renders and effect cleanup runs when the scope is discarded. Empty blocks are dropped and render-only blocks merge into the parent template, and the explicit `{() => @{ … }}` scoped-child spelling lowers to the same form. `@{ … }` inside `@if`/`@for`/`@switch`/`@try` bodies — previously emitted as a raw statement that failed printing — compiles through the same path.

### Patch Changes

- 411c555: Match server and client hydration boundaries for render-function children in
  descriptor hosts, preserving their DOM identity, refs, and events alongside
  component siblings.
- ac2a217: Upgrade `@tsrx/oxc` to 0.16.0 so `oxlint` parses a project's `.oxlintrc.json` with the project's own Oxlint when that one is newer than the vendored pin. A rule added to Oxlint after the pin is no longer rejected as unknown.
- c3dda51: Fix universal-renderer compilation of JSX used as a value in expression position — a component prop (`card={<Card/>}`), a sole expression child, or a renderable hole. The universal expression rewriter lowered only nested template nodes, so a root JSX expression passed through to DOM codegen and emitted descriptor-runtime helpers (`createScopedValue`, `createElementFromConfig`) that universal entries such as `octane/universal/native` do not export, breaking native bundles. Root JSX now lowers to the same `universalValue`/`universalComponent` representation as nested JSX.

## 0.5.0

### Minor Changes

- 752d750: Allow custom SSR hosts to share an immutable initial document signal seed with root, deferred, independent and streamed hydration. Matching native historical reads use versioned manifest references, while differing histories retain their own entries and live writes remain authoritative after adoption commits.

### Patch Changes

- 3390f40: Build newly visible fragment content inside an empty server hydration range without adopting its closing marker, preserving surrounding server nodes and mismatch diagnostics. Preserve immutable component framing across split Hydrate captures, retain separate server frames for mutable or shadowed component bindings, and build replacement component bodies as client DOM. Keep reassigned component declarations writable and decline callsite assumptions about their original bodies.
- d285bd7: Diagnose actual eager imported signal `.get()` reads when activating compiled DOM
  bindings instead of silently presenting an unsubscribed snapshot. Pass a signal
  handle directly for a live binding, or provide a deliberate sample through the
  BindingSource snapshot. Props-based sampling, pure foreign `.get()` methods and
  already subscribed native attribute projections keep their existing behavior;
  ordinary SSR reads are unchanged.
- 701b8c3: Allocate a signal scope's request, resource, streamed-result, derived-binding,
  adoption and trace bookkeeping only when those features are used. A `useSignal$`
  hook scope now retains about 70% less memory, and bundles that use scoped
  signals without streamed results are about 700 bytes smaller after gzip.
  Streamed selections move into a capability that only the stream ingress
  functions create.
- 4f25786: Allow native host binding leases to hand off known unbound provider spreads while preserving renderer ownership of external styles and children.
- afc0bee: Compile fixed-node `'use dom bindings'` views whose channels are all attributes,
  booleans, ARIA/data attributes, classes or text to a scalar-only adopter. It keeps
  the same claims, signal handles, transition presentation and cleanup, but no
  longer ships the projection, control, class-group, style-restoration, host-handoff
  or URL-sanitization code these views never use. The documented `adoptBindings`
  example is about 41% smaller after gzip. Views with other channels keep the
  general adopter.
- 2d46905: Update the shared TSRX compiler dependency to `@tsrx/core` 0.3.2. Each `@switch`
  arm is now its own block scope, so two arms can declare the same local, and
  `@import` inside a `<style>` block is now the `tsrx-css-import` compile error.

  `octane/tsrx-iterable` also re-exports `map_iterable_async`, which core now uses
  in the editor for a `@for` whose body awaits, so the loop binding keeps its type.
  Type inspection claims only that loop's `@for` keyword.
- a95c2dc: Keep `.tsrx` modules that only declare signals renderer-free, as plain `.ts`
  modules already were. They previously activated the renderer's native-read
  driver on load, so a renderer-free consumer such as `adoptBindings` bundled the
  renderer (about 24 KB gzip in a measured example). Modules that render signal
  reads still activate native reads themselves through their documented
  `octane/signals` import; a component that reads signals during render without
  that import no longer relies on the declaring module to activate them.
- fd81578: Return `@else if` branch values on universal renderers. An `@else if` arm
  parses to an `IfStatement` alternate, which the universal compiler routed
  through block codegen: the chained branch values were emitted as setup
  statements and the else thunk returned an empty range, so every arm but the
  first rendered nothing. The else thunk now returns the chained `universalIf`
  value, so `@if`/`@else if`/`@else` chains — including chains nested inside
  another arm — select their branch correctly.
- bdd7db7: Allow `@for` without a `key` clause on universal renderers.

  Universal lowering used to reject `@for (const x of xs)` with "universal @for
  ranges require an explicit key", forcing boilerplate on static or throwaway
  lists. The universal runtime reconciles ranges by key only — there is no
  unkeyed path — so the compiler now synthesizes a positional key
  (`(item, index) => index`) when `key` is omitted, matching the implicit-index
  semantics an unkeyed list has elsewhere.

  An explicit `key` is unchanged and still recommended for reorderable stateful
  rows: with a positional key, item state (hooks, component owners, uncontrolled
  leaf state) follows the slot rather than the item across reorders. The DOM
  renderer is untouched — its unkeyed `@for` continues to fall back to
  `x.id ?? x`.
- 47580bd: Keep a live Suspense replay alive across an unrelated scheduled render so a
  settled boundary still reveals its content.

  A committed `@try`/`@pending` boundary wires its thrown thenables into a local
  replay: on settle the root queues a microtask that re-renders with the pinned
  memo cache. The next scheduled render unconditionally deactivated that replay
  before preparing its own attempt. When the render only re-executed a scoped
  owner, or retained the suspended subtree because its inputs looked unchanged,
  nothing else ever re-attempted the region — the pending arm stayed on screen
  after its promise had already resolved.

  `prepare` now hands a live non-transition replay's memo cache to the fresh
  attempt and disables retention for it, so the render itself re-attempts the
  suspended regions. A settled boundary resolves inside that commit; one still
  waiting on its thenables re-suspends and republishes a fresh replay.
  Transition replays keep their existing supersede semantics.

## 0.4.3

### Patch Changes

- d9ed0f4: Load compiled `.ts` and `.tsx` modules with Bun's TypeScript loader in
  `octane/compiler/register`.

  Compiled output for a `.ts` or `.tsx` source keeps the TypeScript constructs that
  have runtime semantics, such as `enum`. Vite's TypeScript transform consumes the
  same output. The Bun preload used to hand this output to Bun as plain
  JavaScript, so a component module that declared an `enum` failed with a syntax
  error. It now keeps the source file's loader. Compiled `.tsrx` output is still
  loaded as JavaScript.
- 3fbe5b5: Specialize the common app-entry root shapes in production builds, not only
  `createRoot(target).render(App)` in a plain `.ts` module.

  A root whose whole lifetime renders compiled `@{}` components skips the
  returned-value reconciler and its bundle graph. That proof now covers:
  - `createRoot(el).render(<App />)` and `hydrateRoot(el, <App />)` in `.tsx`
    and `.tsrx` entries;
  - the documented module-level `const root = createRoot(el); root.render(App)`
    when `root` is not exported; and
  - `hydrateRoot(el, App, props)` in plain modules.

  A one-component Vite entry that renders `<App />` drops from about 70 KB to
  28 KB gzip, and a direct `hydrateRoot` entry from about 88 KB to 50 KB. On a
  proven root, `<App a={x} />` with literal, function, or identifier attribute
  values is passed to the root as `App` plus its props, with live `defaultProps`
  applied as before. Keys, children, spreads, and other attribute expressions
  keep the element path.
- ae7f970: Close four compiler soundness gaps in inferred proofs and generated code.

  - Builtin text-conversion proofs (`{String(x) as string}` and primitive locals)
    now share one mutation check. A replacement of `String`, `Number`, `BigInt`,
    or `Date` reached through a `let` alias, a parameter, `globalThis.globalThis`,
    or a returned global object no longer keeps the builtin proof, so SSR renders
    the live value instead of throwing. Computed reads and application `.set()`
    calls on ordinary receivers no longer decline primitive-local proofs.
  - Independent `<Hydrate>` boundaries reject captures initialized by
    destructuring or parameter defaults (`const { value = useRef(null) } = props`)
    and by function or class declarations with
    `OCTANE_HYDRATE_INDEPENDENT_OWNER_CAPTURE`, instead of serializing them as
    JSON.
  - Automatic `use()` creation dependencies no longer read ambient globals that
    appear only inside callbacks or behind guards the compiler cannot replay
    (`try`/`catch`, `switch (typeof x)`, `'x' in globalThis`, `??`). Nullable
    locals read in those positions become optional reads (`value?.prop`). A
    non-arrow callback's `arguments` no longer becomes a component dependency.
  - Generated source origins are applied copy-on-write everywhere, so a scoped
    `<style>` inside a reverse renderer region (`<Html>` in an object scene)
    compiles the same way whether or not parser ASTs are frozen.
- d9ed0f4: Throw a migration error in development when code reads `Context.Provider`.

  `Context.Provider` was removed in favor of rendering the context itself as the
  provider (`<Ctx value={…}>`). The compiler already rejects `<Ctx.Provider>` when
  `createContext` is in the same module. When the context is imported from another
  module, however, the client used to fail with "Element type is invalid … got:
  undefined" and the server with "comp is not a function". Neither message
  mentioned the migration.

  In development, reading `.Provider` on a context from `octane` or `octane/server`
  now throws `[OCTANE_CONTEXT_PROVIDER] Context.Provider was removed. Render the
  context itself as the provider: <Context value={...}>...</Context>.` The
  `.Consumer` warning now shares the same development-only helper. Production
  bundles are byte-identical, and `.Provider` there is still `undefined`.
- 08d9a82: Stop rendering a dormant `Hydrate` boundary's earlier captures in development. When a mounted parent changes a dormant boundary's captures or provided context before it activates, Octane now repairs the server HTML's attributes, class, style, and text without a hydration warning or `onRecoverableError`, in development and production. Before this, a legitimately changed text hole reported a recoverable text mismatch. Mismatches in a boundary that activates with unchanged captures are still reported.
- 57072e7: Fix hydration of an empty `{x as string}` text hole that shares its parent with other nodes, such as `<p>{b as string}<After /></p>` with `b = ''`. The server now emits a one-node `<!---->` stand-in for the empty hole, so later siblings are claimed at the right position. Previously the following component was rebuilt or duplicated, and in some shapes the whole root was left empty. Hydration recovery also no longer removes nodes outside the block being recovered, so a misaligned claim cannot blank its host.
- 0df8be7: Keep keyed `@for` rows live when they read module state or mutable globals.

  A row that reads a module `let`/`var`, a reassigned module function, or a
  host or application global such as `location` or `window` no longer takes the
  PURE or DEP-PURE survivor skip. Neither item identity nor the deps tuple can
  witness those reads, so an unchanged row stayed stale after the value changed.
  For example, `@if (location.pathname === item.href)` never moved the active
  row. Since #1213 this also affected rows whose only control flow is a
  host-only `@if`. Rows reading module `const`s, unreassigned functions, and
  standard language globals such as `Math` keep the fast path.
- bfbba3f: Independent `<Hydrate>` widgets now activate on `idle()`, `visible()`, and
  `media()`.

  Before this change only `load()` and captured interactions activated an
  independent island. A widget with `when={idle()}`, `visible()`, or `media(q)`
  compiled cleanly and server-rendered its strategy, but the island bootstrap
  never installed a trigger, so the widget stayed inert until it was clicked.
  Its effects, timers, and subscriptions never started.

  The server now writes each of these strategies' non-default parameters on the
  independent boundary. The bootstrap installs the same idle callback,
  `IntersectionObserver`, or `matchMedia` listener that ordinary boundaries use.
  It removes a pending trigger on pause and dispose, and re-installs it on resume.

  `condition()` and a function-form `when` need the lexical parent to re-evaluate
  them, so they cannot drive an independent widget. The compiler rejects either
  form when written directly (`OCTANE_HYDRATE_INDEPENDENT_WHEN`). An opaque `when`
  value that resolves to either one makes server rendering throw instead of
  shipping a widget that never activates.
- 8a3a1e7: Adopt instance-keyed server signal state inside independent `<Hydrate>` islands.

  The client island adapter recreates the server's Hydrate frame as a component
  scope, and that scope added its own invocation segment to every descendant's
  signal instance key. The server renders island children directly under the
  island's root key, so a component inside `<Hydrate independent>` computed a
  different key on each side. Instance-keyed server state, such as a `query$`
  result, was then never adopted: activation ran the browser producer again. The
  frame now resolves to the island's root key, so client and server keys match
  with or without an `@try` around the component.
- 8620e76: Keep signal declarations inside keyed `@for` rows independent during SSR, and match their row identities during hydration, edits, and reordering.
- 4467583: Keep initially empty provider children anchored to the surviving hydration range so opening nested provider content after hydration does not throw `NotFoundError`.
- b353a67: Fix memo skipping updates when an own prop matching an inherited Object.prototype value is replaced by another prop.
- b27e99a: Keep same-module root, private Context and compiled `Hydrate` specializations in production builds that configure renderer boundaries. Only a module that renders a boundary tag now falls back to the generic paths, instead of every module in the project.
- 78da1e4: Preserve `__proto__` shorthand data properties when specializing DOM binding
  child programs with fixed primitive props. Adoption and mounting now retain the
  authored text and attributes without introducing object-literal prototype setters.
- e4bb4e0: Let esbuild tree-shake unused `createContext`, `memo`, `lazy`, and `createPortal`
  results.

  Octane declares these factories `/* @__NO_SIDE_EFFECTS__ */`. Rollup and Vite
  apply that annotation to calls in other modules, but esbuild never does: it
  decides tree-shaking per file. Under esbuild, an unused module-scope
  `const Ctx = createContext(…)` therefore counted as a side effect and pulled in
  the whole client runtime through the context's provider body.

  The compiler now marks direct calls to these imports with `/* @__PURE__ */`, the
  call-site convention every bundler honors. It does this for compiled
  `.tsrx`/`.tsx` modules and for plain `.ts`/`.js` modules, including modules with
  no hooks. Server output still marks only `lazy()`, because the server
  `createContext` registers the context it creates. Calls through a local that
  shadows the import are left alone.

  In the `@octanejs/aria` minimal-import bundle, which imports only
  `useSeparator`, esbuild output drops from 197,180 to 8,667 bytes raw (63,197 to
  3,349 gzip). Vite output is unchanged.
- 3f43780: Avoid quadratic option copying when preparing controlled multi-select updates for View Transitions, while preserving native selection behavior and commit isolation.

  Expose the controlled select projection benchmark through the MCP benchmark tool.
- 3249c9a: Reduce the cost of potential signal bindings in ordinary code. A prop-driven attribute such as `title={props.label}` now passes its statically selected scalar writer to the binding, so production bundles no longer retain the generic attribute route with its form-control writers and DOM routing tables (−5.1 KB gzip for a one-component counter). Text and attribute bindings no longer retain the restored-textarea hydration helper. In modules that import `octane/signals`, an object-literal `style` with scalar values is written directly and allocates its owning Block only once a signal handle appears, and components that evaluate no authored code skip the native-read bracket.
- 1871491: Keep component-local SSR signals independent for distinct object, function, and symbol list keys, without coercing opaque reconciliation keys. Preserve their identity through retries, hydration, and row reordering.
- ea4e8be: Release an idle streamed-signal upstream as soon as its response is abandoned.

  `createStreamedSignalResultFrames` ran as an async generator that awaited the
  upstream iterator's `next()`. Cancelling the generator queued its `return()`
  behind that pending read, so an idle but open source such as an LLM token
  stream, WebSocket, or SSE feed was only returned once it produced another
  value. A client disconnect, request abort, or inactivity timeout could leave
  it open indefinitely. Every producer wait is now interruptible. The consumer's
  `return()` and the request signal settle the pending wait immediately, and the
  upstream's `return()` runs then. Backpressure, the inactivity-timeout rules,
  and the result frame grammar are unchanged.

  Automatic streamed signals now degrade per channel at the 256-live-channel
  budget. Previously the 257th concurrently live attempt failed the entire
  multiplexer and threw away every in-flight result. Now only the overflowing
  attempt is refused: it is neither streamed nor announced, so the browser loads
  it itself.
- 93ddb5a: Preserve child nodes when unchanged trusted HTML is rendered after hydration or on the client, including fresh `trustHTML()` wrappers.
- 929f1a6: Compile TypeScript enums, value namespaces, import aliases, and class parameter
  properties in `.tsrx` modules to plain JavaScript.

  Vite does not run its TypeScript transform on `.tsrx`, so the compiler's output
  has to be JavaScript already. Before this change an `enum` or value `namespace`
  was printed as written, and `vite build` stopped with `[PARSE_ERROR] Unexpected
  token`. A `constructor(private x)` parameter property lost its assignment
  without any error.

  These declarations now compile to the same JavaScript tsc produces for an
  ES2022 target:

  - Enums get numeric auto-increment, reverse mappings for non-string members,
    constant folding and self-references, `export enum`, and declaration merging.
    A `const enum` is emitted as a regular enum, which is what `preserveConstEnums`
    and isolated-module builds do.
  - Value namespaces cover exported variables, functions, classes, and nested
    enums and namespaces, dotted names such as `namespace A.B`, and merging across
    blocks and with functions or classes.
  - `import X = A.B` becomes a variable, and it is dropped when nothing reads it.
  - Parameter properties are declared as class fields and assigned in the
    constructor, after `super(…)` in a derived class.

  Abstract members, index signatures, and method overload signatures are no longer
  printed into the output either.

  Some constructs have no ES-module equivalent and now fail with a compiler
  diagnostic instead of a bundler parse error: `export =`, `import x =
  require(…)`, a destructured export inside a namespace, and an enum member without
  an initializer when the member before it is not a constant number.
- d57f1b4: Reuse committed universal Suspense primary ranges when retaining pending content, avoiding repeated root-wide searches while preserving host identity and visibility.

## 0.4.2

### Patch Changes

- 4b0eac4: Compare deferred hydration attributes with historical native signal values in development diagnostics. Keep local signal comparison state disposable and isolated from live subscriptions, writes, refs, and effects.

## 0.4.1

### Patch Changes

- 36d5f5e: Initialize dynamic iframe sources before connecting the frame to the document, avoiding a transient sandbox warning for foreign URLs while preserving source updates.
- 3da41d5: Accept supported native lowercase HTML attribute names in development host-property diagnostics while preserving guidance for casing mistakes, framework-only props, and SVG attributes.
- 4ac71d2: Keep roots added by initially empty sibling slots inside conditional and switch arms so replacing an arm removes all of its content.
- 4efa520: Keep eligible intrinsic `@for` row roots on the native template path when an explicit root `key` supplies the row key. This preserves keyed reordering, uncontrolled input state, and hydration adoption without the redundant descriptor boundary. Existing key precedence and component key boundaries remain unchanged.

## 0.4.0

### Minor Changes

- 34e83ce: Recognize an `octane.source` manifest marker on linked and workspace packages. A package outside `node_modules` that receives Octane transitively from a shared toolkit can now declare `"octane": { "source": true }` instead of re-adding an `octane` version range it does not own, purely as a compiler marker. Installed packages under `node_modules` still require a declared `octane` dependency, and ownership stays explicit per package.

### Patch Changes

- 3a859dd: Specialize DOM binding child programs for explicitly fixed primitive props so unused presentation branches do not ship. Caller propagation is opt-in through `domBindingFixedProps`; default child requests remain generic and shared. Dynamic values, literal defaults, DOM adoption, and renderer hydration handoff retain their existing behavior.

  Expose the fixed-prop binding benchmark in the MCP benchmark tool alongside the unified runner.
- 620769b: Admit keyed `@for` item bodies whose only nested structure is host-only
  conditional content to the `forBlock` PURE fast path: an `@if` arm that renders
  only host output (including a narrowly proven nested keyed `@for`) carries
  nothing opaque, so with no parent captures the body is a pure function of the
  item and unchanged-identity survivors skip re-render entirely. The admission
  fails closed — a component tag inside the conditional, one hidden behind a
  function boundary such as a memoizable call's `t => <Tag />` callback argument,
  a render-time hazard like an assignment in the `@if` test, or a live imported
  member read keeps the body off the pure path.
- dbcabb2: Store signal-instance identity directly on scope and block fields instead of a
  per-mount `WeakMap` record, so stamping a component's scope costs a handful of
  stores rather than an allocation plus a map entry. Lite components resolve their
  signal owner without allocating a per-mount closure when the owner is already
  current, and dormant blocks — no registered effects, no root-transaction capture
  — skip the render bookkeeping those subsystems only need once armed. Effect
  Event payloads queued under a hidden Suspense boundary now park on the boundary
  and publish at reveal, so a rolled-back render never installs a stale impl.
- 92227f6: Add `createResizeObserver` to deliver coalesced native resize notifications in a
  separate task, with queued-entry cleanup on unobserve and disconnect. Ordinary
  state updates keep their existing microtask batching.

  Use deferred observer callbacks in Base UI measurement components and Floating
  UI's element-resize adapter so geometry-affecting updates can settle without
  ResizeObserver delivery-loop warnings. These bindings now require Octane 0.3.7
  or newer in the 0.3 release line. Initial synchronous measurement and positioning
  remain available, and the global ResizeObserver constructor is unchanged.
- 6580880: Preserve following server-rendered components and bind their events when a completed `@try` boundary hydrates, catches a client error, or waits for a client retry.
- db35ac1: Preserve pending native query streams when a parent rerenders with unchanged captured inputs, avoiding duplicate browser producers during streamed hydration. Changed inputs still replace the pending primary.
- f209f7c: Preserve the root signal namespace when hydrating streamed Suspense arms, so queries adopt server results instead of starting duplicate browser producers.
- a2c3e07: Replay captured independent-island interactions after the adopted primary commits, so controlled input adoption cannot restore text cleared by an early command. Pending or removed islands retain or cancel their captured interactions until their owning lifecycle can replay them safely.
- a2c3e07: Keep query and derived computations attached to live signal inputs when their declarations are first resolved during historical hydration. Queries now reselect after later input changes without repeating a completed initial server request.

## 0.3.6

### Patch Changes

- 28f31c3: Thread deferred native acceptance through suspense resume and hidden-reveal publication.

  `commitResumeInner` and `attemptHiddenRevealInner` discarded the result of `acceptNativeCapture`, so a capture whose acceptance the deferred-layout driver had staged still reached `spliceOffscreenCapture` with `deferredNativeAcceptance === false`. That splices an unaccepted capture and throws "A native capture must be accepted before publication." out of a suspense-retry or reveal commit, abandoning every effect, ref attach, and store sync queued on that commit. Both sites now pass the flag the way `flushRootTransactions` already did.
- be361b4: Preserve the full resolution when the Vite plugin rewrites a client runtime
  request to its server counterpart during an SSR build.

  The hook returned only `resolved.id`, so `external: true` was dropped and
  rolldown tried to bundle an external specifier such as `octane/signals/server`
  as a path relative to the importer, failing the build with
  `UNLOADABLE_DEPENDENCY`. Returning the resolution keeps `external` along with
  `moduleSideEffects` and `meta`.

## 0.3.5

### Patch Changes

- 8b95363: Reuse buffered streamed-result frame sizes when partially draining the browser mailbox, avoiding repeated serialization and UTF-8 encoding while preserving its byte limit.

## 0.3.4

### Patch Changes

- 87f19a8: Clear a component's previous returned subtree when its next output is undefined, including bare returns and optional ViewTransition children. Removed children dispose effects and refs and remount with fresh state while parent state is preserved.

  Correct lazy handoffs to compiled template branches, lists and Activity output, preserving updates, Activity hide/reveal and cleanup. Discarded renders retain committed output, nested branch removal preserves following siblings, and compiled imperative completion still preserves rendered content. Fixes [#1186](https://github.com/octanejs/octane/issues/1186).
- e855d68: Fix focused DOM moves between parents in the `insertBefore` fallback, including staged commits and shadow-DOM editors. Anchored moves no longer throw or hang, and append moves place the node correctly. Same-parent reorders preserve editing continuity. Fixes [#1182](https://github.com/octanejs/octane/issues/1182).
- 2a952b8: Keep deferred hydration dormant when a native signal refresh rechecks an unchanged false condition, preserving server DOM and native subscriptions until activation. Parent capture and provider-context updates still activate children with current values, including memo-wrapped boundaries and queued refreshes. Fixes [#1180](https://github.com/octanejs/octane/issues/1180).

## 0.3.3

### Patch Changes

- 138ec3c: Compare deferred hydration attribute diagnostics with the initial client captures while activating children with the latest values. Mounted parent updates no longer produce false development attribute mismatches, and genuine initial mismatches remain visible even when corrected before activation.

## 0.3.2

### Patch Changes

- ec57015: Keep scalar binding caches coherent when hydration retains an early DOM binding's publication, so the next normal render can restore historical props after the early binding is released.
- 167ee71: Adopt eventless restored textarea values into writable signals during initial binding, hydration, and accepted early-control takeover while preserving newer model and native-edit precedence.
- 751d0de: Preserve native Undo/Redo grouping for controlled textarea edits by updating their existing baseline text node. Keep native form reset consistent with the current value for writable signals as well as ordinary controlled textareas.
- 0724b1f: Preserve live signal values when a `satisfies`-wrapped assignment replaces a global conversion constructor before rendering.
- 167dfe9: Give every hydration wire literal exactly one owning module. The `@for` arm
  markers, the presentation-binding comment prefixes, the deferred-boundary
  attribute names, the `useId` spelling, the element-scoped `<ViewTransition>`
  stylesheet, and the cross-realm `Symbol.for` tags were each re-typed in two to
  five modules, so a change on one side of a hydration boundary could diverge from
  the other without any test noticing. They now live in `hydration-markers.js`
  (which stays off the `dom-tables.js` graph so the pre-root capture bundle can
  share them), `dom-binding-protocol.js`, `css.js`, and a new `runtime-tags.js`;
  `octane/constants` re-exports the same names and values as before.

  Adopting a presentation view whose range carries no view id is now rejected
  outright instead of being compared against the string `"[b;undefined;root"`.
- 27a37b6: Avoid allocating temporary UTF-8 buffers when checking streamed signal injection byte limits on Node hosts. Preserve the same frame bytes, limits, ordering, and backpressure, with unchanged TextEncoder accounting on hosts without Buffer.

## 0.3.1

### Patch Changes

- c49ccb6: Skip dispatch and transaction snapshots for unchanged compiled native callback data while preserving ownership refresh, staged publication, and rollback for changed callbacks and captures.
- eda8994: Production DOM compilation uses a smaller deferred hydration body for compiler-generated template children with no authored fallback. Boundaries with `split={false}` can omit generic returned-output and fallback rendering while retaining SSR adoption, interaction replay, suspension and cleanup. Descriptor children, spreads, explicit fallbacks, split loaders and development/HMR builds retain the general Hydrate path.
- a44c082: Preserve matching server-rendered list ranges when hydration resumes a pending lazy child. First-fill adoption now starts inside the list's retained range, and only first-fill adoption discards extra server items. Genuine list mismatches still report recoverable errors and remove the extra items.
- b819a83: Defer server-side signal identity serialization until an actual handle is read. Ordinary object-keyed lists no longer coerce reconciliation keys merely because opaque output might contain a handle. Actual handles retain the same nested-list and component-key identities across SSR, hydration and reordering.
- a52d50f: Avoid redundant signal value adapters for immutable local values whose initializers are proven to return JavaScript primitives. Keep native read tracking, controlled input markers, and the existing potential signal capability for models imported after mount.
- 805deef: Reduce production DOM bundles for private contexts whose complete usage is proven to stay in compiled template providers and canonical context reads. Both the context factory and provider call omit generic returned-element and descriptor-child rendering. Exported, escaped, reflected, aliased, and opaque contexts retain the callable context API and generic child support; provider identity, state, SSR adoption, and cleanup stay unchanged.
- 17970fe: Avoid rewriting unchanged native event authority while preserving ordered staged publication, rollback, retired invocations, and owner changes.
- 9291944: Skip repeated signal-binding policy and handle probes for stable scalar attributes. Continue evaluating authored expressions, reconciling undefined attributes during hydration, reading signal handles, and restoring controlled inputs.
- 47d5d1d: Preserve the production compiler's closed Context lifetime proof through generated Hydrate capture slots, so private compiled providers can keep their existing void output path across code splitting. Exported contexts, authored capture overrides, opaque provider children, and unproven bindings retain the generic rendering path.
- 068ead5: Reuse the whole-style rollback snapshot for consecutive fixed-key declaration updates within one render checkpoint. Preserve separate hosts, intervening writes, CSS value coercion order, and abandoned or staged render restoration.
- 0b48d5d: Reduce production client bundles for compiler-extracted Hydrate templates without an authored fallback. Code-split boundaries reuse the compiled-child policy while preserving preload captures, native hydration, suspension, retry and cleanup. Authored overrides and opaque callers retain the general rendering path.
- 40ff19f: Initialize potential SSR signal identity recipes in the component frame's initial
  object shape, while keeping ordinary frames free of optional identity fields.
- cc7a8c6: Release completed streamed signal channels after transport acknowledgement, count only live channels against the automatic stream limit, and drain ready channels without rescanning completed history. Reuse serialized frame byte counts without changing the wire format.

  Treat streamed signal and NDJSON timeouts as inactivity limits rather than total response deadlines. Pause producer timeouts during backpressure and renew browser result timeouts on accepted progress, preserving cancellation, replay protection, and byte and mailbox limits.

  Cancel abandoned injection producers when a streaming renderer fails or its consumer cancels, including producers paused while waiting for transport acknowledgement.
- 3350a41: Preserve live signal values when visible global-constructor mutations invalidate inferred inline conversion results, including wrapped and extracted native mutators.

## 0.3.0

### Minor Changes

- a6d7f49: Remove the legacy `Context.Provider` alias from client, server, and native contexts. Provide values with `<Context value={value}>` or `createElement(Context, { value }, children)` instead. The compiler rejects statically recognized legacy Provider access with migration guidance, and Octane bindings now use contexts directly. Binding peer ranges accept Octane 0.3 alongside their previously supported runtime lines.

### Patch Changes

- debd7df: Specialize nonescaping function-local const roots in production JavaScript and TypeScript entries when every render uses an imported compiled void component. Keep writable component exports on the generic rendering path so authored replacements can return ordinary renderable values.
- 873f4d2: Move native signal transition coordination behind the signals model capability so ordinary client applications no longer retain its preparation, retry, and publication policy. Preserve signals imported after an async Action awaits and atomic updates to consumers that receive signal handles through props.

  The model entry now retains this coordinator, increasing standalone signals and signal-using SSR bundle sizes.
- 68a6690: Preserve explicit signal ownership when native event handlers are installed by components without signal bindings, including handlers adopted during hydration. Refresh ownership when bare or compiler-lifted handlers publish changed callbacks or captures, while keeping the committed authority if a suspended update is abandoned. Keep already queued native callbacks under their original authority when an earlier listener publishes a replacement. Avoid extra publication calls during ordinary mounting and updates that keep the same scope authority, and record rollback without per-handler undo closures.
- c32e76b: Keep fixed scalar inline styles on their ordinary writers inside modules that use signals, while preserving reactive reads and native bindings for handles, spreads and accessors.
- 14fd908: Allow text and attribute signal bindings to omit unused form-control writer and
  hydration adoption policies from production bundles. Keep the compiler helper
  ABI, scalar caches, live subscriptions, and native control behavior unchanged.
- 893cc83: Specialize production function-local roots created or hydrated with stable same-module compiled void components when their complete lifetime uses only proven void bodies. Preserve generic roots for escaping roots, writable component bindings, unknown initial or later render targets, development and alternate renderer modes.

## 0.2.16

### Patch Changes

- 2049fa7: Keep native-only DOM presentation initialization separate from control and grouped-projection capabilities, so initializer-only compiled views do not retain unrelated host-operation helpers. Preserve initialization order, early edits, and older mount/adoption capability overrides.
- 80d5fb6: Preserve scoped CSS selectors in split Hydrate children when production builds compile mutable parser ASTs. Deferred and independent activation now inject the same scoped stylesheet that matches the server DOM.
- 3814f71: Preserve control-flow guards when inferring hook dependencies. Property reads behind a condition, an early return, or exception handling inspect own data values without invoking getters during render. Accessors and inherited properties track their receiver, while stable own fields and callbacks retain precise dependencies across fresh props and store snapshots. Optional receivers and guarded getters therefore retain their authored behavior.
- b519670: Resolve independent Hydrate captures by their lexical binding and reject aliases or wrappers of parent-owned hook state. Unrelated same-name locals no longer reject valid standalone data or hide invalid captures; nested independent extraction also plans module moves before manifests are available.
- ac02371: Avoid activating document-wide signal ownership for opaque scalar bindings and preserve proven primitive values through extracted JSX fragments. Register model Action frames from the signal graph so applications without signals can omit that implementation, while retaining late-loaded signals and atomic native presentation.
- 2049fa7: Expose `getLeadingHydrationListRange` from `octane/hydration` to resolve an owned
  SSR host's leading list through canonical wrapper ranges while preserving its
  binding receipt and rejecting incomplete or malformed boundaries.
- 2049fa7: Diagnose reserved `on*` attributes in native binding views as unsupported attributes rather than event handlers. Keep native camelCase event recognition, explicit unbound ownership and inline-event attribute safeguards unchanged.
- 2049fa7: Allow scalar native-parent hydration handoffs to retain independently owned `data-*`, `aria-*`, and `tabIndex` bindings alongside class and style. Keep opaque children and their controls outside the parent lease, preserve native attribute removal semantics, and retain the existing collision, cancellation, and host identity checks. Keep explicitly unbound lowercase native event handlers under normal renderer ownership.
- 9b22cff: Keep explicit keys distinct from implicit positions and nested array paths in host-only children, preserving the correct input nodes and typed values when keyed children reorder.
- 02e0946: Activate independent Hydrate widgets using load() when their server sidecars are registered, and resume pending activation after a paused document becomes active again. Preserve the existing server DOM when independent widgets activate beneath parents that return JSX. Preserve the enclosing component's parallel use() warm plan when compiling nested templates.
- 358b5d4: Fix automatically inferred async creation dependencies to respect lexical scope and erased TypeScript syntax. Preserve safe evaluation of `typeof` guards and their value reads for absent globals, and refresh requests when callback parameter defaults reference changed outer values.
- c988ad1: Preserve native Undo/Redo grouping when a writable textarea signal echoes an
  accepted native edit. Different programmatic values still update the textarea's
  reset baseline, and scalar or read-only values keep controlled-value mirroring.

## 0.2.15

### Patch Changes

- 42a07b4: Preserve accepted scalar DOM-binding updates when hydrating older server-rendered state.

  Compile scalar text leaves and mixed structural/scalar projections independently,
  retain the current bound text, attributes, classes, and style properties during
  hydration, and release their ownership when the binding is disposed or aborted.
  Unrelated DOM mutations still receive normal hydration diagnostics and repair.

## 0.2.14

### Patch Changes

- 44bd89f: Allow a compiler-proven native host to transfer its class and known-provider style bindings to normal hydration while its opaque children retain their own rendering and control ownership. Keep the early layout active during suspension or refusal, preserve the current presentation during accepted transfer, and validate the host and its source before publishing the successor.

  Keep the early scalar adapter's handoff symbol in the existing control registry so accessing the capability does not make cold renderer and event-lease helpers an eager dependency.

  Retry skipped native effects through the existing native-read scheduler when their surviving render has already completed, without weakening stale-publication checks or reviving disposed owners. Preserve suspended-island ownership and held-transition priority.

  Traverse lightweight DOM-context ancestors without treating them as hook-bearing blocks when locating a preserved hydration owner, so native effect retries remain safe while another island is suspended.
- de270e3: Support explicit handoff of a standalone textarea signal value alongside an adopted native presentation. Hydration preserves live input and selection, transfers control ownership only at accepted publication, and keeps early bindings active when takeover is declined or suspended. Known-provider unbound style spreads retain direct compiled property bindings.

  Keep early ownership intact when preparing a successor subscription fails, and avoid masking interrupted mounts with a secondary ref-cleanup error.

  Release all prepared value successors when a later control invalidates presentation publication, preserving the original error and preventing stale input or model writers from being reclaimed by that root.

  Reject competing presentation bindings for fields supplied by an unbound known-provider spread, including `class`/`className` aliases.

  Type-check explicit scalar text intent against a signal handle's value in DOM templates, preserving direct bindings without application-side reads or unsafe casts.

  Transfer direct scalar text signals through presentation hydration using the existing prepared binding lifecycle, including initially empty text ranges and live updates after acceptance.
- 44bd89f: Mark streamed signal selection and result scripts as renderer-owned transport so hydration can adopt the server HTML without reporting leftover protocol scripts as mismatched component output.

## 0.2.13

### Patch Changes

- 5ead1ff: Allow `adoptBindings(element, View, source)` to resolve an eligible composite view that returns another view through exact adjacent compiler-owned wrappers. Preserve native node identity and existing binding lifetimes while rejecting ambiguous, mismatched, or sibling-containing ranges.
- 5ead1ff: Add owner-bound signal declarations, async derivations and keyed streams, direct native signal bindings, and independent hydration infrastructure. Add request-local server-call context, bounded streamed RPC, and explicitly batched independent reads. Preserve operation identity and cancellation boundaries across navigation and uncertain acknowledgements.

  Allow a later widget activation to retry a failed framework-loaded stylesheet
  without discarding queued interactions or revealing the widget before CSS loads.

  Support renderer-free global signal and streamed-state activation for hosts that
  retain server-owned HTML. Adopt initial document seeds before behavior reads,
  preserve early edits, bind native control properties without reconciliation, and
  let envelope owners emit the early capture script before interactive markup
  without duplicating it in rendered fragments.

  Catalog the new core runtime diagnostics while preserving their error classes,
  and verify the published streaming bootstrap subpath and inline script export.

  Keep individual and batched server calls on the page's origin when an authored
  base element points to another origin.

  Keep reusable DOM, CSS, and component prop types scalar while allowing direct
  signal bindings at native JSX sites, preserving existing binding consumers.
  Use scalar public props for Zag's state-machine normalization results and
  to-print's imperative iframe options.
- 5ead1ff: Specialize renderer-free child bindings to explicit caller prop shapes, allowing a proven destructured rest parameter to forward supported native properties. Preserve ordered shape identity through imported binding requests and share normal SSR annotation allocation without restricting the ordinary component API. Unknown spreads and unsupported native ownership conflicts still fail clearly.

  Allow proven conditional, child-view, slot, and primitive-text regions to transfer from early bindings to normal hydration without replacing their native nodes. Keep early interactions active through suspended or discarded attempts, validate the current presentation before publication, and retain explicit refusal for unsupported regions and writers.
- 5ead1ff: Support flat destructured props, aliases, primitive literal defaults, and rest bindings in renderer-free authored views. Prepare parameter bindings once per snapshot so projection, event, and ref reads preserve JavaScript destructuring semantics. Keep unsupported patterns and arbitrary native spreads explicit errors.
- 5ead1ff: Allow renderer-free authored views to use canonical signal-handle checks, bounded native value projections, and named native event and ref callbacks. Keep callback bodies deferred until their native lifecycle, preserve committed captures and stable ref attachment, and allow explicit ref-prop forwarding through child views.
- 5ead1ff: Extend compiler-owned native presentation to authored text, conditional content,
  keyed lists, pure child views, and explicit mounting without loading the renderer.
  Preserve SSR identity, early native controls, focus and composition, and native
  ref lifetimes. Add fixed-shape imported attribute factory contracts so style
  adapters can preserve one ordered merge without repeated spread evaluation.
  Connect direct signal-valued native channels to the existing signal graph,
  without rerunning unrelated presentation projections.
- 5ead1ff: Move explicit declaration keys to trailing options: `signal$(initial, { key })`, `derived$(compute, { key })`, and `query$(select, load, { key })`. This replaces their positional authored-key overloads; update existing callers when adopting this beta API change. Compiler-generated identities and explicit `createScope` methods retain their existing ownership behavior.
- 5ead1ff: Keep transition orchestration out of early signal and control module dependencies so split-chunk builds can defer it with the renderer. Native input and transition behavior are unchanged.
- 5ead1ff: Allow explicitly adopted, compiler-proven fixed native views to transfer their early DOM bindings to `hydrateRoot` through `bindingLeases`. Keep early presentation and native commands active while hydration is pending, publish current values before refs, and retire old ownership without replaying already handled commands. Native updates beneath a suspended hydration boundary now retain that boundary's pending capture instead of publishing a child independently.

  The early entry remains renderer-free; normal hydration still requires explicitly loading the renderer. Structural regions, dynamic text, writable controls, and unsupported writers are not eligible for this optional handoff.

  Retire displaced early bindings only after staged DOM publication, suppress refs from hydration attempts that never commit, and support fixed native views using fresh array/object class values. Hydration-lease errors use the standard production error-code catalog.
- 5ead1ff: Preserve event-time command payloads through an optional synchronous behavior capture hook, and support authoritative revision comparison for optimistic action receipts so older successful responses settle without replacing newer authority.
- 5ead1ff: Reconcile explicitly undefined native attributes when hydrating existing server markup. Direct attributes and native prop spreads now remove stale SSR values on the first client render instead of treating an empty client cache as an unchanged value. Preserve the adopted node and unrelated server attributes.
- 5ead1ff: Keep early whole-style bindings from sharing a module with renderer-only attribute and namespace tables. CSS serialization, units, caches, and existing helper exports remain unchanged.
- 5ead1ff: Allow trusted `knownAttributeSpreads` contracts to opt into signal-aware style objects with `style: 'object'`. Renderer-free bindings reuse the existing style capability, while contracts without this option retain CSS-text behavior.
- 5ead1ff: Keep query implementation out of signal-only owner bundles and remove the legacy
  `scope.asyncSignal$` method. Explicit-owner callers now import
  `createResource(scope, key, describe)`; native `query$` declarations are unchanged.
  `createScope` remains optional, and synchronous signals, draft edit receipts,
  request isolation, streaming ownership and historical adoption retain their contracts.

  Discard compiler-proven unused signal declarations without dropping initializer
  effects or diagnostics, and reduce repeated plain-data conversions when accepting
  SSR signal seeds. No runtime capability loader or extra initialization phase is added.

  Add `bootstrapStreamedSignalResults` for hosts that accept streamed signal results
  while owning their HTML placement. It shares the full receiver's authority,
  bounded delivery and lifecycle handling without retaining DOM placement code.
  The existing `bootstrapStreamedSignalHydration` and region-registration API remain
  available unchanged.
- 5ead1ff: Reduce renderer-free signal startup dependencies by separating native-control capture from optional island activation and keeping server stream observation mirrors out of the browser request engine. Preserve early input, stream cancellation, and per-consumer backpressure without changing author-facing APIs.
- 5ead1ff: Preserve grouped native `sx` projections through nested local components in renderer-free bindings, including reactive updates, keyed rows, and cleanup.
- 5ead1ff: Add opt-in native `sx` authoring with signal-aware StyleX arguments. Normal rendering and renderer-free bindings share a native projection that prepares class, style, and metadata together, preserves SSR adoption and source ownership, and skips unchanged DOM writes. StyleX remains responsible for style composition, units, and extracted CSS.

  Expose a shared StyleX compiler contract and a TSRX type-check provider so supported native `sx` expressions can sample signal arguments without widening ordinary StyleX function parameters or component props. Forward native attribute contracts through the application Vite plugin.
- 5ead1ff: Open failed server signal result channels before sending their sanitized error, preserving query error adoption when a promise rejects or an iterator cannot be constructed.
- 5ead1ff: Select keyed-list support only for renderer-free binding programs that can use it, including inactive branches, imported children, and caller-owned slots. Preserve older compiled descriptors through compatible runtime entry points.
- 5ead1ff: Start compiler-proven independent `query$` and `derived$` reads together in complete static native JSX output, as well as adjacent local declarations. Preserve lazy declarations, branch reachability, original error and suspension boundaries, and ordered handling of opaque values. Unknown receivers, mixed text/renderable holes, dynamic host behavior, and resource-loading elements remain conservative boundaries.
- 5ead1ff: Start compiler-proven independent query and asynchronous derivation reads together while retaining strict read order, actual data dependencies, cancellation, and lazy conditional work. This does not add transactional signal publication or delay native input updates.

  Avoid speculative signal owners and eagerly serialized invocation paths in ordinary rendering. Preserve late signal activation and retired event ownership, and align keyed component identities between server rendering and hydration.

  Retain pending component queries across rendering retries, releasing obsolete work on replacement, cancellation, and unmount. Support checked dynamic projection functions in immutable imported-factory configurations and imported string-token style keys in renderer-free views, preserving ordered attribute merges and property ownership.

  Release native control leases when their exact signal owner retires, independent of application page-cleanup order. Initial dead-owner reads and genuine computation errors still fail; ordinary signal subscribers retain their final invalidation.
- 5ead1ff: Select host-spread hydration preparation only for components that use it, allowing simpler early-binding handoff components to omit generic spread and form machinery. Preserve the same adoption proofs, native ownership, and normal renderer behavior.
- 5ead1ff: Preserve streamed query delivery when a query waits for another query before
  starting. Dependent streams remain attached to the original SSR response and
  hydration adopts their delivered results without starting duplicate requests.

  Preserve pending dependency snapshots in implicit derived signals and carry
  dependency refresh and stream-completion activity through async derivations.

  Reuse the empty SSR list-key context between components while preserving copied
  keyed paths and request-local signal identity.
- 5ead1ff: Stage native signal writes made in transitions until their affected renderer and renderer-free presentations are ready. Keep committed values and public notifications unchanged while a query or derived result is pending, preserve urgent edits, and transfer accepted producer and binding subscriptions without restarting them. Reuse the existing transition journals and optional visibility driver for pending cues, timeout fallbacks, and cleanup.
- 5ead1ff: Complete renderer-free authored controls and whole/spread styles using the existing signal ownership and native style protocols. Preserve sampled one-way values, early edits, keyed controls, radio input ordering, CSS declaration order, and cleanup. Keep binding-only activation modules free of the renderer, accept the BindingSource callback contract, and support conservative chained string projections.

  Preserve unchanged scalar text during native rendering and ViewTransitions by retaining its compiler-owned raw-value cache. This keeps text selection intact and avoids activating unchanged nested transition scopes without hiding signal pending/error recovery.
- 5ead1ff: Reuse the resolved server signal owner when invoking a component, avoiding a duplicate instance lookup while preserving nested request ownership.
- 5ead1ff: Let renderer-free structural bindings omit control, grouped-style/class, and native-initialization orchestration when their compiled view cannot use it. Preserve existing behavior for views that need these features and for older compiled descriptors.
- 5ead1ff: Select the compiled DOM binding adopter directly and share identical local child plans, reducing renderer-free startup code without changing view authoring or ownership.
- 5ead1ff: Share eligible compiled StyleX recipe constants between normal components and renderer-free binding artifacts in production browser builds. Preserve local StyleX optimization, style precedence, extracted CSS, and authored source maps. Expose the build-time sharing plugin for custom compiler adapters; leave development, server, and unsupported definitions on their existing paths.
- 5ead1ff: Export signal-handle predicates directly from their lightweight protocol module so a capability check alone does not retain signal-owner initialization or the signal engine. Predicate behavior and identity are unchanged.
- 5ead1ff: Derive direct signal binding and writable-control identities from authored source positions rather than generated component helper names. This fixes server/client identity mismatches for controls nested in conditional fragments, loops, and switch branches. Rebuild and deploy matching server and client output together because the compiler site-identity version changes.
- 5ead1ff: Preserve global signal SSR identities and activation metadata in plain modules that also use memo hooks when production inline memo optimization is enabled.
- 5ead1ff: Add compiler-backed adoption of fixed server-rendered DOM views through `adoptBindings` from `octane/behavior`. Opted-in views synchronously project an owned snapshot onto existing native elements without loading the renderer, replacing nodes, or taking over application event handlers. Unsupported structural authoring fails explicitly.
- 5ead1ff: Let compiler-proven scalar signal derivations omit general async computation
  machinery. Avoid repeated owner resolution on cached signal reads while preserving
  request isolation, historical reads, and retirement checks.

## 0.2.12

### Patch Changes

- ede01de: Accept native signal handles in DOM styles, including individual CSS properties and whole style values. Direct template styles update without rerunning component setup, and preserve signal cleanup, Suspense, server rendering, and hydration. Export `SignalCSSProperties` for signal-aware style objects while keeping `CSSProperties` compatible with ordinary CSS consumers.

  Keep binding CSS compatibility aliases pointed at plain `CSSProperties` when their layout helpers consume ordinary CSS values.

  Expose the signal style regression benchmark through the MCP benchmark tool.
- 248af4e: Avoid redundant hydration lookups when updating existing conditional and switch branches.
- cece195: Reuse unchanged populated SSR replay snapshots and pending streaming settlement
  recorders across retry waves. Preserve metadata rollback, promise identity,
  cancellation, and request cleanup. Add the SSR replay and streaming benchmark
  suite to repository automation.
- 03dacb7: Stamp each block's context-dependency maps with the context epoch they were recorded or verified at, so memo and implicit bailouts skip per-entry version scans whenever no provider has committed a change; stale restamps and pending propagations still force the scans, preserving refresh behavior.
- 7d4dc4f: Reduce universal renderer prop-shape churn, materialization allocations, repeated feature scans, and unnecessary compact-list traversal while preserving keyed identity, transactional callbacks, and transport contracts. Expose the universal measurement suites through MCP.
- 277c10c: Compile fixed trailing style properties after leading object spreads into guarded per-property updates. Preserve spread evaluation, overrides, removals, and hydration, with complete object diffing when a spread preinserts a trailing key.
- 1198cdc: Skip the per-row `updateSurvivor` call in keyed reconciliation when a compiler-pure list row is provably unchanged — same item reference, same body, same position — so a stable keyed update no longer pays the survivor-update machinery for every no-op row. Moved, added, removed, index-shifted, non-pure, and de-opt rows still take the full survivor path, preserving render, journal, and rollback behavior.
- Preserve `import.meta` and `new.target` syntax when collecting dependencies for memoized `use()` arguments and server-rendered component props.
- Reduce repeated runtime work on the client and server. Empty descriptor hosts skip
  child-list scratch arrays, passive-effect batches reuse their scheduling callback,
  and identical server styles reuse their records and replay snapshots.

  Expose the runtime-style-dedup, empty-host-children, and passive-scheduling
  benchmark suites through the MCP benchmark tool.
- fe1b2b7: Avoid rebuilding complete style objects on repeated spread-key collisions. Preserve inherited setters, read-only properties, and transitions back to per-property updates.
- 733c98d: Key SSR scoped child-segment and occurrence counters by the frame-relative scope suffix instead of the full `ASYNC_SCOPE` path. Every component child re-scanned the shared path prefix during counter lookup, so SSR render cost grew with tree depth — measured ~53% faster on an arm-heavy SSR workload and ~16% faster on a plain nested-component tree, with byte-identical rendered output. Async identity, arm segment numbering, `use()` occurrence keys, replay, streaming, and hydration seed behavior are unchanged.
- 13604b9: Avoid temporary boundary-collection copies during streaming SSR completion,
  error and abort scans, and reuse immutable CSS/head snapshots for completed
  boundaries. Extend the benchmark catalog with the final SSR and client coverage
  investigations from the runtime performance audit.
- 527358c: Complete the remaining Strong compiler checks for fetch-driven effects, effect chains, prop-derived initial state, explicit and null dependencies, manual memo hooks, JSX list mapping, index keys, suppression props, trusted HTML, and compatibility imports. Preserve equivalent dependency arrays as hints and report them without failing strict CLI analysis. Add compiler-owned declaration caching for Strong authoring, the `trustHTML`/`TrustedHTML` API, and nominal Strong JSX types while preserving compatibility modules.

  Strong opt-in intentionally changes generated code for eligible hook-input declarations: their identities are cached in development and production until inferred inputs change. It also normalizes proven built-in hook aliases and infers dependencies for unshadowed `undefined` placeholders. This applies to both the directive and the global `strong: true` option. Ordinary callbacks and mutable values retain their authored evaluation and lifetime. The keyed `@for` migration applies to `.tsrx`; keyed JSX mapping remains supported in `.tsx`.

  CLI JSON reports include the hint count even when it is zero, and MDX diagnostic types represent errors, warnings, and hints.

  The eager prop-state check covers both `useState(value)` and `useReducer(reducer, value)`. A lazy state initializer or explicit third reducer initializer declares a deliberate initial capture. Subscription and timer callbacks keep their event-driven semantics and are excluded from effect-chain writes.
- bb11d0b: Upgrade to TSRX core 0.2 and the renamed native parser, @tsrx/oxc 0.13. Lazy destructuring (`&{ ... }` and `&[ ... ]`) is no longer accepted by the compiler or editor tooling. Use ordinary object and array destructuring instead.
- Support property-specific kebab-case CSS names in `CSSProperties`, including signal-backed HTML and SVG styles. Preserve Octane's numeric length support: `width: 400` still means `400px`. Runtime style handling is unchanged.
- 777cef3: Align ViewTransition with React 19.3: fix activation classes, type maps, authored
  style restoration, mutation and layout detection, nested sharing, instance refs,
  and callback cleanup at animation finish. Forward native transition types, keep
  unanimated controls interactive, and wait for relevant resources and navigation.
  Animate streamed Suspense reveals with coordinated hydration and client updates.

  Prepare ViewTransition renders with staged DOM commits so snapshot activation uses the finished boundary props while preserving existing node identity and committed lifecycle visibility.

  Keep ordinary DOM operations on an inline native receiver path to avoid per-node staging helper calls when no ViewTransition is active.

  Skip inactive staging calls during effect and scope cleanup, including Activity and Suspense deactivation after a ViewTransition has completed.

  Add opt-in `scope="element"` boundaries with local names and pseudo-element handles,
  independent sibling and nested animations, coordinated streamed reveals, and
  normal DOM commits when native element transitions are unavailable.

  Expose the ViewTransition bundle and native-work benchmark through the MCP benchmark tools.

## 0.2.11

### Patch Changes

- fdb790a: Keep nested scoped JSX responsive to context changes, isolate hooks and memo caches across independently compiled render bodies, and invalidate stale output when lazy bodies change. Preserve component ownership across mixed compilation modes. Expose the production body-ownership benchmark through MCP.
- 1bc1926: Resolve the renderer-region owner with a single lookup at the top of the block chain instead of a WeakMap read per ancestor on every provider-less context read, preserving context defaults and foreign-renderer routing.
- 2789eab: Read descriptor list keys directly during reconciliation without creating a key callback for each list render, while preserving keyed identity and hydration behavior.

  Keep mapped component slots compatible when rendering switches between native array mapping and a custom map implementation, preserving hydrated inputs and component identity.

- 8e5ca22: Preserve accepted scoped descriptor children when Providers change host/component child shapes. Reuse known descriptor event names and reduce delegation arrays, child traversal, redundant persistent host writes, repeated form source resolution, and select option reads while preserving live DOM, event, and form-control behavior. Expose the descriptor-renderer benchmark suite through the MCP server.
- fa11c10: Reuse wrapper-path serialization for nested explicitly keyed children while preserving key identity, hydration, and custom key conversion behavior.
- ade5be8: Reduce compiler-generated handler, branch capture, and server rendering overhead while preserving event, branch, and SSR evaluation semantics.

  Expose the compiler-output benchmark suite through the MCP benchmark tool.

- 1e12db7: Reduce hook path resolution, optional-argument handling, state getter lookups, and warm-plan bookkeeping. Reuse external-store subscription dependencies when the subscriber is unchanged. Add deterministic Hooks performance diagnostics to the benchmark catalog.
- 6284156: Reduce scheduler batch bookkeeping and skip ref sorting for sibling-only attachment queues, preserving update ordering, effect lifecycle checks, and render-loop limits. Expose deterministic scheduling benchmarks through the MCP benchmark catalog.
- 239dab0: Invalidate cached output when a retained Context Provider switches compiled child bodies, so returning to an earlier body renders its current content while preserving mounted DOM and hook state.
- 3c1cc55: Restore enumerable symbol values when a root render suspends and preserve keyed
  row state when an urgent update shares a batch with a suspended removal. Reduce row
  input and retirement bookkeeping, and reuse the live DOM value already read
  when journaling descriptor text updates. Expose the root transaction benchmark
  suite through the MCP server.
- 23b6a75: Speed up server rendering by picking the escape pre-scan by string length in
  `escapeHtml`: a stateless non-global regexp test for short strings, three
  `indexOf` scans for long ones.

  The previous global regexp paid `lastIndex` bookkeeping on every call; the
  length split keeps the cheaper scan in each regime. ~20% faster median render
  on the 500-card SSR benchmark with byte-identical output.

- 68d1ea1: Reduce per-node SSR bookkeeping cost in the emission hot path: frame-local scoped counters (per-arm child ordinals and per-site `use()` occurrences) now live in a flat pair list — comparing scope strings directly instead of hashing them into a `Map` — and promote to a `Map` only past eight distinct keys. `process.env.NODE_ENV` is sampled once per synchronous render pass rather than read on every attribute/style emission check, with public entry points still reading it directly so out-of-pass calls never see a stale sample.
- 68d1ea1: Reduce per-component SSR bookkeeping allocation: replay snapshots now share immutable empty collections instead of copying empty `Map`/`Set`/array state, stream boundary ancestor/owner key lists reuse a shared empty, and `HookPass` hook/occurrence maps are allocated lazily on first stateful or native hook call. Component-heavy server renders allocate roughly half the bookkeeping garbage they did before, with identical streamed output and unchanged render-phase replay semantics.
- 58da344: Keep compiler memo caches off scope slot arrays, stabilize internal hook, host,
  list, and render-capture records, and initialize memo and template caches without
  sparse namespace entries. Preserve memo identity, staged hook values, keyed DOM
  reuse, and commit-time cleanup behavior.
- 8a45222: Reduce DOM attribute, spread-prop, template mounting, metadata, and delegated-event work while preserving hydration, rollback, native event descriptors, and custom-element connection behavior.

  Expose the DOM attribute, template mount, and spread host benchmark suites through the MCP benchmark tool.

## 0.2.10

### Patch Changes

- b7a2c47: Optimize inline style objects with repeated property names using targeted property updates. Preserve every authored value evaluation, the final value of each key, and its original insertion order across client rendering, SSR, and hydration.

## 0.2.9

### Patch Changes

- d377899: Preserve `import defer` and `import.defer()` syntax in compiled TSRX modules so supported loaders can defer dependency evaluation.
- b0bc435: Compile fixed-key inline style object literals into per-property updates. Bake
  literal declarations into the HTML template and update one dynamic property
  with a scalar binding or set up multiple properties together before applying
  guarded scalar updates. Retain general style object handling for spreads,
  computed keys, and overlapping CSS aliases.

## 0.2.8

### Patch Changes

- 8a3da65: Avoid scheduling a capture fallback task for ordinary delegated discrete events when no controlled form restoration is pending. Preserve the fallback for a controlled edit whose native bubble is stopped below the root, including controls armed after capture and restores queued by nested events.
- 70c29ab: Avoid emitting a parallel `useBatch` for proven module-level context-only reads in TSRX and plain TypeScript. Mixed promise reads and child warming continue to batch as before.
- 9b23f6c: Avoid building prefixed string keys for unkeyed top-level descriptor lists.
- afdc361: Reuse the encoded wrapper path for nested unkeyed descriptor siblings during client reconciliation.
- 7804852: Avoid temporary argument arrays when running effects without dependency arguments.
- 612b639: Update the shared TSRX compiler dependency to `@tsrx/core` 0.1.71.
- 621147d: Avoid allocating a rest-argument array when rendering children inside a reused host component.
- 266302e: Keep the first resolved context provider inline on each consumer, allocating a
  provider cache Map only when that consumer reads a second distinct context.
  Continue reading provider values live through updates and hosted-root changes.
- de3f2e6: Index universal owner drafts only when a render reads an earlier owner's hook or ref, preserving fast reads of the newest draft and the latest draft after retries.
  Expose the new universal draft lookup benchmark in the MCP suite catalog.
- c31f629: Add opt-in `universalHostBinding` for local direct native roots. A subscribed source can update selected host properties in one accepted batch without rebuilding the component tree on each change.
- bf8568e: Require a runtime `octane/signals` import to enable native signal reads in a module. Unrelated `$`-suffixed names no longer change DOM compilation or reject non-DOM renderers; components receiving signal handles or readers through props can import `octane/signals` directly.
- c6300cf: Avoid constructing a native event path during the capture observer when a single root has no portals, and reuse the path across the capture and emulated bubble queues of nonbubbling events.
- c31f629: Release earlier effect hooks after accepted universal renderer updates. Repeated native renders with unchanged effect dependencies no longer retain the callback history until unmount.
- 9b17f4e: Reuse static children-only warm plans when registering compiled component
  descendants, avoiding a fresh empty batch and warm closure on each render while
  preserving the first pending descendant's fetch discovery.
- 593bf2e: Seed frequently polled DOM expando keys on native prototypes, including raw HTML ownership, de-opt descriptors, and uncontrolled value baselines.
- 4a5edff: Skip ancestor cache searches for memo values when a new render cannot match any prefetched cache, while preserving suspended retries and transition resource reuse.
- d4bf228: Avoid serializing top-level unkeyed descriptor positions into JSON for server async identity.
- 3459196: Reuse nested implicit descriptor key prefixes during server rendering while preserving Suspense retry identities and hydration output.
- f6a0b41: Place hoisted SSR metadata inside an authored head at a fragment root, and omit the SEO stray-owner diagnostic from production browser bundles.
- 3606d04: Keep distinct client and server `memo()` wrappers on stable property shapes while preserving live defaults and static-hoisting behavior.
  Expose the memo wrapper shape benchmark in the MCP suite catalog.
- 1c28da5: Keep scoped JSX element and value descriptors on stable property shapes while preserving deferred children, cloning, and server rendering behavior.
  Expose the scoped descriptor benchmark in the MCP suite catalog.
- 1298a69: Reject known ambient browser-state reads during Strong renders with `OCTANE_STRONG_RENDER_AMBIENT_READ`, including browser handle aliases and `globalThis` property reads outside known standard language builtins. Preserve shadowing, events, effects, external-store snapshot callbacks, and lazy state initialization, and document how to render subscribed snapshots safely across server and client.
- 856febc: Reject render-time reads of reassigned module-scope `let` and `var` bindings in Strong modules with source-located diagnostics. Keep compatibility modules and event, effect, and deferred reads unchanged, and document the snapshot-safe alternative.
- 236d4b5: Reject render-time reads of `useRef.current` in Strong modules with a source-located diagnostic, while retaining event and effect reads and compatibility-mode behavior. Document the rule in Octane's authoring guidance and MCP skill.
- a8f34fd: Reject render-time calls to known state getters from `useState`, `useReducer`, and `useLinkedState` in Strong modules, with source-located diagnostics. Keep event, effect, deferred, and compatibility-mode calls legal and document the snapshot-safe render pattern.
- c3b0bea: Check Strong-mode `@switch` arms in their own lexical scopes so arm-local shadows and functions receive accurate render diagnostics without leaking bindings into sibling arms. Treat instance class field initializers as deferred work when a class is defined during render.
- 9fd4fd8: Avoid allocating a temporary array when resolving nested universal hook slots.
- e8f6067: Avoid empty batch arrays when registering client warm plans for complex components.

## 0.2.7

### Patch Changes

- 52ac66c: Avoid repeated ancestry scans when ordering effects and ref attachments from nearby components.
- 1158956: Skip repeated class writes for fresh array, object, and function values when their composed class string has not changed. Preserve class composition, hydration, and SVG attribute behavior.
- 7f3c096: Update the shadcn registry baseline to 4.21.0 and adopt cn 0.2.6 across the Base UI, Radix, and React Aria bindings. Add Base UI Select, Navigation Menu, and Scroll Area wrappers using the release's Nova styles and Base UI 1.8.0 primitives.

  Hoist and deduplicate Base UI's scrollbar stylesheet. Preserve global CSS rules in compiled Float style resources so selectors remain active instead of being removed by scoped-style pruning.

  Update React Aria Components to 1.20.0, React Aria to 3.51.0, and React Stately to 3.49.0. Add TokenField and PreviewTrigger, keyboard shortcut handling, context menus, and the coordinated accessibility and localization fixes.

- 12ea12a: Skip cycle-tracking allocation for primitive universal host values crossing a transport.
- 40f14c3: Build universal owner replay identities only when pending memos need them. Ordinary native renderer updates no longer allocate identity indexes and replay paths for every nested component.
- 890527f: Reduce the retained size of delegated event handler bundles by placing their private brand after the function and argument fields. Preserve handler updates and in-flight dispatch snapshots.
- 4d00715: Keep client blocks on a stable object shape across ordinary renders, Suspense, Activity, and fetch-tree warming by reserving optional fields when each block is constructed.
- faae10e: Load captured values by index in hoisted client template helpers, avoiding array iteration on keyed item and conditional arm renders while preserving shared capture positions.
- c9447c3: Avoid redundant emitted class-field definitions when constructing client blocks and scopes. Their existing constructors retain the same fields and property order while initializing them once.
- d5de04f: Preserve keyed rows when a root render clears a list, mounts its `@empty` arm, refills the list, and then suspends. The empty arm now parks only its own DOM, so rollback keeps the original rows connected and reusable, including after a large owned-list clear.
- 02ecadb: Recognize locally proven primitive string, number, and bigint DOM children while preserving explicit `as string` text bindings. Add an optional TypeScript project proof for one-shot Vite, Rspack, and Rsbuild production builds, with matching server and hydration output.
- 1186622: Restore direct listeners on hoisted head elements after a suspended transition rolls back, including aliased native event handlers.
- 31aff05: Reuse the keyed list sibling chain when unwinding an interrupted first fill.
- d97637b: Reuse a root-bound resource handle factory across universal host prop codec calls.
- f86fb48: Reuse universal event dispatchers across accepted updates to surviving listeners. Keep the latest handler and priority active, while retiring listeners when their event site is removed.
- 0ba4016: Reuse fresh universal owner draft collections during the first render pass instead of replacing them immediately.
  Expose the new owner-draft benchmark in the MCP benchmark suite catalog.
- 2c1ffaa: Reduce root rollback work for newly created binding bags and blocks, compact keyed-list snapshots, and avoid redundant resolved-transition effect walks. Preserve exact keyed DOM, cleanup timing, and retry behavior across nested suspension windows.
- c92b932: Skip scanning server Suspense arms for ViewTransition markers when none were rendered.
- ab32364: Avoid scanning buffered server fragments for a document head when hoisted metadata is present.
- 2ffcc71: Promote scoped signals to a stable API. Detect signal capabilities automatically in the compiler and remove the experimental `nativeReads` build option. Signal handles and helpers keep their `$` naming convention; local hooks, inferred memos, async resources, and DOM SSR/hydration work through the standard toolchain. Add the signals website guide and llms.txt reference.
- 7fca4d3: Keep the server component frame namespace in the initial object shape, avoiding a later property transition while preserving HTML, SVG, and MathML parser context through renders and retries.
- fbbb53d: Store one- and two-argument delegated callback captures directly on their handler bundles, avoiding a separate array per mounted handler.

## 0.2.6

### Patch Changes

- f1e6e61: Update @tsrx/core to 0.1.69 and remove the local patch now that the generic-arrow diagnostics and typed-default source-mapping fixes are published upstream. This also includes the shared iterable runtime fixes from 0.1.68.

## 0.2.5

### Patch Changes

- 1846318: Require Octane 0.2.5 or newer for testing-library and the Base UI 1.8 binding.
  Published 0.2.4 does not export `isInActScope`. Restore the root `useMediaQuery`
  export and keep its options argument optional.
- 1846318: Support library components that use transitive and method-based custom hooks,
  typed namespaces, and generic interfaces in Octane source. Preserve committed
  render-phase state when a render suspends, retain server DOM and hydration data
  while a resolved Suspense boundary waits for client data, and support portals
  into document fragments and shadow roots.

  Make testing-library rendering and hydration settle native effects consistently,
  and accept the full Octane renderable input surface.

  Batch nested `act` callbacks and testing-library rerenders within their outer
  callback. Await the complete promise queue before resolving `act`, including
  with frozen timeout clocks, so asynchronous positioning updates settle before
  assertions. Expose `isInActScope` for testing helpers to preserve this batching.

  Render synchronous iterable template loops on the client and during hydration,
  including sets and generators, while preserving the array reconciliation path.

  Run native event handlers outside component render scope when a DOM update
  synchronously dispatches an event, such as blur from disabling a focused input.

  Complete finite layout-effect update cascades before publishing DOM mutations to
  observers, including scheduled updates and repeated measurements in one component.

  Preserve optional method-hook chains, including skipped arguments, method
  receivers, and short-circuit boundaries in both compiler emission paths.

  Retain resolved Suspense native data in the public SSR result as well as its
  boundary hydration payload. Retire four Floating UI expected failures now
  covered by passing upstream ref and positioning assertions.

  Enforce the existing external-store snapshot stability contract during commit
  cascades. Uncached Zustand object selectors reach the update-depth guard; use
  `useShallow` to cache their selected values.

  Require Octane 0.2.5 for the updated Base UI, Base UI Utils, shadcn, and
  testing-library packages so the compiler and `isInActScope` API are available.
  Preserve exact server catch-node adoption when an initially resolved Suspense
  arm contains a rejected resource.

- 45f9761: Clear an owned keyed list of inert host rows with one DOM removal after the root render commits. Retain connected rows for suspension rollback and keep the existing per-row teardown for lists with effects, refs, nested scopes, or portals.
- 7a2a2bd: Preserve scoped CSS classes on elements with spread attributes during production server rendering.
- 1846318: Adopt a streamed `@catch` arm by transferring hydration ownership to the replacement catch block so a seeded factory rejection does not leave a duplicate error tree.

## 0.2.4

### Patch Changes

- aec5373: Reevaluate Octane app configs safely across environment changes and concurrent builds. Correct form controls, hoisted head metadata, and descriptor-children lexical shadowing. Align Window and Day Picker bindings with Octane's types and native events, and honor falsy Redux server state.
- 1f19beb: Prevent production API errors and static-file symlinks from disclosing server details or files outside the built asset tree. Preserve injected HTML and settle streaming SSR when callbacks fail, and compile imported descriptor-children components correctly through Rspack and Rsbuild.
- d38cd81: Allow a scoped `<style>` inside a split `<Hydrate>` child when its whole lexical style scope — the block and the host elements it stamps — sits inside the boundary. Client and server keep the authored-position hash. A scope that straddles the boundary is still `OCTANE_HYDRATE_SPLIT_STYLE`.
- a059b46: Refresh an already-injected scoped stylesheet when `injectStyle` is called again with the same hash and different CSS, so HMR updates take effect.
- a40dae1: Speed up production server rendering of elements with canonical attribute names
  by avoiding redundant attribute aggregation while preserving spread precedence,
  value coercion order, and rendered output.
- d38cd81: Scope `<style>` blocks to their siblings (RFC tsrx-org/RFCs#1): a block styles its siblings and everything below them — the children list of the element or fragment it is written in, including the fragment a nested `@{ … }` block, a control-flow branch body, or an assigned element/fragment template renders — sibling blocks share one hash and one `injectStyle` call, nested scopes get their own hash and CSS is injected in lexical order, `<style>` may sit beside the output node in a code block or directive body, assigned blocks lower anywhere a declaration is legal and expose `$class`, exported or applied blocks keep every selector, `<style apply={theme} />` stamps a theme's classes on a scope, and `{style(expr)}` resolves to the full scope chain.

  Amendment A1 to the scope model: a standalone `<style>` block is a child of an element or a fragment and styles the items beside it and everything below them — never the element that contains it. Every children list that holds a block is a scope with its own hash; two blocks among the same children share one, and a block in an element's children no longer stamps that element or any ancestor. To style an element, make the block and the element fragment siblings (`<><style>…</style><div>…</div></>`), inside `@{ … }` and directive bodies too: a body holds exactly one output node, so a block beside the output node is the multiple-outputs parser error and a lone block as the output is the new `tsrx-style-standalone-needs-fragment` diagnostic. Raw CSS in `<style>` is TSRX template syntax: a standalone block outside every `@{ … }` or `@if`/`@for`/`@switch`/`@try` body — a plain function returning JSX, an element assigned at module scope — is the new `tsrx-style-standalone-outside-template` diagnostic, and plain TSX keeps its own rule, where `<style>{css}</style>` is an ordinary element the client and server emitters pass through untouched (the Node parser entry now retries that shape in the JavaScript parser when the native facade's CSS reader rejects it). `apply` on a standalone block reaches the same elements as its CSS, and a standalone block's selectors are pruned against those elements: a rule that reaches none of them — one aimed at the containing element, say — survives only as a `/* (unused) … */` comment, as it does in `@tsrx/core`. A value factory written in plain TSX keeps its scoped CSS in a render-only `@{ <>…</> }` inside the returned fragment; that block is transparent grouping in value position too, so the returned styled fragment stays a static `Fragment` descriptor rather than lowering to a compiled renderer. `style(expr)` resolves to the scope chain only where TSRX reads a class value — the expression of a JSX attribute value (the `style` attribute excepted) or of a template child hole, directly or nested in array/conditional/logical/template expressions there (nested in the class value of an element the chain is stamped on, the call yields its value alone and the stamp adds the chain once, so a composed class never carries a hash twice); a `style(...)` call anywhere else (a statement, a declaration initializer, a call argument, a callback body, a `style={style(p)}` value) is a user call and prints as authored.

- c6516c0: In opt-in Strong mode, add compiler errors when a built-in hook value and its dependent effect are declared outside the sole nested `@{…}` block that uses them, or a named native event handler is declared outside the sole deeper block containing its direct event use. Permit parent-owned hooks in conditional and keyed arms, plus inline and same-scope named handlers, including shorthand event attributes. Report the source declaration and suggested block location in compiler and editor diagnostics.
- 3988e85: Memoize unitless CSS property classification so numeric style writes skip repeated string allocation.
- 20e2c96: Keep a spread `class` when a styled host adds its scope hash.

  A synthesized scope class now merges with a preceding spread's class instead of
  replacing it, so `props.class` reaches the DOM on both client and SSR.

- eb32683: Fold `.tsx` string-literal expression children such as Prettier's `{" "}` into the client template, matching the server and `.tsrx` compilers so hydration no longer duplicates the following element.
- 3c5d2df: Update the TSRX compiler dependency to `@tsrx/core@0.1.67` from tsrx-org/tsrx#74 and preserve matching sibling selectors (`+` and `~`) at the top of a style scope and inside branch fragments. Unmatched selectors remain pruned, and a scoped block still never styles its containing element.

## 0.2.3

### Patch Changes

- 6135083: Keep the form-action submit handler, and the transition graph it starts, out of production bundles that never install a function form action, and emit the compiled setup checkpoint only for component setups that can schedule a render-phase self-update.
- 0705d6c: Reuse staged transition updates instead of repeating map lookups.
- 415e7fd: Recover server rendering throughput: a render whose hoisted head is empty no
  longer scans the whole response for a `</head>` unless it is a document.
  Rendered output is unchanged.
- eff0271: Track `useTransition` pending ownership without allocating a `Set` per transition. A batch stores its starting hook in a field and the hook counts its pending batches, so a start → pending → settle cycle allocates the same three collections it did before the React behavioral audit fixes while keeping every corrected behavior: nested starts from another hook share the batch's pending window, a hook starting nested transitions inside its own Action is counted once, and a re-held batch becomes pending again.
- 44d50db: Fix JSX ordering, whitespace, entities, keyed hosts and portals, parser-sensitive
  markup, document roots, and Suspense warming. Correct transition ownership,
  queued state updates, deferred values, effect cleanup and error delivery, native
  event dispatch, uncontrolled form defaults, form actions, and style updates.
  Preserve dispatch order across consecutive and awaited Actions, retain committed
  child inputs during urgent parent updates, and keep third-tuple getters available
  to bindings that supply their own hook slots.
  Preserve authored custom-hook arguments and symbol initial values through aliases.
  Keep manually slotted hooks independent when nested inside custom hooks.
  Preserve hoisting and remove unused manual hook providers from production bundles.
  Replay parent setup updates before initializing children, and explain missing
  document bodies after document-root hydration.

  Escape application strings in every server renderer, accept renderable roots,
  recover buffered Suspense errors, and report hydration recoveries consistently.
  Add React-named migration types, StrictMode and batching pass-throughs, the
  useFormState alias, and server version exports. Document intentional differences
  in template children, branch identity, native events, scheduling, and SSR.

- bf860be: Skip redundant HTML wrapping in compiled server loop bodies while preserving escaping, streaming, and hydration behavior.

## 0.2.2

### Patch Changes

- 6a6dbc1: Fix controlled `value`/`checked` edits being reverted before their handlers ran whenever an `onXxxCapture` handler for the same event type was registered anywhere in the app. The browser runs a microtask checkpoint after every listener of an event it dispatches itself, so the capture segment's stopped-propagation fallback fired between the root's capture listener and its bubble listener and snapped every typed character back to the rendered value. Trusted events now close that window with a task, after native propagation has finished; script-dispatched events keep the microtask fallback.

## 0.2.1

### Patch Changes

- 34ba45e: Align the delegated-event commit boundary with React's `batchedUpdates`: the outermost dispatch of a discrete event now flushes synchronously only when a controlled `value`/`checked` host armed a state restore during that dispatch. Other handler updates stay in the microtask batch, so a script-dispatched event (`dispatchEvent`, `click()`, `requestSubmit()`) no longer publishes a commit mid-dispatch that React would publish after the dispatching script yields, and native listeners registered by other code observe the same pre-commit DOM under both renderers. Browser-dispatched events are unaffected in practice because the microtask checkpoint runs before the next native listener and the default action. Tests that asserted committed state immediately after a bare `dispatchEvent` should wrap the dispatch in `act()` or `flushSync()`, as with React.

  Controlled `value` updates now write the DOM property before syncing the `value` attribute, matching React's `updateInput` order. A control left non-dirty by a native form reset previously followed the attribute write and kept its non-dirty state; it is now marked dirty by the property write, so later attribute changes cannot drag the live value.

## 0.2.0

### Minor Changes

- ddaa8c5: Promote Octane to beta and begin the 0.2 release line.

### Patch Changes

- 456ac4b: Preserve element and fragment ref ownership when a suspended root rolls back, so retries detach the previous ref and attach only the committed replacement. Keep native parsing first while accepting valid TSRX syntax supported by the JavaScript parser, without hiding operational failures or malformed input. Update TSRX core to 0.1.63 and adopt its released computed-key source mapping fix.
- f6bea37: Keep ordinary delegated continuous-event updates responsive while an unrelated async transition Action is pending. Continuous events retain microtask batching, and updates explicitly wrapped in a transition still wait for the Action.
- 597929f: Scope delegated events to native root boundaries, preserve shadow/slot event paths and logical portal ancestry, and separate framework propagation cancellation from external native stop flags. Native `stopImmediatePropagation()` no longer truncates an already-running delegated handler queue; use `stopPropagation()` as well to stop the remaining handlers in that logical phase.

  Expose native dialog lifecycle event handlers on logical ancestors in JSX typings.

## 0.1.51

### Patch Changes

- 9321d39: Speed up hydrate module slicing in files with many split boundaries and private declarations.
- fdb711a: Keep bounded scoped-signal trace retention constant-time after its history fills.
  Inspection still returns the latest events in chronological order as detached records.
- 5e80135: Reuse the local component Map for name lookups across TSRX renderer boundaries
  to speed compilation of large modules.
- ad499d0: Speed up large universal object-driver teardown batches by compacting detached
  sibling arrays once per transaction instead of shifting them for every host.
- 892da9a: Make hidden Activity caught-error publication scale linearly on reveal.

  Activity now claims deferred reveal actions by their queue entry instead of
  searching and compacting the remaining array for every action. A production
  browser benchmark with 4,096 ordered `onCaughtError` reports dropped from 9.62 ms
  to 2.92 ms while preserving hidden deferral, FIFO exactly-once publication,
  cancellation, retry safety, output identity, and clean unmount.

- babf8d7: Make hydration render-phase queue draining scale linearly.

  Hydration now partitions the live scheduler queue in one pass instead of
  repeatedly rescanning and splicing it for every target-root update. A production
  multi-root benchmark at 1,024 rows dropped from 20.6 ms to 7.0 ms while
  preserving synchronous convergence, server-node adoption, foreign-root work,
  delegated interaction, render-loop limits, and error cleanup.

- 2785a2f: Allocate deferred-hydration procedural prefetch waiter sets only when `waitFor()` is used.
- df82fbc: Speed up production void-component classification for long local memo alias chains.
- 0824502: Parse each authored TSRX module once for Vite's preflight classifications while
  keeping the compiler's authoritative parse and diagnostics unchanged.
- 47c8f54: Speed up compilation of large stable-hookful component graphs by propagating candidate invalidations, live captures, and private setter publications through dependency worklists instead of repeatedly rescanning every component.

## 0.1.50

### Patch Changes

- 157543f: Reuse normalized renderer configuration and compiled filename matchers across
  TSRX module classifications. Compiler integrations that retain normalized
  options no longer repeat renderer validation, signature serialization, brace
  expansion, and regular-expression construction for every source file.
- 4d13159: Make hydration of deeply nested, coextensive component wrappers scale linearly.

  Hydration now remembers matching nested marker pairs for the lifetime of the
  adoption pass, resolves compacted range owners through a deferred parent chain,
  and removes contiguous redundant marker runs in one DOM mutation. A production
  SSR benchmark at 512 wrappers dropped from 39.2 ms to 4.9 ms while preserving
  server-node adoption, delegated interaction, logical marker multiplicity, and
  clean unmount behavior.

- a944ff3: Make anchorless-safety propagation linear across deep same-module component
  graphs while preserving the emitted positional anchors and single-root
  classification.
- f9f0d23: Keep fallback collapsed-template handler updates linear in the number of native
  event sites by matching accepted listeners within each host's ordered event
  range. A 1,024-site update dropped from 2.4 ms to 0.5 ms while preserving host
  identity, atomic handler publication, nullable listeners, and teardown behavior.
- edf2b9d: Speed up TSRX universal renderer validation by indexing authored source ranges
  before walking the AST. Validation diagnostics and compiled output are unchanged.
- 9779569: Export ReactCompat from octane/react to host real React components inside Octane templates. Preserve React state, refs, local boundaries, portals, and Activity lifetimes, map Octane context explicitly with bridgeReactContext, and support buffered server rendering with client hydration. Add a working ReactCompat playground example.
- 96c86fc: Reduce SSR latency for promises recreated by ancestor renders. Initialize the
  recreation guard from the actual first pending pass and immediately retry when
  switching to per-site replay, without waiting for an abandoned batch. Continue
  observing abandoned rejections and preserve dependency-waterfall, abort, and
  request-isolation behavior.

## 0.1.49

### Patch Changes

- 8adc693: Add an opt-in experimental scoped signal engine backed by Alien Signals 3.2.0, with owned async resources, retained values, ready-state adoption, and native compiler read tracking. Expose the `nativeReads` compiler option through the application and bundler integrations while preserving explicit hook dependency arrays and the external Alien Signals binding.

  The experiment is not a stable API or a release recommendation. Local derived and async hooks remain deferred, and the accompanying evidence distinguishes supplemental compiler, runtime, and browser checks from the acceptance gates for the locked workspace.

  Expose native read ownership and cached activity metadata through the existing DevTools inspector without evaluating signals or retaining a global graph registry. Match the private compiler ABI's CommonJS entry points to the public runtime so native SSR reads use one protocol instance.

  Collect native reads around actual component invocation, including parameter defaults and indirect returns. Track and replay native reads in inferred memos, preserve deferred element inspection and rendering, and revoke live retained results when a contributing data owner retires. Keep held Suspense output, refs, effects, and native subscriptions together until replacement work is accepted.

  Avoid duplicate native collection setup when invocation collection already owns the scope, while preserving independent child retirement, observer restoration, write guards, and stored-value witness replay.

  Preserve nested Suspense ref lifetimes, finish caught deletion cleanup before replacement effects connect, and reveal the latest urgent state when it supersedes every held state update. Register native compiler and server hook diagnostics in the production error catalog and CLI explanations.

- a51c8c6: Skip native text-change diagnostic AST analysis when authored TSRX cannot contain an input or textarea host.

## 0.1.48

### Patch Changes

- 3ca30fc: Cache configured root membership and the sorted language-service root list in TypeScript-backed text inference so repeated warm snapshots no longer scale with unrelated project roots, and expose the regression benchmark through the MCP benchmark runner.
- efdc8cb: Index component references once when compiling component-heavy modules.

  Component declaration lowering now preserves the same client and server hoisting
  semantics without repeatedly sanitizing and scanning every growing source prefix.

- 922df8c: Skip manifest-cache scans for ordinary watched source changes while preserving package-manifest, full-reset, and diagnostic invalidation behavior. Expose the accompanying manifest-cache invalidation benchmark through the Octane MCP benchmark tool.
- 8a8afd8: Cache shared ancestry while ordering batched component updates so deeply nested render waves do not repeatedly walk the same parent chains.

  Expose the scheduler-depth benchmark through the Octane MCP benchmark tool.

- 37a8ca1: Index conditional JSX return value uses once per module so component-heavy
  TSRX modules no longer repeat a full AST scan for every component.
- c84edbb: Propagate same-module fetch-tree warm reachability through reverse component
  edges instead of repeatedly rescanning every component. Deep TSrX component
  graphs now compile without a declaration-order-dependent fixed-point penalty
  while preserving opaque descendants, prop ownership, and synchronous cycles.
- d5175ca: Keep virtual TypeScript generation working for computed object methods and create deferred FocusScope autofocus events in the scope element's DOM realm.
- 4a4996e: Treat `"use strong"` as an author assertion that every user-authored render call
  is a pure projection of immutable snapshots and witnessed inputs. Condition
  local, dynamic, ordinary hook-shaped, callback-bearing, constructed, and tagged
  call shapes without React hook-name heuristics, while preserving compiler-proven
  hook setup, compatibility-mode live receivers, and changing event captures.
  Witness callable and receiver identities alongside explicit inputs, compare
  memoized component and ordinary-list projection inputs with `Object.is`, and
  preserve optional, aliased, cyclic, function-valued, or lexically shadowed
  setup-hook paths. Add
  bounded diagnostics for detectable state-snapshot mutations, cross-row writes
  from retained keyed scopes, and impure clock or random reads, and document the
  assumptions the production memoizer trusts.

  Expose the template-call memoization benchmark through the Octane MCP benchmark
  tool.

## 0.1.47

### Patch Changes

- af0d999: Drain queued behavior-root interactions with amortized cursor compaction and
  constant-time pending-adoption bookkeeping so late modules and separately
  settling async adoptions stay linear while preserving FIFO and reentrant delivery.
  Expose the accompanying browser benchmark through the Octane MCP benchmark tool.
- c800a1f: Allow nested TSRX `@{ ... }` child blocks to contain setup statements, hooks,
  and no rendered JSX. Setup-bearing blocks now compile as scoped child render
  bodies in client, server, and hydration output, while render-only blocks remain
  transparent grouping.
- c1bb057: Keep compiler-generated local names compact in production modules with many components, reducing compile work and intermediate output size.
- 97b9349: Skip unrelated sibling boundaries when pruning completed streaming SSR segments.
- 4393bea: Speed up production TSrX compilation for deep same-module component graphs by propagating automatic-memoization witnesses incrementally.
- 7dfef16: Speed up pure-host keyed-list upgrades and compiler queue walks while preserving adopted keyed nodes across suspended upgrade retries.
- 7e62361: Speed up development commits with many controlled form hosts by keeping diagnostic queue deduplication linear.
- 964783a: Keep development TSRX HTML-nesting diagnostics linear by deduplicating them with
  one identity set per compiled render plan instead of rescanning and serializing
  every diagnostic already collected for each new authored site.
- d3dbd78: Skip sorting normalized client and server host props when no later raw alias changes their insertion order.

## 0.1.46

### Patch Changes

- 7e96f71: Reduce streaming server-render work by checkpointing changed Suspense boundaries instead of copying the entire boundary registry for every component. Preserve render-phase retry state, discovery order, hydration seeds, and error handling.

  Avoid general keyed-child bookkeeping for a single owned text node, and avoid reclassifying host subtrees that already require component reconciliation. Keep text identity, foreign DOM ownership, and interrupted-update rollback unchanged.

- d7226ff: Add an experimental client-only Valdi writer compiler target with an explicit
  application-provided adapter contract, public compiler option types, and
  self-contained regression tests. Existing DOM and universal targets remain
  unchanged; no native runtime or application build integration is bundled.

## 0.1.45

### Patch Changes

- 5b1e6a3: Fix missing root `onCaughtError` reports for first-mount and parent-driven error
  boundary catches in non-suspending renders. Publish inline reports after the
  fallback's refs and layout effects commit, preserve the original error, and
  discard abandoned reports without duplicating existing scheduled-error reports.
- 31abee5: Reduce generated client component code by sharing scalar-binding comparisons and renderable-child text updates through the private compiler runtime. Eligible repeated host rows retain inline comparisons to avoid extra calls and cache writes on unchanged bindings. Hydration avoids repeating attribute mutations when the server already has the final client value, and list-only reconciliation is separate from common text and function children.

  Skip URL regular-expression checks only when the first character proves that the existing unsafe-protocol pattern cannot match. URL policy, controlled form values, authored evaluation order, mismatch recovery, and context propagation through unchanged child descriptors retain their existing behavior.

- fd6ce69: Preserve canonical component wrappers across consecutive Vite hot updates so every save refreshes mounted DOM and universal-renderer components while retaining their own hook state. Keep default exports live and reload when an edit removes or invalidates a refresh boundary.
- 5f7a457: Retain and retry client roots that suspend without a Suspense boundary. Keep
  initial roots empty and preserve committed UI, state, refs, and layout/passive
  effects during suspended updates, including structural replacements and portals.
  Retry the latest inputs, cancel abandoned work after supersession or unmount,
  and report actual resource rejections through normal error handling.

  Retain server DOM while initial hydration is suspended, adopting the existing
  nodes, attaching refs, and running layout/passive effects only when hydration can
  commit.

  Keep effect-thrown thenables on the error path and tear down roots on unhandled
  effect errors.

- 5227d7b: Retry incomplete descriptor and memoized subtrees before revealing Suspense
  content, preserving mounted state and DOM identity. Revisit discarded effect work
  after interrupted retries, keep descriptor text and props consistent during held
  transitions, and register deferred Activity effects when a cached hidden child
  descriptor becomes visible.
- 6927595: Fix strict browser TypeScript consumption of source-published chart bindings.

  Recharts now publishes authored TypeScript for its chart utilities and state,
  resolves component imports explicitly, and exports the component implementations'
  own prop types. Visx supports strict browser source checks without Node globals.
  Remix Router's published declarations retain native anchor and form ref types.
  Redux Toolkit's query hooks type their bundler environment without Node globals.

  Fix deferred native chart events, keep imperative and Cell refs off unrelated
  hosts, and resolve missing radial geometry without dropping data rows.

  Octane accepts optional refs in composed ref arrays and supports nested ref arrays
  in `useImperativeHandle`, including callback cleanup and primitive handles. Require
  the published TSRX compiler fix for ref-and-spread expressions rather than relying
  on a workspace-only patch.

  Publish the Volar compiler with its tested parser/printer dependencies and checked
  public declarations, preventing newer transitive printers from corrupting typed
  tuple parameters in installed consumers. Preserve generic Pie props and the
  native group targets of polar-axis events.

- f1a7802: Match React's Suspense retry timing: share the 300 ms retry-commit budget across boundaries, keep sibling reveals atomic, and retain already-visible transition content indefinitely by default. Explicit finite transition fallback timeouts remain available.

  Support promises thrown by resource readers on the client and server, and fix suspended-render cleanup, initial-state supersession, error reporting, and staged renderer ownership without delaying dependent data requests. Keep deferred hydration notifications and captured clicks behind the actual retry commit.

  Let pending and error fallbacks suspend through an enclosing boundary without losing their state. Defer suspended error-fallback reports until reveal, cancel abandoned reports, and allow a server response to finish without waiting for an obsolete suspending fallback.

## 0.1.44

### Patch Changes

- 9b06e47: Fix duplicated text when hydrating a sole primitive child that the server framed,
  including spread-bearing hosts and conditional children. Reuse the server Text
  node while preserving hydration mismatch suppression, native events, and later
  child updates.
- 7535acd: Deduplicate binding hook sub-slot derivation behind Octane's shared helper while preserving each binding's slotless and symbol-identity behavior.

## 0.1.43

### Patch Changes

- 4b590bd: Improve Activity parity across compiled JSX, element descriptors, server rendering,
  hydration, and universal renderers. Hidden boundaries now disconnect public refs,
  preserve the latest authored styles and text, hide logically owned portals, and
  contain suspended work without activating an enclosing visible fallback. Retained
  insertion effects replay safely after suspended hidden renders, including memoized
  children and nested boundaries.

  Support Activity aliases, namespaces, spreads, children props, and ordered keys
  without changing the direct mode-only compiler fast path. Integrate Activity
  visibility changes with ViewTransition enter/exit animations and expose native
  pseudo-element animations through the transition instance.

  Coalesce hidden descendant visibility scans once per render wave and keep optional
  Activity implementation and ref tracking off unrelated application paths. Add
  production browser benchmarks and deterministic work, ref, and bundle controls.
  Octane's synchronous hidden-work scheduling and existing structural-transaction
  limitations remain unchanged.

- c0ff085: Keep boolean renderable children empty when updated from text, and correctly
  reapply anchored child text after a held transition resumes. Explicit string
  conversion and typed text bindings retain their existing coercion semantics.
- 6a68a7d: Fold provider-proven immutable CSS-module class strings before template planning. Production Vite builds retain a live class reference in each static subtree so unused and lazy component styles keep their existing delivery boundaries. Mutable default maps remain dynamic unless their CSS provider supplies an explicit immutable-export contract.
- 6b97f85: Add opt-in CSS-module constant folding to one-shot Rspack and Rsbuild production builds. Authenticate immutable JavaScript CSS exports from the actual module graph, preserve stylesheet ownership, and keep proof callbacks on the main thread when compiler workers are enabled. Native CSS modules and mutable default maps retain their existing behavior.

## 0.1.42

### Patch Changes

- 1581e1b: Skip already-drained scheduled flushes after synchronous native-event commits. Preserve commit-only effects, refs, Fragment bindings, transition finalization, profiling notifications, and microtask ordering.
- afa3722: Preserve server-rendered descriptor components when a suspended Hydrate boundary
  resumes. Claim fallback cleanup ranges only after adoption completes, avoiding
  false hydration mismatch reports while preserving template-owned checks and
  removing genuinely unmatched content added during suspension.
- 231e248: Reduce keyed-row selection work for compiler-proven class-only updates. Preserve full row reconciliation for live renderable children and use the correct class setter for statically known HTML, SVG, and MathML templates. Also avoid unnecessary state-update allocations and focus traversal when a document has no focused control.
- 2f9b301: Keep keyed row selection updates bounded when a row declares a constant alias for its key before rendering. Preserve the full affected-row bodies, event captures, strict-equality behavior, and transition replay.
- 939c64d: Keep `useMemo` and `useCallback` on a universal renderer's hook runtime in production builds.

  The closure-free DOM memo optimization could incorrectly lower hooks inside an owning universal renderer component and import `octane/internal/client`. Universal renderers do not have a DOM component scope, so those helpers either failed to resolve in custom build pipelines or crashed at runtime. Universal components now retain their renderer-specific memo hooks, while DOM components keep the optimized path.

## 0.1.41

### Patch Changes

- 489a886: Remove memo factory and dependency-array allocations from more production
  client cache hits, including nested expressions, returned JSX, custom hooks,
  plain TypeScript modules, and explicit hook slots. Preserve factory scope,
  declaration timing, callback identity, and held-transition rollback/promotion,
  and avoid the extra `useCallback` wrapper closure in every runtime.
- 922b2d4: Avoid redundant external-store snapshot checks when an urgent DOM render is already queued. Keep universal-renderer subscriptions connected across snapshot and getter changes while preserving committed selectors, cleanup, and error handling. Avoid quadratic projection work for universal state-update queues that end in a replacement value.
- 814a3c1: Recognize unshadowed String conversions as template text and add an opt-in Node-only TypeScript project adapter for string-child inference. Keep conversion calls intact, reject stale source facts, omit uncertain type proofs, and share the same text classification across client compilation, SSR, and hydration. Publish declarations for the compiler and adapter APIs.

## 0.1.40

### Patch Changes

- ff9b859: Parse authored TSRX modules through the native `oxc-tsrx` compatibility layer in Node to reduce compiler latency while preserving Octane's existing AST, source-map, stylesheet, and diagnostic contracts. Browser and other non-Node compiler consumers continue to use the pure-JavaScript `@tsrx/core` parser.
- 14b8b40: Update the bundled TSRX compiler to the latest installable release, including fixes for literal less-than text and tokenizer lookahead handling.
- cc6e5ea: Extend Strong-mode analysis through statically known `useCallback`, `useEffectEvent`, and memo-returned functions. Reject Effect Event calls during render and Effect Events in explicit hook dependency lists, while preserving supported hook usage and compatibility-mode behavior.

## 0.1.39

### Patch Changes

- 954028b: Stop the compiled `@for` path from retaining the entire descriptor renderer.

  `mountItem` decided whether a de-opt list's items render through the plain
  `deoptItemBody` by comparing the body function by identity. The comparison is
  correct and cheap at runtime, but `mountItem` sits on the compiled `@for` mount
  path that every list-rendering application reaches, so naming `deoptItemBody`
  from it is a live reference a bundler must honour. Retaining `deoptItemBody`
  retains `childSlot` — the universal renderable-hole dispatcher — and through it
  the descriptor renderer, `FragmentInstance` and fragment refs, portals,
  transitions, controlled-form restoration, focus preservation and the DOM
  attribute tables. Applications that only ever render compiled templates, and
  never present a generic renderable hole, shipped all of it.

  The fact is now recorded on the `ForSlot` as `plainDeopt`, next to the existing
  `mappedNative` flag, and stamped by `childSlot` where the body is chosen —
  inside the graph that already retains those modules. `mountItem` reads the flag
  instead of naming the function. The recorded value is exactly the identity test
  it replaces: within the de-opt branch the body is `deoptItemBody` precisely when
  the compiler supplied no map body and this is not the mapped fallback, because
  both body-wrapping assignments are guarded by those same two conditions. Both
  `ForSlot` literals declare the field, so every slot keeps one hidden class and
  the stamp transitions nothing.

  Normalized production builds, gzip, via `benchmarks/bundle-size`:

  | application       | before |      after |
  | ----------------- | -----: | ---------: |
  | js-framework rows | 40,752 | **20,609** |
  | TodoMVC           | 41,293 | **21,835** |
  | chat-stream       | 41,530 | **21,968** |
  | weather-app       | 49,524 | **31,742** |

  The saving is entirely in the framework chunk (rows 38,380 → 18,237 B); every
  application chunk is unchanged, because no compiler output changed. The rows
  bundle drops from 559 surviving top-level declarations to 340 — `childSlot`,
  `FragmentInstance`, `deoptItemBody`, `renderPortalState`, `startTransition` and
  `setAttribute` all become unreachable, while `reconcileKeyed` and `mountItem`
  correctly remain. The `octane-tsrx` application, framework, and total budgets in
  `bundle-size/app-budgets.json`, and the reachability ceilings in
  `bundle-size/minimal-budgets.json`, are re-recorded against the new floor.

  This restores the reachability that held before the identity tests were
  introduced; the compiled output and every rendering path are unchanged.

- 21f4dfb: Compact safe keyed component rows in the Lynx main-thread first screen into shared host-template range commands.

  The compiler now marks component-owned loops for the Lynx main renderer without granting it the broader background template-program capability. The first-screen renderer proves a single-root scalar/event host program, reuses its immutable shape, and sends one existing `mount-template-range` command per row while preserving every host ID, logical range, listener ID, first-tree snapshot, and background adoption identity. Unsupported, observable, nested, hidden, native-list, resource, and non-scalar shapes continue through the generic command path.

  In production fresh-page AB/BA runs this reduced 10,000-row public FCP from 1,626.1 ms to 1,411.9 ms (13.2%), exact all-row FCP from 1,596.5 ms to 1,408.4 ms (11.8%), and 30,000-row all-row FCP from 4,704.4 ms to 4,269.2 ms (9.3%). Against the merged main baseline, the controlled rows-zero bundle cost is 1,246 Web gzip bytes (0.92%) and 1,824 Lynx gzip bytes (1.12%).

- 1cb4a19: Give a component that calls a method-style custom hook its own update boundary.

  A component that calls a hook owns that hook's state, so an update the hook
  schedules re-renders that component and nothing else. That held for
  `useThing()` but not for `obj.useThing()` — and the object-carried shape is how
  a large part of the React ecosystem exposes hooks: `route.useLoaderData()`,
  `api.useGetThingQuery()`, and every hook returned by a `createXContext()`
  factory.

  The `componentSlotLite` eligibility pre-pass decides whether a same-module
  component is hookless. Its body walk rejected a component on an unknown call
  only when the callee was an `Identifier`, and the free-identifier sweep ahead of
  it only ever sees bare names, so neither test could observe `api.useCounter()`:
  the receiver is `api`, and the callee is a `MemberExpression`. A component whose
  only hook was member-form was therefore classified hookless and mounted through
  `componentSlotLite`, a `LiteBlockImpl` with no block of its own. Its hook cells
  and their `forceUpdate` belonged to the parent, so updating that hook re-rendered
  the parent and every sibling under it, and the component could never bail out of
  a render it should have been isolated from.

  The slot-injection pass already handles these calls — it wraps them as
  `withSlot(sym, () => obj.useX(...args, sym))` precisely because they are hooks —
  so the two passes disagreed about the same syntax. The eligibility walk now
  applies the same `use[A-Z]` convention to the property name, and fails closed:
  matching only forfeits the lite path, never correctness.

  Components that genuinely have no hooks keep `componentSlotLite` exactly as
  before. The `benchmarks/codegen-size` corpus compiles byte-identically (raw
  152564, min 75164, gz 26774 before and after), and compile time over 200
  repetitions is unchanged within measurement noise (baseline 359.3-366.3 ms,
  candidate 362.2-372.0 ms across interleaved best-of-7 runs). Where the fix does
  apply, one `componentSlotLite` call becomes a `componentSlotVoid` call — on the
  regression fixture, +28 bytes of emitted output for the component that gains a
  real block.

- 0fc84da: Add `@octanejs/tanstack-db`: Octane live-query bindings for `@tanstack/db`. Re-exports `@tanstack/db@0.7.0` unchanged and ports the React live-query surface of `@tanstack/react-db` (`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect`, `usePacedMutations`) onto Octane hooks. `useLiveQuery`/`useLiveSuspenseQuery` run on db's shared `createLiveQueryObserver` and `useLiveInfiniteQuery` on the coordinated `createLiveQueryWindowController`, so status-only changes are observed, infinite-query windows are coordinated across hooks, and a failed page load rolls back and surfaces an error. Suspense integrates via Octane's `use(thenable)`.

  Allow browser-only TypeScript consumers to compile the reachable Octane client runtime without installing Node ambient types, while preserving the literal development-mode guards used for bundler substitution.

## 0.1.38

### Patch Changes

- 0635af6: Complete React-compatible development diagnostics for unknown DOM properties,
  controlled form conflicts, invalid HTML nesting and hydration recovery, native
  and custom event listeners, and client/server resource hint arguments. Preserve
  Octane's native-event authoring model while keeping diagnostic helpers and full
  warning messages out of optimized production bundles.

## 0.1.37

### Patch Changes

- 954c75f: React Float conformance evidence, plus two small fixes it surfaced.

  The 121 planned `ReactDOMFloat-test.js` parity-ledger cases are all
  dispositioned: 59 now carry executable adapted evidence (41 newly ported
  conformance tests across three suites plus links into the existing Float/hint
  suites), 54 are documented non-goals/divergences with per-case rationale
  (suspensey commits, whole-document containers, Fizz bootstrap/external-runtime
  protocol, `<img>`-preload scanning, SuspenseList, shadow-root scoping,
  streamed-boundary head content), and 8 stay planned against two newly-filed
  engine gaps, three warning-message families, and server-side hoistable
  prioritization ordering.

  Fixes: the document-metadata hoist partition is now HTML-scoped — nothing
  hoists from an SVG lexical context (a precedence link inside `<svg>` no longer
  becomes a stylesheet resource; `foreignObject` re-enters the HTML rules) — and
  `preinitModule` with an invalid `as` now warns in development as documented
  instead of failing silently.

- 94fa199: Tear down removed collapsed template runs with one `destroy-run` command.

  Clearing a 10,000-row keyed table shipped a 100,000-command teardown stream
  (3.5 MB) from the background thread, acknowledged it with 70,000 per-host
  tombstone deltas (2.9 MB), expanded every removed collapsed row into seven
  logical records just to enumerate those commands, and left 70,000 generation
  tombstones per clear cycle on both threads. All four costs were O(hosts) for an
  operation whose input is O(runs).

  The universal renderer now advertises a `teardownRuns` driver capability. When
  the driver accepts it, a removed subtree that is still a collapsed program-run
  instance with implicit contiguous ids skips expansion entirely and contributes
  to one `destroy-run` command per contiguous range — the driver derives the
  event unbinds, removals, and post-order destroys from the program it already
  holds. Rows with refs, explicit ids, portals, or host callbacks keep the
  explicit per-host path, as does any driver that does not advertise the
  capability (the DOM boundary is unchanged).

  The Lynx binding negotiates the capability end to end (a new teardown-run
  readiness request base), expands the command against its dense record store to
  re-enter the certified teardown fast path — falling back to an accepted-records
  walk for reordered or explicit-path rows and to the general command loop for
  partial ranges — and acknowledges a full-run teardown with a single
  `remove-run` delta. Both threads then record one sorted retired-range tombstone
  instead of 70,000 map entries, and the background client retires compact
  metadata without materializing the handles it never observed.

  On the shared 10,000-row table, the clear command stream drops from
  3,514,556 B to ~370 B, the clear acknowledgement from 2,929,786 B to ~813 B,
  and a create/clear/create cycle keeps the compact create acknowledgement from
  the previous change. Reused id ranges keep bumping generations, partial-range
  teardowns and rollbacks are pinned by new host-, client-, and emitter-side
  regression tests, and the existing certified-teardown and remount suites run
  unchanged.

- c2e77a3: Keep plain function overload signatures non-ambient in the virtual TSX.

  esrap before 2.3.2 printed `declare` on every bodyless function declaration, so
  a plain overload pair next to its implementation typechecked as TS2384
  ("Overload signatures must all be ambient or non-ambient") in the editor and
  under `tsrx-tsc`, on source that compiles and runs fine. The dependency floor
  now requires the fixed printer; an authored ambient `declare function` keeps
  its modifier.

- 125c861: Two server head-hoisting behaviors reach React Fizz parity, closing the last
  Float engine gaps from the React 19 parity audit.

  Fallback hoistables are now suppressed transitively: a `<title>`/`<meta>`/
  `<link>` authored inside a pending boundary's fallback never reaches the
  streamed head, including from a completed boundary nested inside that fallback
  — the fallback is discarded at reveal, but a streamed head line is permanent.

  Priority hoistables now lead the server head: `<meta charSet>` serializes
  first (parsers only honor a charset within the first 1024 bytes), then
  `<meta name="viewport">`, then everything else in discovery order — matching
  React's ordering instead of pure discovery order.

  The parity ledger also gains evidence for the `identifierPrefix` root option
  and the external-store compatibility semantics (subscribe/snapshot/
  server-snapshot through `useSyncExternalStore`), retiring those planned cases.

- 765134a: Float precedence groups now form in tree discovery order on client mounts, and
  head hoists computed from setup locals no longer crash SSR.

  Precedence group order is CSS cascade order. Client mounts used to create
  groups in the order component bodies finished executing — a nested child's or
  `@try` arm's group could precede its parent's, so the same tree could cascade
  differently on a client-only mount than on an SSR'd page. Resource
  registrations now run after a component's setup but before its children mount,
  so groups form parent-before-child, suspended arms at reveal, matching SSR and
  React on both sides.

  The server twin fixed a latent crash the same placement rule exposed: a hoisted
  head element or resource whose attribute reads a setup local (for example
  `<link href={slug} precedence …>` after `const slug = …`) used to emit its
  registration ahead of the local's declaration and throw a TDZ ReferenceError
  during render. Capture-free registrations still lead the body — arm-root sheets
  keep shipping with the streaming shell — while ones that read setup locals now
  run right after setup, still ahead of children.

- 9efd6f4: Add actionable development diagnostics for React-compatible stylesheet resource,
  ARIA attribute, CSS property, controlled-form, and event-listener authoring
  mistakes without retaining development warnings in optimized production builds.
- 603756a: Ship Float sheet resources discovered after the streaming shell.

  Streaming SSR dropped `<link rel="stylesheet" href precedence>` and
  `<style href precedence>` resources whose registration only ran on a
  post-shell pass — a sheet inside a nested pending boundary, or one whose href
  is computed from a `use()` resolution. Only the shell pass's head ever
  flushed, so streamed content revealed unstyled until hydration re-inserted the
  sheet client-side, and documents consumed without JavaScript never received
  the CSS at all.

  Each resolution wave now diffs the pass's per-resource sheet registrations
  against what is already on the wire and ships new tags with the wave chunk,
  ahead of its segment reveals: real markup in a hidden carrier (so no-JS
  consumers still get working CSS) plus an inline `$OCTRH` call that hoists the
  tags into `document.head` under the client's precedence grouping. Once client
  Float resource state exists, the hoist hands each tag to the live runtime
  instead, keeping dedupe and group ordering in one authority, and a hydrating
  client adopts the streamed tags without duplicating. A still-pending child
  boundary's sheet rides its parent's reveal wave, matching React's hoisting of
  partial-boundary resources.

## 0.1.36

### Patch Changes

- 972fdd3: Reduce temporary allocations during keyed list reorders by safely reusing
  bounded numeric scratch buffers across reconciliations.
- 4a792e3: Allow universal renderers to route compiler-emitted thread-function helpers through an optional cold runtime module.

  Lynx now uses that boundary to omit main-thread worklet registries and call bridges from applications that compile no worklets, while retaining late-chunk activation and the existing worklet-enabled behavior.

- 581b8bd: Reduce hydratable server-rendered HTML by reusing component-owned keyed-list
  ranges, self-delimiting pure-host descriptor items, and proven host-only
  conditional or switch ranges. Keep streamed Suspense segments parser-safe
  without expanding ordinary HTML tags or hydration comments.
- 24aa236: Skip unchanged keyed-list rows in production when their nested conditional
  content contains only host elements and every captured dependency is stable.
  Preserve conditional ownership, hydration, transitions, and existing keyed
  selection behavior while avoiding redundant DOM updates in TodoMVC-shaped apps.
- 9c397a2: Publish executable CommonJS conditions for Octane core, Floating UI, Base UI, and Radix while preserving their existing ESM and source-first entry points.
- 24aa236: Reduce server-rendered HTML escaping time and temporary allocations while
  preserving iterable snapshots, text security, streaming output, and hydration.
- 5377ef3: React Float behavioral parity: hoist exclusions and hint semantics.

  Document-metadata hoisting now honors React's exclusions — `itemProp`-bearing
  `<meta>`/`<link>` stay with their `itemScope` host, and metadata/resources that
  are direct children of `<noscript>` stay in the fallback content — on the
  client and the server, so hydration adopts the identical shape.

  Resource hints gain React's option semantics: font preloads always fetch
  anonymously (`crossorigin=""`), preload-seeded connection/integrity options
  transfer onto the matching `preinit`'s real tag (the server coalesces the
  redundant preload out of the head fold), `preconnect` identity includes the
  CORS mode, responsive image preloads omit the fallback `href`, unknown option
  keys are dropped, and non-string hrefs warn in development and no-op. A module
  src is one executable identity across `preinitModule` and
  `<script async type="module" src>` in both the server pass and the hydrating
  client — no more duplicate module scripts in the cross pairings.

- 6b65644: Minimize universal-renderer keyed placements with a longest-increasing-subsequence plan so distant swaps move only displaced hosts while preserving survivor identity, events, and lifecycle behavior.
- f12a9a9: Type native HTML attribute spellings alongside React-compatible aliases, support
  native numeric attribute strings and SVG visibility attributes, and recognize
  native `readonly` spelling when checking text-input change handlers.
- 972fdd3: Add compiler-visible descriptor children for bindings that inspect or clone ordinary TSЯX children.
- 1039b7d: Reduce duplicated client, server, and universal-renderer logic while sharing
  specialized compiled ref and server-spread helpers through renderer-isolated
  private runtime entry points. Preserve existing public helper exports, ref
  cleanup semantics, server rendering, hydration, and hot-path specializations.
- ffadd39: React 19 parity: the implementation-gap tranche from the outstanding-work issue.

  - **Nested document metadata**: `<title>`/`<meta>`/`<link>` and Float resources
    now hoist from ANY depth on the server too (React's model; the client always
    did) — a nested hoist serializes into the head channel at its authored
    position, the host body keeps only real children, and hydration adopts
    without mismatches. A hoist inside a conditional arm registers only while
    that arm renders.
  - **`prerenderToNodeStream`**: `octane/static` gains the stream variant —
    resolves after the await-everything render completes; `prelude` streams the
    complete document bytes (scoped-style tags, then folded html). No
    `postponed` field: postpone/resume stays a documented non-goal.
  - **Teardown errors reach the root callbacks**: effect-cleanup and ref-detach
    throws during unmount report through `onCaughtError` (boundary-claimed) or
    `onUncaughtError` (unclaimed) with routing semantics unchanged.
  - **Resource hints share the Float identity model**: `preinit(as:'style')` IS a
    stylesheet resource (honors `precedence`, joins the groups, dedupes against
    the rendered form), `preinit(as:'script')` dedupes against
    `<script async src>`, `preload`/`preloadModule` after the matching init
    no-op, image preloads with `imageSrcSet` key on the srcset+sizes pair, and
    malformed calls warn in development.
  - **Universal renderer**: `onCaughtError`/`onUncaughtError` now apply to
    `octane/universal` roots (boundary claims and scheduler-owned work; a direct
    `render()` throw remains the documented result channel, and there is no
    `onRecoverableError` — the universal renderer has no hydration channel).

- a03ff0f: React 19 parity tranche: Float resources, root error callbacks, module resource hints, and partial-prerender/formState dispositions.

  `<link rel="stylesheet" href precedence>` and `<script async src>` rendered at
  a component's body root are now React Float resources: hoisted into
  `document.head`, deduped by href/src across the page, stylesheet groups ordered
  by precedence (first-encounter group order, appended within a group), retained
  after unmount, emitted into buffered and streamed SSR head output, and
  hydration-deduped via the first client call's DOM seed. Suspend-until-loaded
  commits and `<style href precedence>` style resources remain documented
  non-goals — `<style>` in a component belongs to Octane's scoped-CSS system.

  `preloadModule` and `preinitModule` join the resource-hint set on both the
  client and server entries. `createRoot`/`hydrateRoot` accept React 19's
  `onCaughtError`, `onUncaughtError`, and `onRecoverableError` options
  (error-only signature — no `errorInfo`/`componentStack`; defaults are unchanged
  when the options are absent). `unstable_Activity` is aliased to `Activity` for
  React experimental-channel ports.

  React 19.2 partial pre-rendering (`resume`/`resumeAndPrerender` and the
  postpone/prelude protocol), `cache()`/`cacheSignal()`, and `hydrateRoot`'s
  `formState` option are recorded as documented non-goals in the parity ledger,
  and `docs/differences-from-react.md` now documents the previously unlisted
  divergences: `Context.Consumer`, `<title>` child handling, per-compile-site
  metadata dedupe, hidden-`<Activity>` scheduling, dropped stream options,
  `prerender`'s return shape, the `useId` format, and the `version` string.

- 4c1ecd1: React Float style resources, and the Context.Consumer decision made concrete.

  `<style href precedence>` rendered at a component's body root is now a React
  Float STYLE RESOURCE: its plain CSS ships by href identity, sharing the
  stylesheet dedupe namespace and precedence-group ordering with link resources
  (`data-precedence`/`data-href` marked, SSR-emitted, hydration-deduped, retained
  after unmount). Every other `<style>` keeps Octane's scoped-CSS behavior.
  Octane emits one tag per resource (no same-precedence merging), and CSS
  containing `</style` fails closed in SSR with a development diagnostic.

  Context.Consumer stays modern-only, now with teeth: accessing `.Consumer` in
  development logs a one-time migration diagnostic (and still returns
  `undefined`, so feature probes match production), the upstream Consumer
  scenarios protecting observable behavior are ported as `useContext`-reading
  conformance tests, and the render-prop-surface-only cases are recorded as
  parity-ledger non-goals.

## 0.1.35

### Patch Changes

- 50b7988: Cache proven immutable state-array filter projections and skip redundant
  single-token class updates while preserving controlled field restoration.
- 6daa380: Start independent asynchronous children in proven bounded keyed lists during
  the same discovery wave while preserving existing suspense and request reuse.
- d2c9e1c: Reuse delegated-event accessors and capture paths, and omit redundant component
  markers for proven exhaustive switch-root components.
- 01240e6: Speed up universal and Lynx rendering with shared compiled host-template
  programs, range-based host and listener identities, compiler-proven ownership
  elision, capability-negotiated compact transport acknowledgements, lazy public
  handles and query selectors, and lower-allocation reconciliation. Preserve
  native events, late refs, worklets, lists, portals, first-screen adoption,
  public handles, and rendered output.
- 59a35ae: Batch component-owned universal host templates after Lynx first-screen adoption,
  preserving component hooks, effects, keyed identity, native events, and safe
  cross-thread public handles while reducing large-list creation overhead.
- a8b432b: Retain unchanged keyed component subtrees for asynchronous universal renderers,
  avoiding redundant Lynx row renders while preserving context updates, native
  listeners, host identity, effect lifetimes, and accepted-commit ordering.
- 910c240: Specialize proven mixed inline styles so static declarations enter the template
  and only changed dynamic properties update the DOM.
- db5687e: Start provably reachable lazy component imports alongside independent suspended
  work without eagerly loading dormant deferred-hydration islands.
- e2466a5: Reuse already-warmed asynchronous resources across promoted transition retries
  without duplicating request creators or exposing partially committed screens.
- 2d06817: Preserve active IME composition and focus through controlled-input updates,
  keyed reorders, and deferred hydration; improve Samsung Internet and Android
  browser compatibility, scheduling, and browser build targets.

## 0.1.34

### Patch Changes

- 78316b4: Publish executable CommonJS conditions for Octane core, Floating UI, Base UI, and Radix while preserving their existing ESM and source-first entry points. Source-package discovery still recognizes those packages when the CommonJS build has not been generated yet.
- 4e53ef4: Complete React Fragment ref parity across JSX aliases and spreads, direct element descriptors, server rendering and hydration, strongly typed refs, text and portal ownership, events, observers, focus, geometry, document positioning, and scrolling.
- 4cc7840: Reuse server-provided hydration data before creating compiler-owned async
  requests, preventing duplicate client fetches while preserving Suspense and
  external hydration ownership.
- 39b3e19: Reuse proven stable returned-JSX component regions inside context providers while
  preserving context updates, component state, and server-rendered DOM adoption.
- 8c29020: Reuse unchanged derived JSX descriptor arrays inside context providers, avoiding
  unnecessary keyed reconciliation and memo comparisons while preserving context
  updates, component state, and hydration.
- 97e65b9: Skip compiler-proven stable hookful child component call sites during unchanged
  parent updates while preserving independently scheduled child state, context,
  refs, effects, and hydration.

## 0.1.33

### Patch Changes

- 1fe297e: Match React's autofocus behavior during server rendering, client mounting, and hydration, and restore focus and text selection after DOM updates.
- db0d495: Add behavior-only roots for server-rendered and externally streamed DOM, with explicit range ownership, readiness, trusted native event adoption, cancellation, and DOM-preserving disposal.
- 677182d: Avoid reconciling unchanged compiler-cached renderable children while preserving
  context and hidden-tree effect lifecycles, cache safe derived values in
  hook-using JSX components, and omit fetch-warming scaffolding from component
  trees proven to contain no asynchronous work.
- 3fb96df: Fix a sibling-ordering bug in hosts whose children are all components: a hookless child that rendered nothing at mount (for example a sole `@if` with no `@else`) inserted content produced by a later render after its later siblings instead of at its own source position. The compiler now keeps per-child anchors for such hosts, while hosts whose children provably hold their position keep the marker-elided form.
- 677182d: Reduce server-runtime initialization retention and production compiler output while preserving
  hydration, streaming, component-owned events and styles, View Transitions, and callback identity.
- 4653a2e: Fix a dev-only crash ("Cannot read properties of undefined (reading 'block')") when a component is invoked as a plain function — for example `Row({ label })` inside another component's render or a `.map` callback. The HMR wrapper now stays transparent to scope-less direct calls, matching production behavior, and an edit still refreshes the call site's output through the caller's hot update.
- 7282555: Preserve React-compatible inline placement and event propagation for resource
  links with explicit load or error handlers. Keep dynamically hoisted metadata
  listeners synchronized across capture and bubble updates, hydration, and unmount.
- 3d09348: The compiler now lowers React-style conditional JSX returns
  (`if (c) return <A/>; return <B/>;`, including ternary returns) to the same
  template control flow as `@if`/`@else` when the branch shapes are provably
  remount-equivalent under React semantics, so branch-selected output stops
  running through the de-opt descriptor renderer on both client and server.
  Hooks, direct-call helpers, fragment arms, same-type arms, self-recursive
  arms, and every other return shape keep the established value ABI.
- 8cb40df: The compiler's single-root proof is now transitive: a component whose `@{}` body is an `@if`/`@else` tree where every arm renders exactly one plain host element or one qualifying same-module component call is proven single-root through a fixed point, so its call sites (including multiple component children of one host) mount with the existing anchorless self-marked regime instead of minting a `<!--comp-->`/`<!--/comp-->` pair each. Client-mount elision only — SSR output and hydration adoption are unchanged. On the spa-navigation benchmark's 1024-leaf route this removes all 4,092 per-slot marker comments and their insertions.
- 677182d: Preserve compiler-hook registration and TanStack Start client hydration when
  their bootstrap entrypoints are imported for side effects in production bundles,
  while keeping unrelated package modules tree-shakeable.
- fc1c146: Tree-shake unused Three.js constructors from compiled scenes and keep direct
  Three renderer roots independent of the DOM runtime while preserving full
  Canvas catalogues, context providers, and mixed-renderer scheduling.
- a84fcaa: Avoid unnecessary asynchronous warming for synchronous components that read plain
  props, preventing speculative getter evaluation and reducing generated render work.
- 217a0b5: Unmount teardown now removes a deleted subtree's DOM once at the outermost
  detached block instead of per-descendant range (portals still self-detach from
  their foreign targets), and the de-opt ref-detach walk is skipped for subtrees
  that never stamped a descriptor ref. A full-page teardown drops from thousands
  of `removeChild` calls to one per top-level node, and deletion cleanups now
  observe the entire deleted subtree still attached — matching React's
  commitDeletionEffects order.

## 0.1.32

### Patch Changes

- d453832: Reduce server-rendering overhead and managed document metadata while preserving streaming, hydration, and router asset identity.
- 3152f0b: Reduce universal keyed-scene reconciliation and Three renderer lifecycle and
  frame-subscriber overhead while preserving object identity, transactional
  cleanup, and priority ordering.
- 1c44117: Reduce production application and package-version bundle sizes while preserving profiling, transition, and hydration behavior.
- cbd55ca: Make transported commit payloads proportional to change size, not tree size.

  On a transported root (Lynx's dual-thread renderer, any process split), every
  object-valued host prop is re-encoded through the wire clone on every render,
  so the identity-based prop diff could never certify sameness: a single-row
  select over a 10,000-row table shipped a ~2.4MB commit of ~30,000 commands —
  one spurious `update` for every row's freshly rebuilt class array plus two
  `event` re-binds per row — identical in size to a commit where every tenth
  row actually changed. Three cuts fix it:

  - The prop diff now uses `sameUniversalHostPropValue`, an exported,
    depth-limited structural equality over the value semantics the wire itself
    preserves: primitives by `Object.is`, arrays and plain records (from any
    realm, via the universal-side `hasCrossRealmPlainPrototype`) element-by-
    element to depth 2, everything deeper or exotic by identity. Equal values
    emit no command, and `cloneSerializableValue` accepts cross-realm plain
    objects through the same predicate.
  - The universal compiler lowers `class={[…]}` arrays whose elements are
    statically string-or-falsy to their clsx-composed string expression (an
    all-literal array folds to a static plan prop), and folds string-literal
    expression children and literal attribute values into the frozen plan, so
    the hottest per-row slot values are primitives instead of fresh
    allocations.
  - A re-created but equivalent event handler closure no longer re-announces
    its listener on the wire: the listener ID is stable and the background
    dispatch table always rebinds to the newest closure, so only a new
    listener, a priority change, or an owner change emits a command. Host
    callbacks (attach) keep closure-identity announcement — their re-run on
    handler replacement is an observable contract.

  The same select commit now carries 2 commands / ~225 bytes at any table
  size, and update-every-10th carries exactly one text update per changed row
  (the `lynx-table` ratio guards tighten from 1500× the changed-rows floor to
  1.0×). The "renders scheduled while a commit awaits acknowledgement coalesce
  into one commit carrying the latest state, intermediate states never cross"
  transport behavior is now a tested contract — it previously held only as a
  side effect of acknowledgement timing, and becomes load-bearing for storm
  throughput once commits stop saturating the main thread.

- cdb501c: Preserve proven single-root memo component shapes and keep catch-only error boundaries independent of optional Suspense and transition startup capabilities.

## 0.1.31

### Patch Changes

- 80a9c7e: Compiler-inferred component memoization now admits destructured props
  parameters. `function Child({ rows })` is the same one-props snapshot as
  `function Child(props)`, so production call sites of such components gain the
  whole-region dependency cache and skip the child entirely when their props are
  reference-stable — patterns that evaluate expressions of their own (defaults,
  computed keys), bind `current`, or use array destructuring still fall back.
  Call-site eligibility is also no longer vetoed body-wide by an unrelated
  `ref.current` or live-import member read elsewhere in the parent: the reads
  that actually flow into a site (directly or laundered through a local) still
  reject that site, everything else keeps its region.
- 62d7f13: Compiler-inferred component memoization now admits spread bags on host
  elements. `<path d={e.d} {...e.attrs}>` inside a component body no longer
  disqualifies that component's region cache or its keyed-list caches: a host
  spread is one runtime-diffed binding whose bag is reachable only from
  dependencies the region guard already witnesses, so skipping on unchanged
  dependencies is exactly the no-op a re-entry would have been. Re-entries keep
  full spread semantics — changed keys apply, vanished keys clear, and
  spread-supplied refs and event handlers attach, swap, and detach as before.
  Spreads on component tags keep failing closed: they build the child's props
  snapshot, which cached call sites must never construct from a getter-bearing
  bag.
- 16df26e: Skip unchanged keyed rows containing nested host-only lists or conditionals
  while preserving imported dependency invalidation and structured row ownership.

## 0.1.30

### Patch Changes

- 10011bb: Reduce temporary allocations during keyed list reorders by safely reusing
  bounded numeric scratch buffers across reconciliations.
- 081fa1e: Avoid reconciling unchanged compiler-cached renderable children while preserving
  context and hidden-tree effect lifecycles, cache safe derived values in
  hook-using JSX components, and omit fetch-warming scaffolding from component
  trees proven to contain no asynchronous work.
- 60004f0: Reduce component-render bookkeeping when mounting compiler-certified keyed host
  rows while preserving ordinary DOM insertion, hydration, row identity,
  delegated events, lifecycle behavior, and existing public APIs.
- 27758f5: Skip unchanged keyed-list rows in production when their nested conditional
  content contains only host elements and every captured dependency is stable.
  Preserve conditional ownership, hydration, transitions, and existing keyed
  selection behavior while avoiding redundant DOM updates in TodoMVC-shaped apps.
- 136b0e3: Reduce server-runtime initialization retention and production compiler output while preserving
  hydration, streaming, component-owned events and styles, View Transitions, and callback identity.
- d69ab86: Reduce server-rendered HTML escaping time and temporary allocations while
  preserving iterable snapshots, text security, streaming output, and hydration.
- 1a27e19: Update only the previously selected and newly selected keyed-list rows when the
  production compiler can prove that a row's selection depends solely on its own
  key. Preserve component rerenders, immutable updates, and existing lifecycle
  behavior without requiring a new public API.
- 7f6a134: Preserve compiler-hook registration and TanStack Start client hydration when
  their bootstrap entrypoints are imported for side effects in production bundles,
  while keeping unrelated package modules tree-shakeable.
- ce68bb8: Stop rebuilding a component's children when an unrelated context updates.

  A component's children resolve lazily, in the scope they render in, so the
  compiler wraps each one in a thunk that builds its element and its props object
  on demand. That thunk was rebuilt whenever a single global context epoch moved,
  and the epoch moved on every provider value change anywhere in the tree. A
  rebuild re-runs the thunk, so the props object came back new, and with it every
  inline callback and object literal written at that call site, even though the
  component that authored them never rendered again.

  Anything keyed on those identities churned: `useEffect`, `useCallback`, and
  `useMemo` dependency arrays compared unequal every time, and `memo()` on such a
  child could not bail out. Where one of those effects wrote state that fed the
  same provider, the cycle never converged. `@octanejs/radix` `Form` hit exactly
  that: a `Form.Message` with a function `match` re-registered and unregistered its
  matcher forever, one round per frame, for as long as the form stayed mounted.

  The rebuild is now keyed on the contexts a record actually read while resolving.
  Reads are collected during resolution and re-checked against their context's
  version, so a record that reads no context is never rebuilt by a provider update
  and keeps the props it was given. The resolving scope is still honoured for
  records that do read context, which is what keeps one shared descriptor from
  serving two providers, and a lazily read context value still refreshes on the
  render after it changes.

  Scope alone no longer forces a rebuild either. Host classification resolves a
  child in the parent block before the child block renders it, so the two scopes
  alternate every render; combined with the check above that alternation was
  re-creating props on its own.

- fbe0d39: Enforce Strong-mode render purity inside lazy state initializers, linked-state
  reconcilers, and their source/value equality callbacks without restricting
  deferred work or compatibility-mode applications.
- 9fa0b47: Reduce production JSX rendering overhead for compiler-proven nested components
  while preserving authored component returns, hooks, context, hydration, and
  existing public APIs.

## 0.1.29

### Patch Changes

- 8fb7990: Fix hydration of sibling `@if` and `@switch` blocks at fragment roots, including components rendered inside keyed `@for` lists.

## 0.1.28

### Patch Changes

- 2b98a33: Universal target: the root component now carries a committed range, so a state
  update in the root component itself replays through the scoped path instead of
  falling back to a whole-root attempt (issue #574 follow-up). Replays also adopt
  committed component subtrees whose props, state, contexts, and code revision
  are provably unchanged instead of re-rendering and re-drafting them, and child
  owner claims resolve through a positional fast path when the render keeps its
  committed order. In the issue's repro shape with state at the root, one press
  beside 4,000 untouched siblings drops from ~55 ms to ~10 ms, and clean-subtree
  adoption also flattens the cost of large in-scope replays such as list
  components re-rendering unchanged items.

## 0.1.27

### Patch Changes

- 46e1833: Keep freshly mounted Suspense content hidden when hydration resumes inside a hidden Activity.
- 5a8e807: Keep hidden Activity DOM hidden when a descendant independently replaces its output.

  State updates, error and Suspense retries, and accepted hot-module updates now reapply the nearest
  hidden Activity's visibility after rendering. Replacement elements and text remain hidden until the
  Activity reveals, while authored display and text values are restored correctly on reveal. Activity
  and Suspense now share hide ownership for overlapping DOM, so either boundary can reveal first
  without capturing the other's temporary hidden styles.

## 0.1.26

### Patch Changes

- 1f01b08: Refresh compiled component output correctly after accepted hot updates.

  Hot refresh now discards the outgoing compiler-owned template and slot layout before mounting the
  new body, while retaining the component block and its hook state. Exclusively owned markerless
  output is promoted to a durable component range during refresh, so static markup edits and newly
  added component calls update immediately in both mounted and hydrated applications instead of
  leaving stale DOM or throwing during insertion. When an enclosing control-flow branch shares that
  root as its boundary, the update safely falls back to a page reload instead.

- 48e2397: Keep universal state updates proportional to their retained owner subtree: a leaf `setState` replays only its owning component, keyed-list item state and several owners updated by one event replay their nearest shared component ancestor instead of the root, updates under an idle `@try`/Suspense boundary stay scoped (active episodes and retained-hidden content still replay from the root, and a scoped render error falls back so the boundary catches it), structural updates that insert, reorder, or remove hosts commit through the scope's physical frame, compact leaf rows driven by list state update within their owning list component, and scoped commits edit the accepted listener tables in place instead of cloning them. Also avoid cloning the object driver's full instance map when preparing a small host batch, and expose the corresponding benchmark through the MCP server.

## 0.1.25

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

## 0.1.24

### Patch Changes

- ec77602: Fix Rspack and Rsbuild development builds crashing while evaluating hot `.tsrx` modules by aliasing webpack HMR metadata before reading dispose data.
- 29c5bdb: Track the receiver of one-level method calls in inferred hook dependencies
  (#542).

  `useMemo(() => count.toFixed(2))` used to infer `[count.toFixed]` — a function
  that lives on `Number.prototype` and therefore never changes identity, so the
  memo stayed frozen at its first value while `count` moved. The same hazard
  applied to any prototype method called on a one-level receiver, including
  instance methods of replaced class instances.

  Neither static alternative is right for every program: depending on `count`
  fixes primitives but would re-run `props.onChange(...)` hooks on every parent
  render, because `props` is a fresh container whose own function property is the
  real dependency. The inferred array now compiles such calls to
  `__methodDep(root, 'name')`, a new semi-public runtime helper that picks the
  comparable value per render: the member when it is an own property of the
  receiver, the receiver when the method is inherited, and `undefined` when the
  property is absent (so `props.onReady?.()` stays inert until a handler is
  passed). Own-property callbacks and absent optional handlers keep exactly their
  previous recompute behavior; inherited-method calls now correctly recompute
  when the receiver changes.

  Deeper callees (`a.b.c(...)`) and computed callees (`a[k](...)`) already
  tracked their receivers and are unchanged, as are explicit dependency arrays.

- 9b032d8: Treat closures marked with an other-context directive as opaque to dependency
  inference (#542, problem 2).

  A nested function whose directive prologue declares that its body executes
  outside render — `'use gpu'` (TypeGPU shader code) or `'worklet'`
  (Reanimated/worklets-core UI-thread code) — now contributes only its root
  captures to an inferred dependency array. Previously the array hoisted the
  closure's member reads to render time, which evaluated context-bound getters
  such as TypeGPU's `.$` where they are illegal, forcing an explicit dependency
  array. The TypeGPU example from the issue now infers `[root, timeUniform,
hueUniform]` with no array written.

  The directive list is a deliberate allowlist and can grow. Same-context hints
  (`'use strict'`, React Compiler's `'use memo'`/`'use no memo'`) and directives
  reserved for other semantics (`'use server'`, `'use client'`, `'use cache'`,
  `'use workflow'`) never truncate; closures without a listed directive keep
  today's member-path inference.

- f9b2731: Observe promises recreated by plain async components during server replay, so rejected components render their `@catch` arm without emitting duplicate unhandled rejections.
- 6714914: Keep host refs unpublished while an initial Suspense primary is hidden, and avoid detaching replacement refs that never committed before a suspended update.

## 0.1.23

### Patch Changes

- c1ad31b: Compile a `@{ … }` body that returns without reaching an output node.

  A shorthand block whose statements return but which never reaches a trailing
  JSX node crashed the client compiler with `Cannot read properties of undefined
(reading 'type')`:

  ```tsx
  export function CoreGameFunction(props) @{
  	const [boardData, setBoardData] = useState([null, null, null]);
  	return null;
  }
  ```

  `@{ … }` desugars to a trailing return, so a body carrying any value return is
  compiled as one whose output is a returned value rather than an emitted
  template. That classification is driven by the returns alone, but lowering the
  tail assumed the block also had a render node to lower, and the parser leaves
  that node null when the block ends on a statement. The crash was not specific to
  `useState` or to `null`: a block holding only `return <div />` failed the same
  way, as did one holding only `return 1`. It was client-only — the server
  compiler already treated the same shape as having an empty tail.

  A block with no output node now compiles as what it is: the body's own returns
  are the whole output, and falling off the end renders nothing. Setup still runs,
  so slot-keyed hooks keep their state across whichever value the body returned.
  This is the shape a component is in while it is being written, and the shape a
  React-style `return <jsx>` inside a block already had.

  The synthesized tail is dropped where it cannot be reached — when the block ends
  in a `return` or a `throw`, or in an `if`/`else` whose arms both do. Reachability
  is proven syntactically and nothing subtler is attempted, because keeping the
  tail is always correct: a body that falls through to `undefined` is how a
  compiled body reports that it already emitted its template.

## 0.1.22

### Patch Changes

- 43df1f9: Evaluate an inline event handler's arguments when the event fires, not on every
  render. `onClick={() => setData(makeData(1000))}` compiled to a `{ fn, args }`
  bundle whose argument was lifted into the component body, so `makeData(1000)`
  ran on mount and on every subsequent render even if the button was never
  clicked. An argument is now bundled only when evaluating it early is
  observationally equivalent to evaluating it on the event: identifiers, plain
  member paths, literals, and operators over those. Calls, fresh array/object/regex
  literals, mutations, `ref.current` (the ref attaches after the mount that would
  read it, so the first event received the pre-attach `null`), and computed member
  keys keep the ordinary closure handler.

  Inline handlers that read nothing which can change between renders are now
  installed once at mount instead of being rebuilt and reassigned on every render,
  matching what a named handler already received. Handlers inside a keyed `@for`
  row are excluded, since a surviving row can be handed a different item without
  remounting.

- 7a112b4: Reuse scoped JSX value records when host classification hands them directly to the host's child block, avoiding duplicate descriptor construction while preserving context-scoped resolution.

## 0.1.21

### Patch Changes

- 10efc28: Fix hydration mismatch recovery corrupting the DOM when a branch adopts a
  non-spanning server range.

  When an `@if`/`@switch` (or an `@if`-lowered ternary) hydrates a slot whose
  server content leads with a nested `<!--[-->…<!--]-->` pair, the branch adopted
  that first pair as its own range without checking that the pair spans the whole
  slot. Against a differently-encoded server shape — for example a legacy
  value-hole list serialized as an outer pair plus one pair per keyed item — the
  branch then owned only a prefix of the slot: the next branch swap left the
  stranded remainder on screen next to the new arm, and re-entering the original
  arm mounted into detached anchors, rendering nothing (or throwing
  `NotFoundError` on insertion, depending on the shape). Recovery must never
  crash or leak — it is the production safety net for stale server HTML.

  The branch adoption now verifies the nested pair reaches the slot's close
  marker. When it does not, the runtime treats it as a structural hydration
  mismatch: it warns in development, discards the server range, and client-builds
  the branch fresh with hydration suspended for that subtree, so cursor-greedy
  adoption (such as a keyed list's markerless item path) cannot claim the slot's
  own close marker.

- 39bfc49: Fix a crash when a sole-child value hole leaves and re-enters array mode.

  An element whose only child is a `{expr}` hole renders markerless (the slot
  owns the whole element), and an array value lazily mints a comment marker pair
  inside the element to anchor the keyed list. Clearing the slot on a later kind
  flip swept those markers out of the DOM but kept the slot's references to
  them, so the next mount anchored on detached comments: flipping
  array → text/null/host → array crashed with
  `Cannot read properties of null (reading 'nodeType')`, and array → component
  threw `NotFoundError` while inserting the new content. The owns-parent clear
  now forgets the swept marker pair, so re-entering array mode re-mints a live
  pair and every other regime returns to the markerless baseline.

- 4863b39: Render the non-JSX arm of a ternary child hole instead of discarding it, and
  stop crashing on a `null` consequent.

  `{cond ? A : B}` at a JSX child position lowers to an ifBlock when either arm
  is a JSX literal. The other arm's value — a keyed `.map(…)` array, a string, a
  variable holding an element, a nested ternary, a falsy primitive — was compiled
  into the branch helper as a bare expression statement, so its value was
  evaluated and dropped and the hole rendered empty. React renders that arm's
  value, and server rendering already did too, so the same component could ship
  content from the server that the hydrating client blanked out. A `null`
  consequent (`{cond ? null : <Jsx/>}`) did not compile at all: the lowering
  crashed reading the missing branch.

  A non-JSX arm now lowers to the authored-equivalent `<>{expr}</>`, so the
  branch renders the value through the fragment's child hole: keyed `.map` arms
  take the same keyed fast path as `@for`, nested ternaries become nested
  ifBlocks, and primitives (including `0`) render as text. A `null`/`false`
  consequent compiles to an ifBlock with an empty then branch, mirroring the
  long-supported `null` alternate. The server now claims template-form ternary
  holes symmetrically (`ssrControl` + arm ranges, exactly like an authored
  `@if`), so the hydrating client adopts the taken arm's DOM — including keyed
  list arms — instead of relying on shape coincidence. Value-form positions
  (returned `.tsx` trees, whose holes the client folds into descriptor value
  holes) keep their existing `ssrChild` output byte-for-byte.

- ef82ba3: Defer a held synchronous transition's whole commit.

  A transition that suspends now holds the entire screen — including everything
  it patched outside the suspended boundary. Shell text, attributes, controlled
  form state and keyed structure revert with the hold, `isPending` stays on, and
  the new screen lands in one step when the data arrives, matching what async
  Actions already did. The composition benchmark records zero exposed
  intermediate states for a transition update, level with React.

  A value hole that leaves array mode during a held transition now re-asserts
  the held rows instead of showing the flipped-in content early, and a
  sole-child hole that flips array to text and back no longer crashes on the
  wiped list markers.

  One residual is pinned at its own benchmark ceiling: the promoted round after
  a dependent request resolves re-creates warm-started fetches (served by the
  application cache, so nothing refetches over the network) until the follow-up
  resume work restores the exact creation floor.

## 0.1.20

### Patch Changes

- c6370b6: Add `octane/testing` with `clampJsdomScrollTop()`, an opt-in helper that clamps
  jsdom's stored scroll position to its reported range and dispatches the
  resulting native scroll event.
- dd272ad: Expose a stable native error-boundary reset ref for renderer adapters.
- c151b71: Add optional Strong mode for clearer state and ref behavior. Enable it across an
  application with `compiler: { strong: true }`, in one module with `"use strong"`,
  or through the Vite, Rspack, and Rsbuild plugin options. Strong modules reject
  state updates during render, direct state updates while setting up an effect, and
  render-time writes to refs, with `useLinkedState` available for state that
  should follow another value.
- 66b51d8: Run the mount effects of components a boundary rendered but never committed.

  A `useEffect` could be lost outright. When a Suspense boundary suspended on
  something rendered _after_ a sibling — a `@for` of children followed by a
  component that calls `use()` on a pending promise, say — those earlier siblings
  had already run their hooks before the attempt was abandoned. Their effects were
  queued and then dropped along with the rest of the aborted attempt, but the
  slots kept the dependency arrays that attempt had stamped. When the promise
  resolved and the content was revealed, the re-render compared those deps, found
  them unchanged, and enqueued nothing. The mount body never ran, and neither did
  the cleanup it would have returned, so subscriptions, timers, and observers set
  up in `useEffect` silently never started. `useLayoutEffect` was unaffected.

  Hiding a boundary behind its fallback still leaves passive effects subscribed,
  which is what React does for content that is on screen and merely hidden. That
  now applies only to effects that actually ran. One that never ran has no
  subscription to preserve, so it resets like a layout effect and fires when the
  boundary finally commits — React fires every mount effect in the subtree when a
  suspended mount lands.

  This also covers a boundary that commits, then re-renders with a new child and
  suspends: the new child's effects mount on reveal while its already-committed
  siblings keep the subscriptions they had.

- a57c32a: Hold a Suspense boundary whole through a transition.

  A transition that suspended used to leave part of the new screen on top of the
  old one. Rendering and mutating happen in one walk, so a component patched its
  own attributes and text on the way down and only afterwards found that a child
  below it was still loading — the boundary kept its old content but the markup
  around it had already moved on. The same thing happened when a held boundary
  replayed its body and only some of the data had arrived: the resolved parts
  committed and the rest stayed behind.

  A suspended attempt now undoes its own binding writes, so the boundary either
  updates completely or not at all. The undo runs in the same flush as the change,
  so nothing intermediate is ever painted and transitions stay monotonic — no
  visible rollback, no invalid intermediate structure.

  `benchmarks/async-composition` records zero exposed intermediate states for a
  transition update, level with React, with its ceiling tightened from one to zero.

  Controlled `value`, `checked` and `selected` are held too, along with their
  `default*` mirrors and the record of what was last projected.

  Two things a transition can still change early: content it patched outside a
  suspended boundary, and a structural change above one such as a keyed list
  reordering.

- e38a557: Hold a keyed list whole through a suspended transition.

  A transition that dropped a row and then suspended used to lose the row from the
  held screen: the list reconciled first, the boundary decided to hold second, and
  by then the row's DOM, state and cleanups were already gone. A list the boundary
  was supposed to be holding frozen showed up with rows missing.

  Removals inside a boundary now defer their teardown while a hold is still
  possible. The nodes come out of the way so the reconcile can finish, but they
  are kept, and the row's scope — its state, its effects, its cleanups — is left
  untouched until the outcome is known. If the boundary holds, the rows come back
  exactly as they were, cleanups never having run; once the transition commits,
  the removal goes through for real and cleanups fire then.

  The list restores as a whole — order, membership and the `@empty` branch
  together — so reorders roll back alongside removals.

- bd90e27: Keyed-list parking only defers what a hold can restore.

  A value-position keyed list whose slot leaves array mode (the value stops
  being an array) discards the slot itself, so rows removed by that flip have
  nothing to be restored into. They no longer park for a possible hold — their
  teardown runs inline with the attempt that removed them, exactly as it did
  before rows learned to wait — instead of being deferred past the rest of the
  render as unrestorable.

  The rollback that puts a held list back also stops if a teardown cleanup
  flips the enclosing boundary to `@catch` mid-restore, instead of writing into
  a disposed range.

- ae6811d: Add `useLinkedState` for local state that can be edited independently but should
  reset or adjust when an input changes. The new value is available immediately,
  without an effect or a state update during render. Calculations can inspect the
  previous source and value, choose custom equality checks, and use the same
  optional latest-value getter as `useState`.
- 62d81b8: Guard `hot.data` in the universal webpack-HMR handoff: webpack and rspack leave `module.hot.data` undefined until a previous instance of the module has disposed, so the emitted `hot.data.__octaneUniversalComponents` read crashed every dev bundle on its first evaluation.

## 0.1.19

### Patch Changes

- 9d5d642: fix(compiler): keep `octane/compiler` free of Node builtins

  `octane/compiler` re-exported the `octane` Vite plugin, which pulls `node:fs`,
  `node:path`, `node:crypto`, and `node:module` into the subpath's module graph
  through `vite.js` and `bundler.js`. Bundled consumers never noticed — Vite and
  Rollup tree-shake the unused re-export — but consumers that import the subpath
  unbundled do: browsers and CDNs like esm.sh and jsdelivr resolve the whole
  graph, so `octane/compiler` arrived with ~38KB of bundler code and Node
  polyfill shims attached, and had to be worked around with a deep path into
  `dist/compiler/compile.js`.

  The plugin keeps its two existing homes, `@octanejs/vite-plugin` and
  `octane/compiler/vite`, both of which still export it with types.

  `import { octane } from 'octane/compiler'` no longer resolves. Switch to:

  ```js
  import { octane } from '@octanejs/vite-plugin';
  // or
  import { octane } from 'octane/compiler/vite';
  ```

- f469b3f: Use the current TypeScript module-declaration `kind` field throughout Octane's
  compiler. Runtime client and server output continues to erase ambient global
  declarations, while editor `to_ts` output preserves `declare global` as a valid,
  type-checkable global augmentation.
- ac2ae2f: Enable the existing keyed-list purity and automatic memoization optimizations for
  components authored with ordinary TSX/JSX returns. JSX lists now reuse unchanged
  items like equivalent TSRX templates while preserving context updates, captured
  values, component boundaries, and JSX children semantics. Native dense Arrays
  retain the optimized path; custom or overridden map methods, sparse Arrays, and
  additional map arguments preserve normal JavaScript behavior.
- 3aada64: Keep JSX values in the render scope represented by their element tree, including
  implicit getter, Proxy, coercion, iterator, and computed-key evaluation. Preserve
  context, Suspense, error-boundary, SSR, hydration, and element-descriptor
  compatibility when JSX moves into a variable, prop, array, or another value
  position. Render deeply nested server component trees without exhausting the
  JavaScript call stack across buffered and streaming server-rendering APIs.

## 0.1.18

### Patch Changes

- c3ba5e0: `compile({ inspect: true })` now claims an authored attribute NAME for the
  tokens that name the call the attribute lowered to, so navigation tooling can
  resolve a dynamic attribute in both directions.

  A static attribute is baked into template markup and the template's origins
  already carried it. A dynamic one has no markup at all — `<form action={fn}>`
  survives as `setFormAction(el, 'action', …)` / `ssrAttr("action", …)`, and
  `<input defaultValue={v}/>` as `setDefaultValueUncontrolled(el, v)`, which has
  no name token whatsoever — and every other token of those calls maps to the
  value expression. The authored name was therefore unreachable from the output:
  the helper is a different word and the name literal carries quotes, so neither
  reproduces the authored text a consumer accepts on an inferred attribution.

  Covers both emitters and every attribute that routes to a helper rather than to
  baked HTML: form actions, controlled and uncontrolled form props, `class`,
  `style`, `autoFocus`, boolean, ARIA, `data-*`, and the generic attribute path.

  Inspection-gated as before — the emitted module is byte-identical with and
  without `inspect`.

- 430061e: Allow runtime host components to render descriptor children produced by TSX and `createElement` call sites.
- a21ff46: Tear down an effect when its conditional hook call site is not reached during a successful component render.
- 1821f63: New compile option `dataCallbackHooks`. A hook can now declare that a callback
  argument is data it memoizes on, rather than a dependency subject it re-runs.
  Production compiles then key that callback on the values it actually reads, so
  its identity moves only when they do.

  ```js
  compile(source, filename, {
  	dataCallbackHooks: ['@octanejs/tanstack-store#useSelector'],
  });
  ```

  Entries are `module#hookName`, matched against the call site's import — including
  a namespace import, matched against the namespace's own module — or a bare
  `hookName` for a hook declared in the module being compiled. A default or
  namespace import from elsewhere never matches a bare entry.

  This closes the other half of the capture-free callback lift. A callback that
  captures nothing is lifted to module scope and keeps one identity forever; a
  callback that reads component state cannot move, but is now wrapped in
  `useCallback` with an inferred dependency list. On a 512-subscriber fan-out over
  20 unrelated parent re-renders, selector invocations for a capturing selector
  drop from 10,240 to zero, and the re-render cost fell from 21.4–23.1ms to
  7.8–9.9ms.

  The dependency list is left for inference to fill, which is why the transform
  runs before it. That ordering is load-bearing rather than incidental: coarse
  identifier dependencies (`[props]`) are worthless here, because the props object
  is a fresh identity on every parent render, so the memo never hits. Inference
  produces the member paths actually read (`[props.offset]`).

  Nothing is inferred about which hooks qualify, and the transform is inert until
  something opts in. The compiler already refuses to attach dependency semantics
  to custom hooks it cannot statically prove, and a wrong answer here produces a
  stale closure — silent, and attributed to the application rather than to the
  compiler — so the fact is declared rather than guessed.

  Declared hooks are still left alone where the hook owns freshness itself: when
  its own dependency list is inferred, and when the call passes an explicit
  dependency array or `null` (the author's "re-run every render" escape hatch).
  Dev, HMR, and profile compiles keep the authored form, matching the neighbouring
  inline hook-memo tier.

- 3db74e9: A directive at value position now compiles inside a callback and at module scope,
  so `@if`/`@for`/`@switch`/`@try` no longer depend on sitting directly in a
  component body.

  **Inside a callback.** A directive's arms are hoisted, so they cannot reach a
  callback's parameters lexically — but they never needed to. Captured values
  already travel through the construct's env channel, and that channel is built at
  the `createElement(_frag$N, …)` call site, which sits inside the callback where
  its parameters are in scope. What was missing was the capture set: it held only
  the component's own locals, so a name introduced by an enclosing callback was
  dropped from the tuple and the arm was emitted reading it free — a module-scope
  helper closing over a variable that does not exist there, which only fails once
  the arm renders. The set now grows with each callback the value lowering
  descends through, and the same names ride an env array on the server, whose subs
  are declared in the owning body rather than hoisted. Nested callbacks compose:
  an arm may read from every enclosing scope.

  **At module scope.** `const v = @if (…) { … };` has no component body to own it
  and needs none — it can only close over module bindings, which every hoisted
  helper already sees, so its arms hoist beside it. Both emitters fold it to their
  own shape; previously neither did, and the client's DOM helpers could be emitted
  into a server module.

  A module-level value is computed once, where it is written, exactly like
  `const v = cond ? <A/> : <B/>` and like a React element built at module scope.
  The client already did that — its fold lifts the control expression out as a hole
  evaluated at the definition site — but the server compiles the directive into a
  sub it calls per render, so it re-read the expression every time. Given the same
  module state the two emitters could then disagree, and hydration reported
  nothing. The server now lifts the same expression (`@if`'s test, `@for`'s
  iterable, `@switch`'s discriminant) to the definition site, so both freeze
  together. `@try` has no control expression: it selects an arm from what its body
  does at render time, which both emitters already did per render.

  What remains unsupported is a directive inside a MODULE-level callback: the env
  channel is built per component, and there is no component to build it against.
  That is now the only case the diagnostic covers, and its wording says so rather
  than claiming directives need an owning component in general.

  Covered by client render, server render, hydration adoption, and type-only
  output, including a directive whose arm reads the parameter of an enclosing
  callback and one that reads through two nested callbacks.

- 0d4ed9e: Directives used at a VALUE position now compile on the client and the server.
  A `@if`/`@for`/`@switch`/`@try` is compiler-owned template syntax, but a value
  position lowers through the descriptor path rather than the template walk, and
  that path had no case for it. What happened next depended only on where the
  directive sat:

  - `const branch = @if (ok) { … } @else { … }` emitted
    `const branch = {createElement(…)}` — an object literal wrapping a call
    expression, so the module did not parse. Setup attribute values
    (`<Child prop={@if …} />`) had the same shape. The lowered descriptor was
    always wrapped in a `JSXExpressionContainer`, which is right only in JSX child
    position; anywhere else it prints as a bare `{expr}` block.
  - `<Child prop={@for …} />` and `<div>{@switch …}</div>` in rendered output
    reached the printer as raw TSRX nodes and threw
    `Not implemented: JSXIfExpression`.
  - `<Child prop={<h1>@if … </h1>} />` and `<div>{<h1>@if … </h1>}</div>` — a host
    element that is itself a value, holding a directive among its children — were
    compiled with the directive **silently dropped**. The element lowered to a
    `createElement` descriptor whose child lowering discarded every node it did not
    recognise, so the arms vanished with no diagnostic.

  All of these now fold through the same hoisted-renderer path setup directive
  values already used, so each arm compiles once and the value becomes an ordinary
  renderable descriptor. Both emitters publish that fold for the body being
  compiled and restore the previous owner afterwards, so a nested body never folds
  its arms into its parent's helper list.

  The fold stops at a callback boundary. A directive's arms are hoisted into the
  body that owns them and read the values that body threads in, so folding one that
  belongs to a callback would hoist arms referencing the callback's params into a
  scope where those params do not exist — a module-level helper closing over a free
  variable, which only fails once the arm renders. A value-position directive with
  no owning body is now a compile error naming the authored keyword and pointing at
  the fix (move the markup into its own component), rather than silently dropped
  markup or a helper that throws at runtime.

  The type-only (`to_ts`) emitter was already correct here; this brings the client
  and server emitters in line with it. Covers all four directives across the
  initializer, attribute-value, expression-container and element-holding-a-directive
  positions, in rendered output and in setup, with client render, SSR and hydration
  adoption tests.

- 7bdf1fa: Correctly bind loop indexes in explicit TSRX and TSX list keys so indexed rendering and hydration do not throw.
- e1927d8: Keep enclosing DOM boundaries attached when a ref-owning conditional branch switches to a lazy Suspense component.
- dac0e66: Fixes two ways a loop head could hide a component reference from free-variable
  analysis, each of which let the capture-free hook-callback lift move a callback
  that was not actually capture-free:

  - A `for-in`/`for-of` head with no declaration ASSIGNS an existing binding
    rather than introducing one. It was being treated as a fresh loop binding, so
    `for (acc of s.items) { … }` hid the write to the component's `acc` entirely
    and the callback read as capture-free. Lifted to module scope, that
    assignment has no binding to land on.
  - A destructuring default in a loop's declaration —
    `for (const [x = props.seed] of s.pairs)` — is an expression that runs on
    every iteration, but only the names the pattern declared were collected, so
    the read of `props` was invisible.

  Both are corrected in the shared analysis, so every caller of it benefits, and
  the same treatment is applied to the `@for` template directive's head.

- 54c60fa: `compile({ inspect: true })` now also claims the authored attribute NAME for the
  two lowerings that resolve an element's props as a GROUP, rather than one call
  per attribute. Both dropped the name on the way out, leaving common controlled
  form props unreachable from the output in the forward direction.

  A host with a spread, a duplicate prop, or a `value`/`defaultValue` cascade
  routes every prop through one commit-phase collector —
  `setHostPropSources(el, [[false, 'defaultValue', …]])` — where the per-source
  name literal is the only token that names its attribute. It now carries the
  authored name instead of the element's location, the same split
  `ssrAttrs`/`ssrInputAttrs` rows already made on the server.

  Server-side `<textarea>`/`<select>` `value`/`defaultValue` never serialize as
  attributes at all: they become the content-position `ssrTextareaValue(…)` or
  option-projection `ssrSelectScope(…)` call, which takes its writers
  POSITIONALLY, so there is no name literal and the helper alias is the only token
  there is. It is now anchored on the authored name, and when both writers are
  present the second aliases onto the first — one call cannot carry two locations.

  The emitted module is byte-identical with and without `inspect`, and unchanged
  from before this fix.

- 59a95d6: Production compiles lift a capture-free function argument of a hook call to
  module scope, so the hook sees one identity for the module's lifetime instead of
  a fresh function every render.

  This matters for hooks that COMPARE the callback. A store selector is the
  motivating case: `useSelector(store, (s) => s.total)` feeds a memo keyed on the
  selector's identity, and an inline arrow defeats it on every render — so an
  unrelated parent re-render re-runs the selection for every subscriber. Measured
  on 512 subscribers over 20 unrelated re-renders, selector invocations drop from
  512 per render to zero. Holding the compile mode fixed and varying only selector
  identity, an expensive selector's re-render cost fell about 25% (62.6–64.1ms →
  46.5–47.4ms across three runs); with a cheap selector the wall-clock difference
  stayed inside run-to-run noise, so the durable claim is the eliminated work
  rather than a fixed speedup.

  The analysis is deliberately conservative and over-approximates the component's
  bindings, so shadowing can only cost a lift, never produce a wrong one. A
  callback is left exactly where it was authored when it reads component state,
  `this`, or `arguments`, renders JSX, or contains a hook call.

  Hooks whose contract is stated in terms of the callback are excluded, because
  moving it would change observable behavior rather than just an address:
  `useCallback` returns the argument and owes a fresh identity when deps change;
  `useMemo` and the effect hooks are defined by how often the callback runs;
  `useState`/`useReducer` take a once-only lazy initialiser; `useEffectEvent`
  deliberately hands back an unstable wrapper. Custom `use[A-Z]` hooks and
  `useSyncExternalStore` — whose `subscribe`/`getSnapshot` are data it reads —
  take the lift.

  Dev, HMR, and profile compiles keep the authored form, on the same gate as the
  neighbouring inline hook-memo tier.

  Two free-variable analysis fixes come with it, both affecting capture analysis
  generally rather than only the lift:

  - A binding pattern's default initialisers and computed keys are expressions
    evaluated at binding time, and were never walked — only the names a pattern
    declared were collected. So `(s, scale = props.factor) => …` and
    `({ [props.field]: picked }) => …` reported no reference to `props` at all,
    and read as capture-free.
  - A classic `for (let i = 0; …)` carries its declaration in the loop's `init`
    rather than its `left`, so `i` was reported free and read as a capture of an
    enclosing binding the loop actually shadows. This made any callback containing
    a counting loop look instance-specific.

- 138fbd9: Compiler-inferred hook dependency arrays now resolve two capture-analysis
  defects.

  A computed key in a binding pattern (`const { [key]: picked } = source`) is a
  read of the surrounding scope, but the scope walk never visited it, so the
  identifier resolved to no binding at all — indistinguishable from a global —
  and was dropped. Any effect keyed on that value kept a stale capture and never
  re-ran when it changed. The fix covers every position a pattern can appear in:
  declarations, function parameters, catch clauses, for-of heads, and patterns
  nested in any of them.

  Module-scope `const` declarations, and module-scope `function` and `class`
  declarations that nothing reassigns, are no longer emitted as dependencies. A
  dependency array tracks what can change between renders, and these are
  evaluated once for the program's lifetime — the conclusion imports already got
  here, that `exhaustive-deps` reaches for any outer-scope value, and that
  autoMemo already reached for same-module function declarations. Previously
  `import { fmt } from './fmt'` and a byte-identical local helper produced
  different arrays. A local `const` that only names such a value, or that binds a
  literal, is omitted for the same reason.

  Module-scope `let` and `var` remain tracked, since any later statement may
  rebind them. A member read through a module-scope `const` (`CONFIG.mode`) is
  now omitted, matching the answer a namespace import already gave: a module-level
  object mutated in place is not witnessed by a dependency array either way.

  A regex literal is not treated as an invariant initializer. ESTree spells
  `/foo/g` as a `Literal`, but it allocates a fresh RegExp on every evaluation and
  carries mutable `lastIndex` state, so a local `const pattern = /foo/g` stays
  reactive. The predicate is now shared with the one `compile.js` already used for
  the same question.

- 50c1ab5: Preserve independently managed streamed DOM when it is interleaved with
  renderer-owned host children.

  The de-optimized host reconciler now adopts unstamped nodes only during
  hydration. Normal client updates retain external stream boundaries, list nodes,
  interactive controls, and their listeners while continuing to update, reorder,
  and remove children created by Octane itself.

- e0c5490: Clear a shared-parent keyed list by walking its marker span, falling back to
  the scoped Range only once the list is large enough to pay for it.

  A `@for` block that owns its parent is still cleared with `textContent = ''`.
  One that shares its parent with other JSX previously always used
  `Range.deleteContents()`. Measured in Chromium, that is the slower of the two
  for every list size a page realistically clears — 2.2× at 10 items, 1.3× at
  100 — and only pulls ahead by ~8-12% past roughly a thousand items, so the
  strategy is now chosen by item count.

  The gap is far wider off the browser. jsdom decides Range containment with a
  boundary-point comparison per candidate node, each of which can walk the whole
  document, making `deleteContents` cost O(items × document): 266× the walk when
  clearing 100 items from a 3400-node document, growing with PAGE size rather
  than list size. Any Octane component test that clears such a list paid it —
  one route in this repo's own suite spent 2.8-7.3s in a single render, against
  ~150ms for the same component tree mounted directly, and now renders in ~200ms.

  No change for the owns-parent case, which is what the existing `clear`
  benchmarks exercise — every other suite's `@for` is the sole child of its
  parent, so the shared-parent path had no coverage at all. The new `list-clear`
  suite adds it, with both sizes and an owns-parent control, and gates each op on
  the neighbours surviving the clear (a clear that took the wrong span would
  otherwise report as a faster one).

- e6a158e: A hook callback written through a type assertion — `((s) => s.total) as Sel` —
  is now recognised as a callback. It previously matched neither the module-scope
  lift nor dep-keying, because both tested the argument's node type directly and a
  `TSAsExpression` is not an arrow, so a typed selector silently kept its
  per-render identity churn.

  Both passes now peel the assertion, and both move the UNWRAPPED function. The
  assertion is erased from the emitted module either way, and dropping it means a
  type alias declared inside the component cannot be dragged out to module scope
  by the lift.

## 0.1.17

### Patch Changes

- bd31a2d: Derived values are now cached at their declaration. A `const` whose initializer
  performs a call during render — where every such call is a value projection by
  the rule automatic memoization already uses — is lowered to a compiler-owned
  memo keyed on the component locals it reads, so its identity is stable until
  those inputs change.

  This is what makes region memoization worth having. A region keys on the
  identity of what it renders, so a derived value rebuilt on every render defeats
  its cache unconditionally: memo-wall's value-position wall rebuilt 1,000
  descriptors through `buildValueRows(items)` on every parent re-render, and that
  call alone was 35% of the operation's CPU profile.

  A calculation is admitted on exactly the callee rule that governs regions, so
  the two agree. A member call is not cached even when its result is named:
  `virtualizer.getVirtualItems()` moves with scroll while the virtualizer instance
  stays put, and caching it froze a virtualized list mid-scroll. That also means
  `const visible = todos.filter(...)` stays uncached — a genuine miss, since
  `todos` really is an immutable snapshot, but this analysis cannot yet tell an
  immutable receiver from a live one. Wrap it in `useMemo` yourself when the
  identity matters; recovering it automatically needs receiver provenance and is
  left as follow-up.

  Also never cached: hook calls (recognised by naming convention, including
  React's `unstable_use*` staging prefix — a cache around a hook freezes its state
  cell and any subscription it owns), `let` declarations, which stay the escape
  hatch for a value that must recompute every render, and calculations the render
  tree never reads. Server compiles are untouched, since a server render evaluates
  each body once.

  Measured on `benchmarks/memo-wall`, paired runs against a baseline recorded
  before any edit:

  parent_rerender_equal_B 0.226ms → 0.091ms (−60%)
  one_change_B 0.235ms → 0.156ms (−34%)
  ctx_through_wall_B 0.569ms → 0.413ms (−27%)

  That is the `createElement`-descriptors-through-a-children-hole shape every
  `@octanejs/*` binding produces. `todomvc`, `chat-stream` and `js-framework`
  compile byte-identically with and without this change and are reported as
  controls only — their run-to-run movement (up to ±100% on sub-millisecond
  operations) is the noise floor, not a result.

  Compiled output grows 0.07% gzip on the `codegen-size` corpus.

- 9e0ef45: Stop reporting a deleted subtree's cleanup as a render-phase cross-component update.

  Octane discovers a deletion while reconciling the deleting parent's output, so
  `CURRENT_BLOCK` still names that parent while the removed subtree's destroys and
  cleanups run. A cleanup that calls `setState` on a surviving component was
  therefore treated as a render-phase update: it logged `Cannot update a component
(X) while rendering a different component (Y)` and flagged the target for the
  render-phase branch of the update-depth error.

  Those callbacks are mutation-phase work (React runs them in
  `commitDeletionEffects`), and updating another component from them is the normal
  registry pattern, so they no longer take that branch. `@octanejs/radix`'s Select
  hit this on every open and close: `SelectItemText`'s layout cleanup calls
  `onNativeOptionRemove` on the Select provider as the content swaps between its
  detached fragment and the open popper.

  Genuine render-body updates are unaffected: those run with no cleanup on the
  stack and still warn and still terminate the loop.

- dea219b: Stop the de-opt reconciler removing DOM it did not create.

  An element rendered with no children still had its existing DOM reconciled
  against an empty child list, so anything inserted by other means — a
  `replaceChildren` with a captured snapshot, a third-party widget mounted into a
  container — was swept away by the next unrelated re-render. React only manages
  children it created, and portal ranges were already excluded here for that
  reason; this extends the same treatment to imperative content.

  Children the renderer did commit still clear when they go away, so
  `{cond && <X/>}` is unaffected.

  Found from `@octanejs/base-ui`, whose popup Viewport fills a snapshot container
  this way and lost its previous content mid-transition.

- 2374980: Allocate a Scope's `cleanups` and `children` arrays lazily.

  Both were created eagerly for every Scope even though most scopes never register
  a cleanup or a child scope, while the neighbouring `hooks`, `effectSlots` and
  `_slots` fields were already lazy. They now follow the same pattern: `null` until
  something registers, allocated at the registration site.

  On a 500-row × 3-cell tree (2,501 scopes) this removes 4,002 of the 7,503 array
  allocations those three collections were making — every `cleanups` array and 60%
  of the `children` arrays. Compiled output grows 17 bytes gzipped across the
  16-file codegen corpus, from the `??=` at the three cleanup-registration sites.

  `slots` deliberately stays eager: every scope in that same measurement used it,
  so making it lazy would add a null check to the framework's hottest path and to
  every emitted `__s.slots[N]` access while saving nothing.

- 2374980: Fix a context Provider corrupting the tree when its children switch dialect.

  A Provider accepts its children either as the compiled children-block function a
  `.tsrx` parent passes, or as an element descriptor from a `createElement` parent.
  Both claimed `scope.slots[0]` — a compiled body stores its binding bag there,
  while the descriptor path stores a `childSlot` record — so a parent that wraps
  its children conditionally, and therefore alternates between the two shapes
  across renders, had the incoming dialect read the outgoing one's record as its
  own. The result was a `TypeError` and a detached subtree.

  The children now remount across such a flip, which is the same contract React
  gives an element-type change.

- ac687f8: The development controlled-form diagnostic no longer warns on `aria-hidden`
  inputs. An aria-hidden control is the hidden form-interop "mirror input"
  pattern (e.g. the bubble inputs radix-style libraries render behind a custom
  control): it is assistive-technology-hidden and focus-excluded, so handler-less
  controlled `checked`/`value` props are the intended wiring there, not the
  authoring mistake the diagnostic exists to catch. Real, user-reachable
  controls keep the full warning.
- 7997d39: Speed up the server's async-identity string encoding. Identity scopes encode each
  UTF-16 code unit at a fixed width so lone surrogates stay injective, but the
  encoder built every unit with `toString(16).padStart(4, '0')` — two throwaway
  string allocations per character, which showed up as roughly 15% of render time
  on descriptor-heavy SSR (the shape `@octanejs/*` bindings produce). Identity keys
  are overwhelmingly ASCII, so those units now come from a prebuilt table and only
  the rare non-ASCII unit takes the formatting path.

  The emitted encoding is unchanged: verified byte-identical across all 65536 code
  units, lone surrogates, and fuzzed inputs.

- eb69cb6: Authored `<title>`/`<meta>`/`<link>` now reach the real `<head>` in file-routed
  SSR apps. The route renders into the template's `<div id="root">`, not a
  document, so core's head fold had no `</head>` to target and prepended the
  metadata inside `#root` instead: the template's `<title>` won by document order,
  `link rel="canonical"` and `meta name="description"` were ignored where they
  landed, and hydration could not find the ownership markers in `document.head` so
  it appended duplicates.

  New opt-in `RenderOptions.headChannel: 'separate'` withholds hoisted metadata
  from `html`/the streamed shell and hands it over on its own, through
  `RenderResult.head` for the buffered renderers and the new
  `StreamOptions.onHeadReady(head)` for the streaming ones (called before the shell
  is written, so a host can still place it in the template prefix). Both the dev
  server and the production handler use it and splice at `<!--ssr-head-->`.

  The default stays `'fold'` and is unchanged: same bytes, same result shape, no
  `head` field. Core does not dedupe metadata, so a `<title>` in `index.html` and
  one in a component both still ship.

## 0.1.16

### Patch Changes

- 85a1c6d: The auto-memo analysis no longer walks each component body twice to collect the
  imported components it renders and to look for a deferred ref read. Both
  questions are answered by one traversal, halving the node visits and visited-set
  allocations those two passes cost. Compiler output is unchanged.
- f4c97d8: Extend the opt-in compiler inspection surface (`compile(source, file, { inspect:
true })`) so source↔output navigation reaches constructs that leave no trace of
  themselves in the emit. `result.inspect.segments` entries now carry `exact`,
  marking a segment the compiler itself anchored on an authored span rather than
  one inferred from the print's map; control-flow directive keywords (`@if`,
  `@else`, `@for`, `@empty`, `@switch`, `@case`, `@default`, `@try`, `@pending`,
  `@catch`), event-attribute names, and scoped `<style>` blocks claim the code
  they lowered to through it. `result.inspect.templates` gains SSR entries (each
  static run's exact bytes plus its origins) and `result.inspect.aliases` relates
  an authored span to the origin that owns its emission. `octane/compiler/volar`
  adds `compileTypesInspection`, a navigation-only sibling of
  `compileToVolarMappings`: same parse, same transform, same output bytes, without
  the Volar mapping layer, so nothing here can perturb the language server.
  Emitted code and source maps remain byte-identical with the option on or off,
  and normal compiles skip all recording.
- f3543bf: The compiler's copy-on-write AST rewriter no longer recurses into properties that
  cannot be rewritten. Only object-valued properties can produce a replacement, but
  every `type`, `name` and `raw` string was still passed to a recursive call that
  returned it unchanged, which was 61% of the walk. Compiles are measurably faster
  with byte-identical output.
- dfa6d29: Server rendering no longer emits a style declaration whose value serializes to
  nothing. `style={{ color: '' }}` produced `style="color:;"` on the server while
  the client produced no style attribute at all, so the markup could not be
  hydrated and the element was rebuilt. Empty, whitespace-only and
  empty-after-unit-handling values are now skipped, matching the client and React.
- 9fbf31a: Cut the per-render cost of value-position element descriptors, the shape every
  `@octanejs/*` binding and every `createElement`/`.map()` child tree produces.
  `createElement` no longer allocates a property descriptor per call to detect
  React's DEV-only `key` warning getter (that probe is now DEV-gated exactly as in
  React's `hasValidKey`), a keyed element no longer pays a WeakSet insert to record
  key presence that its non-null `key` already proves, `prepareDeoptList` builds
  its output arrays only once a list regime is established, and every renderable
  hole no longer re-reads its host's tag from the DOM to re-check a void-element
  constraint its enclosing list already validated.

  On the `memo-wall` benchmark (1000 `memo(Row)` children reached through a
  `{rows}` children hole) this drops a parent re-render absorbed by 1000 prop bails
  from 0.272ms to 0.177ms, a single-row change amid the wall from 0.275ms to
  0.184ms, and a context bump through the wall from 0.610ms to 0.517ms. Exact
  render counts and compiled-work counts are unchanged, and `memo-wall` now carries
  ratio guards for all three wall-B operations.

  The server runtime gets the same two allocation fixes that apply to it (the key
  probe and the deferred child-list arrays) so the client and server descriptor
  paths stay in step; `ssr-throughput` shows no measurable change from them.

## 0.1.15

### Patch Changes

- 16dc385: The compiler's `__block` reference scan no longer recurses into non-object node
  properties and stops as soon as it finds a match. Compiler output is
  byte-identical. The walk itself does 44% fewer recursive calls, though it is a
  small share of total compile time, so expect a marginal build-time effect rather
  than a visible one.
- 7fa4075: The auto-memo purity analysis no longer walks each component body twice to ask
  whether it reads a member of an imported binding. Both proofs that needed the
  answer now share one lazily-resolved walk, and the predicate's unused
  `includeJsx` flag, whose two values could not produce different results, is
  gone. Compiler output is unchanged.

## 0.1.14

### Patch Changes

- cc79ac5: Type-only/Volar compilation now emits renderer JSX pragmas as part of its
  single mapped Program print and exposes that exact transformed Program as
  `generatedAst` for editor and playground consumers. Client-only server stubs
  are likewise built as origin-stamped AST, printed once with esrap, and return a
  real source map plus the Program used to produce them.
- cc79ac5: The client compiler now builds each component function as a single AST
  (`@tsrx/core` builders end to end — bindings, path walks, control-flow call
  sites, memo regions, sub-templates) and prints it once with esrap, replacing
  the string-assembled function interiors and the custom per-fragment source-map
  stitching. Emitted programs are structurally identical (verified by parsing
  old and new output across every fixture and mode); formatting follows esrap's
  printer, and generated code is marginally smaller. Function-level source maps
  are now complete by construction. The module frame and server emitter keep
  their existing emission pending the next milestones.
- cc79ac5: The client compiler now assembles imports, templates, styles, event delegation,
  hoisted helpers, component declarations, HMR, profiling, and metadata tails into
  one module AST and prints it once with esrap. Module source maps now come directly
  from that print, including generated helper regions that the previous
  string-stitching path could not map.

  The server compiler now follows the same AST-first, single-print path. SSR
  function/module scaffolding and HTML template literals carry authored origins,
  so server source maps and opt-in inspection segments now cover generated SSR
  code instead of returning an empty mapping.

- cc79ac5: The DOM compiler now builds static templates as structured, origin-carrying
  template IR and serializes each completed template once into the unchanged
  runtime HTML string ABI. Opt-in compiler inspection exposes both the exact
  Program AST used for the module's single esrap print and each hoisted template's
  structured IR, enabling playground source-to-generated-code and
  source-to-template navigation without reparsing emitted output.
- 3ea0855: Automatic memoization no longer gives up on a component because its template
  renders a value through a function call. `{formatPrice(cents)}`, `{t('total')}`,
  and `{segText(seg, done)}` are ordinary value projections, but a single one of
  them previously disqualified the whole component — and, transitively, every
  component that rendered it — from region memoization.

  A call is admitted only when its callee is a module-scope immutable identity: an
  imported binding, or a same-module `function` declaration that is never
  reassigned and whose own body is itself a value projection. Everything else
  still fails closed, because each can hide state that no dependency witnesses:

  - a method on your data (`{header.getIsSorted()}`), including a helper that
    merely wraps one — the same hazard one call frame away;
  - a component-local callee, which nothing pins to an immutable identity;
  - hook calls (`use()` and any `use*`), which own suspension, hook cells, context
    subscriptions, and effect lifecycles rather than projecting a value;
  - `new Foo()` and tagged templates.

  Arguments carry the same contract, so `{format(row.get())}` stays disqualified.

  Same-module `function` helpers that are never reassigned are also now accepted
  as memo-region witnesses, on the same immutable-identity grounds already given
  to same-module components and `const X = memo(C)` walls.

  Measured on `benchmarks/chat-stream` (paired runs, same machine): 160 keystrokes
  through the controlled composer 2.22ms → 0.78ms, streaming a reply into a
  200-message history 1.56ms → 0.72ms, fine-grained token streaming 1.58ms →
  0.96ms.

  See "Automatic memoization and calls in templates" in
  `docs/differences-from-react.md`.

- 08843da: Restore the published JSX type-runtime and TSRX type-helper subpaths, and verify
  the required named exports of every built public JavaScript entry point.
- 8e01289: Add universal-renderer lazy components, retained transition and deferred-value
  scheduling, and conservative memo bailouts with context and local-update
  invalidation.
- cc79ac5: Every node the compiler prints now carries an origin location: synthetic
  scaffolding (hook-slot arguments, withSlot wrappers, inferred dependency
  arrays, scoped-CSS class bakes, warm plans, lowered guards, profile
  instrumentation, fragment renderers, and the rest) inherits the position of
  the authored construct it derives from, while authored subtrees keep their
  exact positions. Emitted source maps gain segments for previously unmapped
  generated code, laying the groundwork for source↔output navigation tooling.
  Manual AST construction was replaced with `@tsrx/core` builders (which attach
  origin locations directly) across the compiler. The test suites enforce
  completeness (`OCTANE_COMPILE_ASSERT_LOC`, set in `vitest.config.js`): a
  printed node without an origin fails with the offending construction listed.
- 3ea0855: De-opt child reconciliation keys skip the JSON serializer at the unwrapped top
  level — the shape every `{items.map(...)}` list and every `@octanejs/*` binding's
  rendered output produces. That level re-keyed every child on every parent
  render, including renders where all children went on to bail, so a 1,000-row
  list allocated 1,000 serialized strings per update. Nested wrapper paths keep
  the serialized encoding, and the two aliasing properties it provides (an
  explicit `key="0"` stays distinct from an implicit index 0; a user key cannot
  resemble a wrapper path) are preserved.

  On the `benchmarks/memo-wall` value-position wall, a Chromium CPU profile of the
  all-bail parent re-render drops the flatten step from 13.4% to 6.0% of samples
  and total samples by 13.8%; the timed op moves from 1.48x to 1.39x React.

- f96e7c4: Preserve keyboard, pointer, focus, and mouse event subclasses and metadata when deferred hydration replays interaction intent, including roots owned by another document realm.
- cc79ac5: The compiler no longer mutates the parsed module AST. Every transform over the
  parser-owned tree — type stripping, arrow-component normalization, scoped-CSS
  hashing and style maps, hook dependency inference and slotting annotations,
  error-boundary lowering, profile instrumentation, and print-time TS stripping —
  is now copy-on-write: changed spines are rebuilt with `@tsrx/core` builders and
  untouched subtrees stay shared with the parse. Compiled output is byte-identical
  and compile time is unchanged. The test suites enforce the invariant by
  deep-freezing every adopted parser AST (`OCTANE_COMPILE_FROZEN_AST=1`), so any
  in-place write fails loudly with the offending line.
- cc79ac5: The client compiler's module source map now covers render-plan expressions:
  event handlers (including compiled event bundles), dynamic text holes,
  attribute/class/style bindings, controlled-form and `dangerouslySetInnerHTML`
  values, refs, spreads, `@if`/ternary conditions, `@for` iterables, `@switch`
  discriminants and case tests, component props and keys, and portal
  expressions all map from the emitted positions (mount and update paths alike)
  back to their authored source. Emitted code is byte-identical — only the map
  gains segments — improving devtools debugging, error-stack resolution, and
  chained maps such as MDX's two-stage `.mdx` map. Module-scope hoisted helper
  bodies and the server (SSR) emit keep their previous mapping density for now.
- cc79ac5: New opt-in compiler inspection surface: `compile(source, file, { inspect:
true })` (client mode) returns `result.inspect` with `templates` — per hoisted
  template, `(offset range in the template HTML) → (authored source range)`
  origin entries for baked tags, static attributes (escaped values included),
  and static text, recorded at append time with no re-lexing — and `segments` —
  the module map's decoded segments enriched with absolute source offsets
  including node-exact source ENDS (which standard source maps cannot express),
  resolved via a smallest-node-at-offset index over the parse. Emitted code is
  byte-identical with the option on or off, and normal compiles skip all
  recording. This is the data contract for source↔output navigation tooling
  such as the playground.
- 971ec0c: Add a dev-only DevTools runtime hook (`globalThis.__OCTANE_DEVTOOLS__`) exposing
  the live component tree, per-node state/context inspection, and a per-flush
  subscribe channel. It is fully gated behind the profile compile flag, so normal
  production builds tree-shake it away.
- 971ec0c: Extend the dev-only DevTools hook with transition-count and Suspense-boundary-state probes (gated behind the profile flag).
- 1145d98: Preserve committed Suspense DOM, browser-owned state, and hidden subtree lifecycle while fallbacks are visible, and prevent head hydration from claiming wrong-tag foreign nodes.
- e19989d: Harden server functions with same-origin JSON POST validation, bounded request
  bodies, global authorization middleware, trusted-proxy-aware origin policies,
  and production-safe error responses across Vite, Rsbuild, and platform servers.
  Add hook-slot-safe Hotkeys and Pacer bindings, typed router-query SSR exports,
  and dedicated behavioral and type-check coverage for all three TanStack bindings.
- f96e7c4: Make hoisted head ownership module-, tag-, and root-aware, and reject malformed
  marker intervals without claiming unrelated server metadata.
- 07dff41: Reject asynchronous effects, asynchronous cleanups, and non-cleanup return
  values in the public effect-hook types.
- cc79ac5: Keep client-only renderer server-stub source maps valid when the authored
  module ends with a newline. Client-only modules without runtime exports now
  emit an empty server stub.
- 3686e54: Reuse warmed SSR fetches when child components read statically named computed
  props such as `props['aria-label']`.

## 0.1.13

### Patch Changes

- a719b93: Add an opt-in universal-renderer compiler capability for `'main thread'` and
  `'background only'` functions. Emit stable function identities, isolated
  capture bindings, layer-specific dead-code and import removal, namespaced
  main-thread host props, and source-attributed diagnostics through a
  renderer-owned thread-function ABI.
- 19c3ff1: Trim two cold-path costs on hydration/first mount. A keyed `@for`'s first fill
  (hydration adoption of the server item ranges, or a fresh mount) now runs
  through a small dedicated linear pass (`mountItemsLinear`) instead of entering
  the full prefix/suffix/LIS reconciler, so a cold page never pays the big
  function's first-call cost just to append items in order; the survivor key map
  and sibling chain are still built as a byproduct of the same pass, so update
  behavior and the keyed reconciler's guarantees are unchanged. And
  `commitEffects` now takes a single no-work fast path when every commit queue is
  empty — the common case for a hydration adoption or an effect-free flush —
  instead of calling each drain helper to discover there is nothing to do.
- 6cecb47: De-callback the hook memo tier in production client compiles, and memoize
  use()-fed promise chains at their declarations.

  - Authored and auto-generated `useMemo`/`useCallback` declarations compile to
    inline flat-cache regions: zero allocations on a dependency hit (no factory
    closure, no deps array, no hooks-map lookup), `Object.is` dependency
    semantics, closures allocated only on a miss. Dev/HMR/profile, server,
    universal units, and ineligible shapes keep the runtime form.
  - Parallel-`use()` creations lower to a closure-free `puTake`/`puPub` runtime
    ABI that preserves every warm-plan semantic (adoption, episode stamping,
    dedup) while eliminating the per-render arrow + deps-array allocations.
  - New Pass A′ (client and SSR): local `const` promise chains that feed `use()`
    (`const p = fetchUser(id); const t = p.then(…); use(t)`) are now memoized at
    their declarations — no duplicate fetch per suspend-replay, no refetch on
    unrelated re-renders, derived links key on their upstream promise's
    identity, and the chain head joins the `__warm` prefetch plan.

- d6ee673: Add Rspack layer specializations for renderer configuration, universal runtime
  identity, and exact runtime aliases. Include every specialized renderer graph
  in dependency discovery and persistent-cache identity.

  Allow universal renderers to declare first-screen event prop patterns and opt
  into main-thread render-only compilation that erases background-owned effect
  and ref callbacks and replaces event closures with lightweight listener
  sentinels.

- 9b6cd79: Preserve template directives nested in JSX values created during component setup across client rendering, SSR, hydration, and Suspense replay.
- 40d562b: Make production hydration template-free on the happy adoption path. Prod now
  validates an adoption root by nodeType + tag only, answered straight off the
  template's source string, so adopting server DOM never parses the template
  (parsing happens only on mismatch recovery and client-side mounts). Tag-level
  and text-level mismatches still detect and recover in production; same-tag
  branches differing only in static attributes are no longer detected there
  (React parity — dev keeps the full deep validation and warns + rebuilds).
- 3ffce4c: Update the TSRX compiler adapters and Ripple integration to their synchronized
  latest releases, including the nested-JSX slash parsing fix and Solid 2 beta.15
  alignment. Refresh the supported dependency ranges shipped by the affected
  framework bindings and build integrations.
- b92d76e: Define the inline-script content contract around static raw bodies and dynamic
  `dangerouslySetInnerHTML` values. Preserve authored static script characters,
  keep dynamic client and server output inside one script element, and hydrate the
  server-safe script spelling without a false mismatch.
- f325775: Resolve component-root template namespaces statically when the root tag is
  unambiguous. A component body whose root tag exists in exactly one namespace
  (`header`, `div`, `g`, `mi`, …) now compiles with the concrete `template()`
  namespace flag instead of the opaque flag, so `clone()` skips the per-clone
  destination-namespace walk on first mount and hydration. Genuinely ambiguous
  roots (`a`, `title`, `script`, `style`, `font`, custom elements, unknown tags,
  mixed fragments) keep the opaque flag and its per-destination resolution.
- c36608c: Emit exact `split={false}` / `never()` hydration boundaries as wrapper-free
  server-only ranges, prune private module-scope descendants used exclusively by
  those ranges, and defer boundary activation until nested renderer-owned Suspense
  reveals settle.
- 5974429: Fixes surfaced by porting tanstack.com to Octane (Phase 2c of the tanstack-com benchmark):

  - **octane compiler**: multi-line JSX string attributes no longer emit invalid JS (hostValue/spread, createElement de-opt, and SSR warm-child paths all re-derive the literal from its cooked value); TS `this` parameters are fully erased instead of surviving as parameter names; warm-child plans quote non-identifier prop keys (`aria-*`, `data-*`); direct calls to octane's `lazy` are emitted with `/* @__PURE__ */` so unused lazy declarations tree-shake like `React.lazy`; the vite plugin adds `.tsrx` to `resolve.extensions` so extensionless imports resolve like `.tsx`.
  - **@octanejs/tanstack-start**: new partial-hydration surface (`Hydrate` + `visible`/`idle`/`load`/`never`/`media`/`condition`/`interaction` via `./hydration`); `<ClientOnly>` children are now stripped from server compiles (octane analogue of the start-compiler's `handleClientOnlyJSX`), letting import-protection's tree-shake verification pass for `*.client.*` modules; import-protection's transform filter now covers `.tsrx` importers.
  - **@octanejs/tanstack-router**: the route-generator masker passes plain `.ts`/`.tsx` route files through untouched instead of feeding them to the TSRX parser.
  - **@octanejs/zustand**: `UseBoundStore` type is exported (upstream parity).
  - **@octanejs/sonner**: type-only names are re-exported with `export type` so compiled consumers don't reference erased bindings.

- af337d0: Run the shared TSRX semantic analysis during client, server, universal-renderer, and Volar compilation. Unused template output now fails normal compilation and is reported as a recoverable editor diagnostic in Volar mappings.
- b5b5880: Adopt Svelte's DOM operations technique in the client runtime: the shared
  traversal helpers (`child`/`sibling`, hydration cursor walks, range clears,
  de-opt child scans) now call cached native `firstChild`/`nextSibling`
  accessors so those megamorphic call sites stay monomorphic, and the expando
  keys the runtime polls on nodes that mostly don't carry them (`$$<event>`
  handler slots, `$$portalParent`/`$$portalEnd`, `$$deoptKey`, `$$ctrl`,
  hydration markers) are pre-seeded as `undefined` on the `Element`/
  `CharacterData` prototypes, turning negative lookups into fast prototype
  hits. Drift-corrected js-framework list/mount operations improve ~5–20%.

## 0.1.12

### Patch Changes

- a88f9ea: Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
  can now emit a Worker-targeted server bundle and a streaming module Worker for
  Workers Static Assets, with Cloudflare bindings and execution context available
  through request-scoped middleware and server-route context.

  Initialize streaming SSR token entropy on the first render so module evaluation
  remains valid in runtimes that prohibit random generation in global scope.

- 443bba7: Compiler: components referenced above their declaration (the canonical TanStack route-file shape — `createFileRoute(...)({ component: Home })` before `function Home() @{…}`) now compile to real hoisted function declarations instead of TDZ `const` bindings, in both client and server modes; capability stamps are emitted as `typeof`-guarded follow-up statements so route code-splitters that extract the declaration cannot strand them. Also restores the `compileToVolarMappings` sourceAst contract (`metadata.native_tsrx_body` on native template bodies) that TanStack's octane route-generator masker consumes — route-tree generation over `.tsrx` files works again without a committed `routeTree.gen.ts`.
- d388e80: Controlled `<select>` picks made through the real browser UI (popup, keyboard typeahead) no longer revert before their `change` handler runs. The browser dispatches a pick's native `input` and `change` in separate tasks; octane's controlled restore ran in the microtask between them and snapped the selection back, so `onChange` always read the old value. The pick is now marked in flight on `input`, the `change` dispatch performs the after-handlers restore, and a task fallback still settles a sequence whose `change` never completes (stopped propagation, synthetic lone `input`).
- 2f2a204: Add an optional universal host-attachment capability so renderer-managed
  physical recycling can detach and reattach ordinary refs without exposing a
  renderer-specific collection protocol.
- 0223241: Add renderer-gated host `className` aliasing, safe ordered prop-spread assembly,
  explicit raw-text host topology validation, and prevalidated multi-listener
  event delivery for transported universal renderers.
- f9234f6: Add Octane-owned production error codes with full development messages, compact
  documentation links in optimized builds, and progressive React-inspired developer
  diagnostics. Production Vite and Rsbuild server bundles now fold the runtime mode
  at build time so complete development diagnostics are removed without relying on
  server minification.
- fa11116: Fix the streaming/buffered SSR livelock for promises created in an ancestor render and passed down through props to descendant `use()` sites (the React "uncached promise" shape). The server compiler now caches inline creations in component-prop position across suspense passes (`<Kid p={make(x)}/>`), warm plans share that same creation instead of racing a second one, and a runtime livelock guard detects non-analyzable recreation shapes and degrades to per-site replay instead of burning 50 render passes and serving only `@pending` fallbacks. The max-pass SSR errors now hint at the recreated-promise cause.
- ec7ffbf: Mixed-toolchain ownership (`requireDirective: true`) is now marked by the `@jsxImportSource` pragma instead of the removed `'use octane'` directive: a project `.tsrx` is Octane's by extension and needs no marker; every other project module — `.tsx`, `.ts`, or `.js` — is Octane's only when it opens with a leading `/** @jsxImportSource octane */` pragma comment (full compilation for `.tsx`, octane hook slotting for plain `.ts`/`.js`, so custom octane hooks can live in pragma-marked `.ts` modules). In a `.tsx` the pragma is the same comment TypeScript reads for per-file JSX typing, so one marker both types the file and routes it to Octane's bundler integrations (Vite, Rspack, Rsbuild); in a JSX-less `.ts`/`.js` module TypeScript ignores the pragma, so there it acts purely as the ownership marker. A pragma naming a registered renderer's intrinsics module (e.g. `@octanejs/three/intrinsics`) claims the file the same way; a pragma pointing at a foreign source (`react`, `@emotion/react`, …) claims nothing. Unmarked project modules pass through to the host toolchain, with a once-per-file warning when they import from `octane`; installed octane packages keep their manifest-driven ownership, hook slotting included.
- 25d266b: Keep a return slot mounted through the passthrough-hydration componentSlot
  route on that route while the returned component identity is unchanged. The
  first post-hydration re-render previously flipped the slot to the childSlot
  regime and disposed it, remounting the entire adopted subtree — visible in
  TanStack Start apps as the whole page tearing down (losing all component
  state) on the first router event after hydration.
- d388e80: `octane/compiler` is now safe to import from browser dev servers again: the Node-only tooling siblings the entry re-exports (`vite.js`, `bundler.js`) switched their `node:fs`/`node:path`/`node:crypto`/`node:module` imports from named to namespace form, so evaluating them against a bundler's externalized `node:*` shim no longer throws at module load. The pure `compile` entry (used by the website playground to compile in-page) works in dev-served module graphs, not just tree-shaken production bundles. No behavior change in Node.

## 0.1.11

### Patch Changes

- f7e1cba: Reduce production client output with a compact single-root compiler ABI and a
  shared post-paint scheduler callback.
- 082b681: Elide inline `type` specifiers (`import { a, type B }`, `export { type C, d }`) and type-only star re-exports (`export type * from '…'`, `export type * as Ns from '…'`) from compiled output the way tsc does. Previously these leaked into the emitted JS — as an invalid `type` keyword or a runtime import/re-export of bindings that only exist as types — breaking module loading; a declaration left with no specifiers is now dropped entirely.
- 9d86d20: Add a DOM-free universal runtime entry, generic renderer validation contracts,
  an explicit host microtask scheduler option, and compile-only runtime/thread
  metadata for native universal integrations. Let Rspack integrations select a
  graph-local Octane runtime while keeping cache and module build metadata
  distinct across universal runtime specializations. Validate renderer-selected
  project `.ts` and `.js` helpers without changing which compiler owns their
  output, and keep nested renderer diagnostics scoped to their authored regions.
- 082b681: Export `OctaneNode`, the analog of React's `ReactNode`: the type of a renderable prop or child (an alias of `unknown`, matching the jsx-runtime `children` contract). Bindings ported from React should use it for props upstream types as `ReactNode`, which would reject octane's nominal elements.
- 742ae9d: React-hosted islands are now fully typed at the `<OctaneCompat>` boundary, in both authoring forms. `Octane.JSX.Element` extends `Promise<React.ReactNode>` (type-level only), so the exact signature the tsrx tooling infers for a `.tsrx` export is a valid React 19 JSX element type: `<OctaneCompat><Island …/></OctaneCompat>` type-checks zero-cast with exact island prop checking, while octane element values remain rejected in ordinary `ReactNode` positions. The inherited promise protocol is deliberately poisoned so the parent buys only that tag-gate assignability: `await element` is a hard type error (TS1320 — not a valid promise), `element.then/catch/finally(callback)` fail overload resolution with an explanatory message literal, `use(element)` is rejected by `use()`'s signature, and `Awaited` of an element is `never`, so `Promise.resolve(element)` yields an unusable `Promise<never>`. A typed `component`/`props` form was added alongside — `<OctaneCompat component={Island} props={{ … }} />` (client and server entries) — accepting the same island transport explicitly, with props inferred from the component's own signature. The `.tsrx` language tooling also pins the DOM renderer's virtual TSX to `@jsxImportSource octane`, so islands type against octane's real JSX even under a React-JSX host tsconfig (mixed React/Octane programs with `tsrx-tsc`).
- 2932a23: Streaming SSR document mode: when a `StreamOptions.injection` source is present and the shell renders a document, the response now leads with `<!DOCTYPE html>`, renderer-owned leading scoped styles (and the hoisted-head buffer) fold inside the authored `<head>`, and the held `</body></html>` tail closes the stream. `StreamInjectionSource` gains an optional `renderComplete()` callback — invoked exactly once when the renderer finishes producing markup (success or degraded abort/error path) so sources can finalize asynchronous serialization and then settle `done`. Without `injection`, streamed output is unchanged.
- e0c2f09: Streaming SSR: a shell whose root renders `<html>` now always leads the response with `<!DOCTYPE html>` — React Fizz parity, no longer gated on the `injection` document mode. The buffered renderers (`renderToString`, `renderToStaticMarkup`, `prerender`) stay doctype-free, also matching React.
- 082b681: Type-check `.tsrx` files against a renderer's own intrinsics via a file-local `/** @jsxImportSource … */` pragma: `compileToVolarMappings` now recovers the pragma from the source's leading comments (which the virtual TSX otherwise strips) and re-emits it as the virtual-file prelude, with the same precedence TypeScript gives an in-file pragma over `compilerOptions`. Also export `TsrxErrorBoundary` — the name the language tooling's type-only virtual TSX imports for `@try`/`@catch` — with a function-typed `fallback` so authored `@catch (error)` bindings get contextual parameter types under `noImplicitAny`.
- 082b681: `module server { … }` blocks now typecheck under the language tooling
  (tsrx-tsc / Volar). The type-only pipeline used to pass the dialect through
  verbatim, so the documented static import inside the block was TS1147 and the
  companion `import { fn } from 'server'` was TS2307 in every consumer. The
  Volar path now lowers the block before printing: block imports hoist to
  module top level (aliased through a mangled namespace import when the client
  half also uses the name), the block becomes a `namespace server` binding that
  keeps the authored name and location, and `from 'server'` imports become
  destructures of it — with authored locations preserved, so hover,
  go-to-definition, and diagnostics still map back to the `.tsrx` source, and
  `noUnusedLocals`-style checking stays clean. Runtime compilation is
  unchanged.

## 0.1.10

### Patch Changes

- d426046: Make client imports tree-shakeable and defer browser setup until the relevant
  feature is first used. Compiled DOM templates now parse on first mount,
  post-paint scheduling creates its channel on demand, and unused generated
  component initializers can be removed. Add `initializeHydrationEventCapture()`
  for applications that await work before `hydrateRoot()` so deferred interaction
  intent remains replayable without import-time listeners.
- f511024: Streaming SSR: add `StreamOptions.injection` (`StreamInjectionSource`) — merge a live stream of externally-produced HTML (e.g. a framework's data `<script>` tags) natively into `renderToPipeableStream` / `renderToReadableStream` output. Injected HTML is emitted verbatim, in push order, each drain as its own chunk strictly between tag-complete renderer chunks — never before the shell; for document renders the `</body></html>` tail is held and written last, and the stream closes only once rendering is complete and the source's `done` promise settles. Without the option, streamed output is unchanged.

## 0.1.9

### Patch Changes

- c704664: A synchronous commit during a controlled checkable's click dispatch (a handler
  calling `flushSync` — press-state machinery does this) no longer reasserts the
  stale controlled `checked` over the user's in-flight toggle. The platform
  toggles a checkbox/radio before its click event and fires `input`/`change`
  after it; reasserting in between reverted the toggle before any native handler
  could read it. During that activation window the `checked` binding now uses
  React's prop-diff semantics (an unchanged prop leaves the DOM drift for the
  event-side restore; a prop that actually changed still writes), matching
  React's observable behavior. The window covers the activated element and its
  radio-group cousins: the platform unchecked the cousin as part of the same
  toggle, and re-checking it mid-window would make the browser uncheck the
  activated radio before its follow-up events fire. The rejection contract is
  unchanged: an unheard or rejected toggle still snaps back after the follow-up
  events.

  Nested or canceled programmatic activations now close their window at the end
  of their own click dispatch. Checked and radio restoration is also installed as
  an optional runtime capability, so apps without controlled `checked` bindings
  do not retain the radio-group restoration code.

- 5b7d9ed: Discard a root's partially rendered tree when an uncaught initial render fails, preventing aborted effects from leaking into a later flush while keeping the root available for a recovery render.
- 5b7d9ed: Make the direct Vite compiler integration discover raw Octane dependencies from the nearest parent package manifest when Vite uses a nested root, and publish first-party types for `octane/compiler/vite`.
- 91b5f45: Infer omitted dependency arrays for locally declared custom hooks in
  full-compiled `.tsrx`/`.tsx` modules that transparently forward their callback
  and final dependency parameter to a supported hook.
- c16778a: Fix children loss when a value-position host descriptor changes its tag: the
  de-opt renderer recreated the element but preserved the children slot, whose
  markers and content lived inside the removed element, so children-block
  children (e.g. a styled-components-style `createElement(props.tag, { children })`)
  kept rendering into the detached node. The recreate path now tears the slot
  down so children remount into the fresh element, matching React's remount
  semantics for a host tag change.
- 39f2c00: Fix TSRX shorthand components that return before reaching their trailing
  template. Early values, bare or undefined returns, and trailing compiled JSX now
  reconcile through one returned-output path across client rendering and
  hydration; folded control-flow cache dependencies stay scoped correctly, and
  incompatible HMR edits safely invalidate the module.

  Restore feature-level tree shaking for ordinary component boundaries. Built-in
  boundary behavior now travels through component capability flags, so rendering a
  normal component no longer retains unused Hydrate, Suspense, or ViewTransition
  implementations through direct identity checks. Deferred-hydration setup and
  ViewTransition scheduler integration now install through retained feature
  capabilities, allowing their concrete runtime graphs to disappear from clients
  that do not use those APIs.

- aabf79c: Reduce production framework payloads by keeping transition swaps, generic
  component returns, and generic attribute routing out of bundles that do not use
  them. Production compilation now preserves void-component proofs across local
  module imports, lowers null-only component guards and statically authored error
  boundaries, and emits narrow boolean/ARIA attribute writers when their full
  semantics are known at compile time.
- 07511e4: Keep `onChange` native while adding compile-time and development-runtime text-host
  diagnostics, explicit commit intent, and correct controlled checkbox/radio
  restoration through native change. Use native `input` events for Base UI text
  controls while preserving the number field's form-facing native change commit,
  propagate authored-source diagnostics through MDX compilation and Vite, and make
  Octane's bridge tooling target React-style text-host event wiring without rewriting
  component callbacks or non-text controls.
- 5b7d9ed: Compile template directives nested directly inside other directive bodies, including conditional keyed lists whose items own `@try` boundaries, in both client and server builds.
- 0d2e265: Expose generic hydration ownership markers for externally serialized thenables and nested hydration containers, and preserve leading `#` package-import aliases in bundler module IDs.
- 3168360: Fixed compiling TypeScript modules that place multiple paired JSX elements on the same line in an array literal, including arrays inside JSX expression children.
- 81c8842: Keep scoped-style hashes stable across Hydrate splitting and renderer-boundary lowering: the compiler now restamps every scoped `<style>` with its authored-position hash after a source rewrite, so client and server compiles of one module always agree on the emitted scope classes instead of hydration-mismatching every element after a split boundary. A scoped `<style>` authored directly inside split Hydrate children is now a compile error (`OCTANE_HYDRATE_SPLIT_STYLE`) because extraction would tear the owning component's single style scope in half; move the style outside the boundary, into a child component, or opt out with `split={false}`.

## 0.1.8

### Patch Changes

- 156f213: Preserve explicit/spread class precedence across SSR and hydration, and keep generated keyed-list helpers outside destructured component parameters.
- 2a5f44f: Add compiler-backed deferred hydration with the `Hydrate` component, hydration
  strategies, split-child loading and prefetching, SSR adoption, nested interaction
  replay, and eager CSS retention for deferred chunks in the Vite and Rsbuild app
  integrations.
- f8e94f2: Improve server streaming and hydration conformance for Suspense errors, aborts,
  synchronous iterables and thenables, raw HTML/style safety, controlled fields,
  and mismatch recovery.

  Compose configured app root catch boundaries inside pending boundaries so route
  errors render the catch UI while suspensions continue to render the pending UI
  on both the server and client.

- a12a3d9: Add the experimental universal renderer foundation: a bundler-neutral registry and filename resolver, static host-plan compiler target, core-owned logical topology and staged transactions, object test driver, and explicit DOM-to-universal boundary.
- 1b21731: Refresh suspended boundaries when newer props supersede their pending promise,
  while keeping fallback-visible, fully staged transition groups together through
  their DOM, ref, and layout-effect commit.
- 7a123d2: Preserve Lexical node identity during cold Vite dependency discovery by expanding raw binding package prebundle family rules across the binding and app dependency manifests, including the complete declared `@lexical/*` module family.
- 95b3081: Complete the experimental universal client renderer's core composition
  semantics: nested component owners, template directives and spreads,
  transactional renderer events, and statically declared renderer-owned child
  regions in both DOM-to-universal and universal-to-DOM directions. Normalize
  and forward boundary metadata consistently across direct compilation, Vite,
  Rspack, and Rsbuild while preserving authored source maps and normal universal
  HMR, profiling, and parallel-use planning. Add the experimental boundary
  configuration schema and the reverse DOM owner bridge used by compiled child
  regions.
- 38d95eb: The compiler no longer claims a call as an octane builtin hook when its name is
  bound by an import from another module. A library hook whose name collides with
  a base hook (`useId` from a React-parity binding like `@octanejs/aria`,
  `useState`-alikes, …) previously had the octane builtin's runtime import
  injected over it — a duplicate-identifier parse error in the compiled module,
  and the wrong function at the call site. Non-octane import bindings now shadow
  the builtin spelling everywhere the bare-name classification applies (hook
  slotting, the JS-loop guard, and the `useState` third-tuple getter analysis);
  such calls take the custom-hook path with the standard trailing call-site slot.
- ba36091: Match React's `useEffectEvent` semantics with fresh per-render wrappers and
  commit-time, abort-safe callback publication. Block untrusted `javascript:` URL
  attributes consistently across client rendering, hydration, SSR, streaming, and
  resource hints.
- 6ccdbce: Let controlled selects preserve a browser choice across the native input/change event pair so `onChange` observes the selected value, and keep capture/bubble handlers in one discrete update window so capture work cannot restore the old choice before bubbling.
- d1bb5c3: Align root lifecycle, Fragment and iterable reconciliation, element and Children APIs, and lazy function-component resolution with the pinned React 19 conformance cases. Class components, legacy roots, `forwardRef`, and other unsupported React-only surfaces remain explicit non-goals.
- 9c21887: Add `octane/react` (experimental): host a compiled Octane subtree inside a real
  React 19 tree through one component — `<OctaneCompat><Island …/></OctaneCompat>`.
  React owns the wrapper and one host element; a private hosted Octane root owns
  every descendant through the existing renderer-region owner bridge. Local Octane
  `@try`/Suspense/error boundaries win first; only an unhandled island suspension
  or error escapes to the nearest React Suspense/error boundary (React reveals
  only after the Octane retry has committed). Events stay native and delegated at
  the island host, the child `ref` passes through as an ordinary Octane ref prop,
  unchanged parent re-renders skip the island update, and StrictMode probes and
  Suspense hide/reveal preserve the hosted root while real unmounts dispose it
  exactly once. React and ReactDOM 19 are optional peer dependencies; the entry
  carries `'use client'`. Not yet included (see
  docs/react-hosted-octane-compat-plan.md): transparent React context, island
  SSR/hydration, and selective per-island event delegation.
- 674f1a4: `octane/react` islands now server-render and hydrate. The new
  `octane/react/server` entry runs one synchronous hosted Octane pass per React
  server render (Fizz streaming or `renderToString`) against a request-local
  session, so Fizz retries replay settled work instead of re-fetching — one
  replay per suspension stratum, parallel `use()` fetches started once, and
  rejections routed to Fizz exactly once. Island React-context reads call
  `React.use` directly on the server; locally-guarded suspensions ship their
  `@pending` arms in the shell for the client to complete; scoped island CSS
  hoists as deduplicated React 19 style resources that client hydration
  recognizes; and hoisted `<title>/<meta>/<link>` from islands is rejected with
  a targeted diagnostic. On the client, `OctaneCompat` hydrates a
  server-rendered host in place: Octane adopts the exact server node identities
  (byte-identical `useId` values, preserved state, live events) while React
  never touches the island's descendants. Also closes the escape-protocol
  matrix: island layout/passive/ref faults surface in the nearest React error
  boundary, and update suspensions over committed content preserve hidden
  island DOM and state (transition-originated episodes refallback in v1 — a
  documented divergence).
- 6ceab55: `octane/react` islands now read REAL React 19 contexts transparently: an
  island's ordinary `use()`/`useContext()` accepts a `React.Context<T>` object
  (typed via a structural overload that keeps React types out of the core
  package), resolves it through the owner bridge to a root-local mirror,
  bootstraps the committed nearest-provider value from the host Fiber once, and
  stays live by subscribing through real `React.use(context)` reads in the
  wrapper — provider-only updates flow through memoized parents with zero
  post-subscription Fiber walks, `memo()` consumers inside the island are
  invalidated correctly, and islands never observe each other's providers. When
  Fiber inspection is unavailable (or a providerless read needs the context
  default), a request handshake retries with the authoritative React value
  before paint. Reading a React context outside a hosted island now throws a
  targeted diagnostic, and `useContext()` rejects non-context arguments instead
  of silently returning `undefined`.
- 3445fa6: Add a `requireDirective` option to every bundler integration for mixed-toolchain
  codebases (for example a React app hosting Octane islands via `octane/react`).
  When enabled, Octane compiles only project modules that open with a
  `'use octane'` directive: undirected project `.tsx`/`.ts`/`.js` pass through to
  the host framework's own pipeline (with a warning when they import from
  `octane`), an undirected project `.tsrx` is a build error, and installed or
  linked packages keep their Octane package-manifest decision. Paths routed
  through a different tsrx compiler (for example `@tsrx/react`) can be carved out
  with the integration's `exclude` option — excluded paths are never Octane's in
  this mode, even when a file declares the directive. The directive is purely an
  Octane-compilation ownership marker (not part of the tsrx language), composes
  with `'use client'`, is stripped from compiled output, and is tolerated even
  when the option is off. Client-only classification (`clientReferenceForFile`)
  applies the same ownership gate, so importers never hold a client reference
  for a module whose own transform passes through to the host toolchain.
- 6cfb63d: Report browser-repaired HTML nesting with authored locations during development SSR, and collect module style-map CSS while rendering so server and hydrated layouts use the same styles.

  Negotiate streaming gzip in the built-in Node HTTP transport for eligible SSR and static text responses, including the `octane-preview` path.

- c68562b: Error boundaries no longer corrupt the DOM when a @catch arm rethrows mid-render: the rethrown error now unwinds the live render stack before the outer boundary switches arms (previously the outer switch swept insertion anchors out from under still-mounting frames, producing an insertBefore NotFoundError that replaced the original error and could blank the page). During hydration, a client-built @catch arm also discards the slot's leftover server DOM, parks the adoption cursor past the slot, and renders with adoption suspended, so sibling content keeps hydrating cleanly instead of mis-adopting.
- 4de2b4f: Automatically reuse conservative pure TSRX component regions and keyed lists by inferred dependencies in production client builds, preserving context propagation and child-owned state. Always on in production compilation; dev/HMR/profiling/server builds keep normal reconciliation.
- 6868005: Add a renderer-infrastructure synchronous drain for universal hook and HMR
  updates. Add direct `HTMLCanvasElement` and `OffscreenCanvas` lifecycle support,
  composed Octane `act` and `flushSync` exports, callback-aware root unmounting,
  WebGL context recovery, controlled WebXR animation-loop ownership, precise
  universal HMR reconstruction, and the explicit-target low-level `DOMRegion`
  boundary.
- 1b21731: Render and hydrate template-only constructs nested in React-style returned JSX, including directives, Activity, Fragment refs, head singletons, and child code blocks. Preserve ordinary keyed Fragment descriptor boundaries across server rendering and hydration.

  Keep document-head hoisting namespace-aware across opaque component children so SVG titles remain inside the SVG selected by the component.

- 1b21731: Observe client-created thenables adopted from SSR suspense seeds so a later
  rejection cannot escape as an unhandled browser error during hydration.
- 1b21731: Apply component-scoped style blocks to React-style returned JSX, and keep
  multiple style blocks under one canonical scope across client rendering, SSR,
  and hydration.
- 7efdbdd: Harden server rendering and hydration parity for React-style Usable nodes, parser-sensitive streamed Suspense content, readiness callbacks, safe dynamic inline scripts, deep component trees, render-phase hook replay reached through user getters, root structural mismatch recovery and later updates, controlled form properties rebuilt during hydration, and suspended streamed boundaries that converge to one client arm without retaining abandoned registrations.
- 314b38d: Complete the React server-integration conformance matrix. Align client, SSR,
  streaming, hydration, and production compilation for attribute coercion,
  parser-normalized content, raw HTML, invalid children and element types,
  controlled native form fields, render-phase reducers, stable server hook replay,
  and React 19 callable Context providers. Resolve direct and spread host props
  from their final JSX source order, including aliases, duplicate writers,
  prop-driven children, void-element validation, and single-evaluation getters.
- dcd2707: Bound recursive effect setup/cleanup, ref, root-render, and external-store update chains with recoverable maximum-depth errors while preserving finite chains and wide independent batches. Keep `act()` scopes balanced when a synchronous drain rejects, report cross-component render updates in development, and preserve the implicit bailout when a compiled component returns unchanged `children`.
- d63b0d0: Extend the experimental universal renderer SDK with prepared host acceptance,
  stable-ID recreation, lifecycle and local callbacks, scoped events, prop
  codecs/resource handles, typed text and intrinsic metadata, and retained
  Activity/Suspense visibility. Add client-only renderer server stubs, omitted
  boundary regions, live-use diagnostics, and stable cross-adapter client
  reference manifests for DOM-shell hydration.
- 39e779c: Parallelize independent `use()` reads inside imported plain-TypeScript custom hooks and activate compiled warm plans across adjacent async component branches. Warm-cache entries now keep repeated component occurrences distinct and prevent speculative requests from restarting after adoption on later dependency waves.
- 1b21731: Preserve SVG, MathML, and foreignObject child namespaces across component templates, de-opt descriptor reconciliation, server rendering, hydration, and streamed reveals.
- f07c628: Add the R3F-compatible `useLoader` cache, preload/clear helpers, retained Three
  Suspense and Activity behavior, real browser asset loading, and client
  pending/error projection through `Canvas`. Preserve universal host roots while
  their DOM owner is hidden and allow updated hidden Suspense content to retry
  without waiting for an obsolete promise.
- fac1c66: Add asynchronous acknowledgement semantics to the experimental universal
  renderer transport and complete the Three technical preview with verified
  package exports, supported Three-version lanes, real WebGL failure recovery,
  and renderer performance baselines. Compiler-proven keyed intrinsic leaf loops
  now use an opt-in compact universal transaction, while the Three driver stages
  and applies canonical retained mesh batches without cloning the full host tree.
  The production-browser 1,000-mesh stability run now measures mount at 0.98x and
  retained updates at 1.03x R3F, replacing the previous 3.66x and 15.55x gaps.
- dbbcee1: Make Suspense waterfall elimination unconditional across the compiler and its
  bundler integrations. Remove the `parallelUse` configuration flag so compiled
  builds always run the conservative memoization, batched-unwrap, and eligible
  descendant-warming analysis. The rspack plugin rejects the removed option
  loudly; the vite plugin warns once that a passed `parallelUse` is ignored, so
  the timing change is never silent on upgrade.
- 5287eac: Add transactional universal portal target handles and R3F-compatible Three portals with state enclaves, shared frame and event integration, physical Object3D bubbling, validation, and ownership-safe teardown.

## 0.1.7

### Patch Changes

- eaacd17: Add opt-in client profiling builds across Vite, Rspack, Rsbuild, and MDX, with component timings, render causes, Chrome custom tracks, and a bounded console and trace API.
- 93dcb81: Reduce server-rendered `@for` overhead by accumulating item HTML directly, omitting per-item hydration markers for proven direct-host rows, and skipping keyed async-identity bookkeeping for compiler-proven synchronous items.
- 6852df7: Reduce production output size with compact numeric base-hook slots and collision-free ranges for composable custom hooks, mount-only event-callback sinking, and tree-shakable hydration capabilities.

  Production builds now prove direct imported TSRX roots and component bodies are void before selecting lean return-free render paths. Conditional string holes, statically named string `data-*` attributes, and statically safe uncontrolled `defaultValue` and checkbox/radio `checked` bindings also use smaller helpers, while ambiguous imports, spreads, dynamic return values, HMR, and profiling retain the generic behavior.

- b00cd74: Skip the full-response View Transition candidate scan for SSR passes that did not render a View Transition.
- e9852d4: Support server rendering and hydration for React-compatible `<Activity>` boundaries, including omitted hidden content and preserved offscreen client state.

## 0.1.6

### Patch Changes

- d173805: Harden buffered and streaming SSR with render-scoped boundary IDs, Node and Web
  backpressure/cancellation, request abort signals, and CSP nonces. Compile and
  bundle `module server` RPC functions, load importable root boundaries across
  development, production, and hydration, validate SSR templates, and preserve
  stream lifecycle through HTML composition.

  Keep async retry caches distinct across control arms, component keys/types, and
  keyed value arrays; rewind discarded render-phase side effects; hydrate streamed
  rejections through their server catch arm with catch-visible primitive,
  plain-object, and Error reasons in collision-free seed metadata; and preserve
  nested segment ordering and boundary-local IDs.

  Update the Vercel output contract for response streaming and adjacent ISR
  configuration, and publish the plugin/adapter with explicit peer, engine, and
  tarball boundaries.

- 85e589e: Reduce client DOM bookkeeping for anchored lists, inactive conditionals,
  `@empty` bodies, and compiler-proven single-root component or conditional keyed
  items while preserving the existing SSR and hydration range protocol.
- 2979f42: Reduce hydrated DOM bookkeeping by coalescing exactly coextensive range pairs
  into counted comments while preserving independent ownership boundaries.
- b41a91a: Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
  compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
  streaming SSR, hydration, HMR, production client/server builds, preview, and
  adapter support. Keep the existing Vite integration on the same shared core.
- e55f6ed: Add complete modern dnd-kit bindings with sortable, sensor, overlay, SSR, hydration,
  and React differential coverage. Preserve nested empty component ranges during
  hydration so later updates can fill and clear them without mutating server markup.
- d173805: Preserve compiler-driven state-hook getters on client and server while keeping
  getter-free calls on the existing two-item path, including bounded server
  render-phase updates and immediate getter reads. Isolate `useId` by root with
  working identifier prefixes. Harden first-reveal ViewTransitions and compiler
  hook discovery for aliases, namespaces, dependency inference, and plain-loop
  errors.

  Consume Octane as an exact singleton peer from every framework binding and
  publish a Node 22 minimum engine requirement across core and the bindings.
  Compile installed raw-source binding graphs through Vite while preserving
  manifest-declared manual hook-slot directories.

- 813fd50: Fix `<ViewTransition>` commits started from native discrete event handlers so transition-only work reaches `document.startViewTransition`, including work queued while an animation is already active. Use the broadly supported callback overload of the browser API, and correctly skip asynchronous native transitions when a commit activates no boundary.

## 0.1.5

### Patch Changes

- 940ae5a: Add compiler-driven third-tuple current-state getters to `useState` and
  `useReducer`. Getter-free destructures retain the existing runtime path, while
  observed or escaped tuples receive a stable thunk that reads the latest state.
- 6fceaf3: Infer dependencies for effect-family hooks, `useMemo`, `useCallback`, and
  `useImperativeHandle` when their dependency list is omitted. Explicit arrays
  retain React semantics, while `null` opts into running or recomputing after
  every render.
- 62da8cc: Fix: a compiled `{expr}` child hole skipped its update entirely when the value was identity-unchanged, which stranded context consumers below an identity-stable `{children}` passthrough under a re-rendering Provider (e.g. a router forwarding stable children through location providers on every navigation). Unchanged renderables (objects/functions) now still dispatch to childSlot — whose bail path lazily refreshes changed-context consumers — while unchanged primitives keep the inline skip.
- e737057: Propagate non-bubbling toggle, dialog, media, and resource events through logical
  ancestors, matching React while preserving native Event objects.

## 0.1.4

### Patch Changes

- 05fdef8: React-parity attribute aliases: the canonical camelCase JSX props now write the attribute the browser actually parses — `strokeWidth` → `stroke-width`, `acceptCharset` → `accept-charset`, `xlinkHref` → `xlink:href` (React 19's `aliases` table, plus the namespaced xlink/xml props) — on the client (dynamic bindings, spreads, de-opt props), the SSR serializer, and compiled static attributes. Matters most on SVG hosts, whose `setAttribute` preserves case: an unaliased `strokeWidth` landed verbatim as a dead attribute and never styled the element. Additive — native hyphenated spellings still write verbatim; custom elements keep raw names.
- e9ebfbf: Publish build: entry points are now globbed from `src/` instead of hand-listed — the hand-maintained list had silently drifted (css.ts, server/rpc.ts, static/index.ts were missing, so `dist/runtime.js`, `octane/server`, and `octane/static` shipped with unresolvable relative imports). A new post-build guard (`scripts/verify-dist.mjs`, also run in CI) makes the class of bug impossible to ship: every emitted dist module's relative imports must resolve (including the verbatim-copied `dist/compiler/`), every `publishConfig` export target must exist, and every published entry point must import cleanly in plain Node — otherwise the build fails.
- 4ac4c98: Runtime: dev-only diagnostics are now gated behind `process.env.NODE_ENV !== 'production'` so bundlers strip them from production builds — hydration-mismatch warnings, controlled-input/select dev warnings (flip, missing-onInput, select value shape), the `act()` environment warning, DOM-prop hints (autofocus/defaultvalue casing, non-boolean attributes, lowercase `on*` handlers, object attribute stringification), the unkeyed-array-child warning, and the `use()` waterfall/uncached-promise hints. Behavior in dev and tests is unchanged (the token folds only under a bundler define); the framework chunk of a production app build shrinks ~7% gzip.
- c2129eb: Controlled form components — React-parity `value`/`checked` semantics on native events. `value`/`checked` on `<input>`/`<textarea>`/`<select>` now follow React's controlled model exactly: the prop drives the DOM property and reasserts on every commit and after discrete events (rejected edits snap back), IME composition is respected, radio groups restore as a group, `<select value>` projects options (single + multiple; no match → first non-disabled), and number inputs use React's loose compare. `defaultValue`/`defaultChecked` are the uncontrolled escape hatch. Hydration adopts pre-hydration user input (React parity), then the first commit/discrete event reasserts. Events stay 100% native — there is no synthetic `onChange`: `onInput` is the per-keystroke handler for text controls (native `change` fires on blur), and a dev warning flags a controlled text control with no `onInput` (special-cased when only `onChange` is present). `<textarea>` with both children and a `value`/`defaultValue` prop is now a compile error (the prop owns the content).

  **BREAKING:** apps that relied on a dynamic `value=`/`checked=` binding being a write-once attribute (set it, then let the user's edits win) now get React's controlled behavior — the prop reasserts and rejected edits snap back. Migrate those inputs to `defaultValue`/`defaultChecked`.

  Also ships the attribute-layer React-parity fixes: boolean attribute props (disabled, hidden, inert, readOnly, required, …) normalize — any truthy value renders the canonical `attr=""`, falsy removes — via the shared `BOOLEAN_ATTR_PROPS` table on client, SSR, and static compiles; booleans on non-boolean attributes are removed + dev-warn (`title={true}` no longer renders `title=""`), with `download`/`capture` keeping React's overloaded-boolean semantics; `muted`/`multiple`/`selected` dynamic writes set the DOM property (a dynamic `muted={x}` actually mutes); `autoFocus` writes no attribute and instead focuses the element in the commit phase of its mount; attribute-name validation is a proactive dev-warned skip (`VALID_ATTR_NAME`) instead of try/catch + prod console.error; new dev-only diagnostics for `[object Object]` coercion and the genuinely-broken casings (`autofocus`, `defaultvalue`, `defaultchecked`, lowercase `on*` function props). New tier-2 runtime exports (`setValue`, `setChecked`, `setSelectValue`, `setDefaultValue`, `setDefaultChecked`, `setAutoFocus`) and server helpers (`ssrValueAttr`, `ssrCheckedAttr`, `ssrTextareaValue`, `ssrSelectScope`, `ssrOption`).

- 4ac4c98: Marker elision M1 (docs/comment-marker-elision-plan.md): components whose body provably renders one plain element now carry a compiler-emitted `$$singleRoot` stamp on their exported binding, and call sites whose callee is an IMPORTED identifier (stable identity — local variable callees are excluded) pass a sentinel so `componentSlot` takes the existing markerless singleRoot mount path cross-module. Client-mount comment pairs drop for qualifying components; SSR output and hydration adoption are unchanged (same contract as forBlock's singleRoot items). Pinned by the marker-shape structural tests.
- 8a44bb5: React 19 custom-element listener semantics: a function-valued lowercase `on*` prop on a custom element (`<my-el oncustomevent={fn}>`) now attaches a real event listener for the name after `on` (verbatim), with identity swaps re-attaching and null detaching — and the function never lands in the markup. This is platform-aligned, not synthetic emulation: custom elements dispatch arbitrary events and this is the only declarative way to hear them. The property-vs-attribute heuristic remains intentionally unsupported (plain attributes, per octane's pass-through policy).
- 6b0c244: Marker elision M4: two client-mount elisions for descriptor-heavy trees (charts, de-opt lists). A `{expr}` hole that is its element's SOLE child now hands the element to an owns-parent childSlot — component/element values render with no anchor comment at all (previously one comment per hole). And pure single-element items in de-opt keyed lists (value-position `.map()` arrays) now self-mark — the rendered element is the item's own range marker, eliding the per-item `<!--it-->` pair; component-bearing, null, and primitive items keep their pair, and an item whose value later stops fitting one element promotes to a minted pair in place (one-way). SSR output and hydration adoption are unchanged; a recharts-style page drops roughly a sixth of its total comment nodes on top of M2/M3.
- d3cf678: Marker elision M2: de-opt host elements (descriptor-tree children, `.ts` `createElement` hosts) hand their content to a single owns-parent childSlot — no comment markers minted at all (inserts append, clears sweep the element), and component-bearing de-opt list items borrow their own `<!--it-->` pair instead of nesting a second one. Deep descriptor trees (e.g. charts) render with a fraction of the comment nodes; SSR output is unchanged.
- 05fdef8: Fixed a commit-phase crash ("Failed to execute 'removeChild' on 'Node'…") when a route swap or conditional removes the focused element: Chrome fires `blur`/`focusout` synchronously inside `removeChild`, and blur is a discrete event, so the end-of-dispatch flush re-entered the scheduler mid-commit — draining queued renders and effects while the outer removal walk held cached sibling pointers. A flush now tracks that it is on the stack (`inFlush`); a `flushSync` landing during it (including the internal discrete-event flush) runs its callback and defers the drain to the ambient flush, matching React's "cannot flush when already rendering" rule. `flushSync` nested inside another `flushSync`'s _callback_ still flushes inline.
- d19d4f3: The DOM truth tables (boolean/must-use-property attributes, attribute aliases, SVG-only tag classification, unitless style props, void elements, style-value coercion, style-key hyphenation) now live in one shared module (`src/dom-tables.js`) imported by the compiler, `octane/constants`, and both runtimes, instead of hand-duplicated per consumer — table drift between static bakes and dynamic writes is now structurally impossible. One real divergence this fixed: statically-baked style objects now trim string values (`{color: ' red '}` → `color: red`) exactly like dynamic/SSR writes, so the same style object can no longer produce different bytes depending on whether the compiler could bake it.
- 7e84258: React-parity effect commit + deletion ordering — the last two `useInsertionEffect` parity gaps. The commit now mirrors React's per-fiber mutation walk (`commitMutationEffectsOnFiber`): per component in tree post-order, destroy ALL of its insertion effects, create ALL of them, then destroy its layout effects — so a sibling's layout cleanups land before a later sibling's insertion work, and insertion destroy/create pairs group per component (matters to CSS-in-JS style recycling); layout bodies still run afterwards in the layout phase, after ref attach. Unmount is now phase-correct too (`commitDeletionEffectsOnFiber`): a deleted component's insertion + layout cleanups fire synchronously in hook DECLARATION order (React's forward effect-list walk — previously one reverse-registration unwind), and passive (`useEffect`) cleanups are DEFERRED to the passive flush (React's `commitPassiveUnmountEffects`) instead of running synchronously at unmount, with errors still routed to the try boundary enclosing the deletion.

  **Observable change:** `useEffect` cleanups no longer run synchronously during unmount — they fire in the next passive flush (post-paint, or `drainPassiveEffects()`/`act()` in tests). `@octanejs/testing-library`'s `unmount()`/`cleanup()` flush them for you (RTL's act-wrapped contract).

- 2f8c6ed: Compiled output 3b: `() => fn(arg, …)` event handlers now compile to one arity-helper call per site — `_$evt1(el, "$$click", fn, arg)` builds the `{ fn, args }` descriptor once at mount and returns it as the binding's single bag field (previously element + fn + every arg were cached separately), and `_$evt1u(d, fn, arg)` mutates that descriptor in place on update. Dispatch reads the element's event slot per event, so the mutation is observed with no identity compare, no object rebuild, and no property re-assignment — deleting the largest repeated update block in the generated code.
- 8de4584: Keyed `@for` correctness: a render-time call in the item body (e.g. `header.column.getIsSorted()` on a memoized TanStack Table header) now disqualifies the PURE/DEP-PURE survivor short-circuit, so the body re-runs on every parent render like React. Calls can read mutable state that neither the item reference nor the deps tuple witnesses — previously a ref-stable survivor could render stale output. Property-read-only bodies (the measured benchmark wins) keep the promotion; calls deferred inside event-handler closures stay eligible.
- 9be6ba5: Compiled output Phase 2: construct body helpers (`@if`/`@else` branches, `@switch` cases, `@try`/`@pending`/`@catch` arms, `<Activity>` bodies, `@for` item/`@empty` bodies, portal bodies) are now hoisted to module scope instead of being re-declared inside the component on every render — zero per-render closure allocations and stable helper identities. Captured parent locals ride the `__extra` ABI slot: the call site passes the current values as one small env tuple per construct (for `@for` it is the existing deps array doing double duty), the runtime stamps it on the construct's block, and the helper destructures it — the same values-at-last-parent-render staleness the closures had. Component children render-fns (`__children$N`) keep the inline placement (they are invoked through props, not through a construct block).
- db409de: compiler/vite: hand-slot-forwarding libraries are now self-declarative. A binding whose plain `.ts`/`.js` sources forward hook slots themselves declares `"octane": { "hookSlots": { "manual": ["src"] } }` in its own package.json, and the plugin's surgical hook-slotting pass skips files under the declared directories automatically (nearest-manifest lookup, cached per directory) — no more repeating `exclude` path lists in every Vite/Vitest config that aliases workspace sources. The scope is a directory list rather than the whole package so a binding's own test files stay auto-slotted. The `exclude` option remains as an ad-hoc escape hatch.
- 4f3c6c8: The compiler now rejects slot-keyed hooks inside plain JS loops (`for`,
  `for…in`, `for…of`, `while`, `do…while`). Hooks are keyed by a per-call-site
  slot, so every iteration of a loop shared the ONE slot assigned to that call
  site — `useState` silently shared a single state cell across iterations,
  `useMemo` recomputed every iteration with only the last entry surviving, and
  slot-keyed effects collided the same way. This was always documented as
  rejected; the check now exists, with a diagnostic pointing at the supported
  forms: the keyed `@for` template directive (each item renders in its own scope,
  so per-item hooks get per-item state) or extracting the loop body into a child
  component. `use()` and `useContext` are exempt (call-order / context-identity
  keyed, not slot-keyed) and keep working in loops, as do hooks behind a
  DEFERRED nested function boundary (local components, stored callbacks).
  Closures that execute during the iteration itself — IIFEs and inline callbacks
  to synchronous array-iteration methods (`.map`, `.forEach`, …) — are treated
  as inline and rejected too.
- 62c3c4e: Dynamic JSX tags that resolve to a host tag STRING at runtime (`<props.parts.title>` with `{ parts: { title: 'h1' } }`, `<Tag/>` with `const Tag = 'h1'`) now render correctly in template position on the client. Previously `componentSlot` created a block whose body was the string and crashed in `renderBlock` ("not a function") on both fresh mounts and hydration. The string comp now renders as a host element (props, refs, and delegated events applied via the de-opt prop machinery) with the compiled `children` render-fn inlined as the element's entire content — no nested marker block — matching the server's `<!--[--><tag>…</tag><!--]-->` emission so hydration adopts the element in place. Same tag across renders patches the element in place; a tag change or a string↔function flip tears down and remounts (React's element-type semantics). Value-position string tags (`.tsx` returns) were already handled and are unchanged.
- 3c56d95: `hydrateRoot()` now skips leading `<style data-octane>` tags when positioning the adoption cursor. A streamed shell flushes its deduped scoped-style tags ahead of the body markup (so painted fallbacks are styled), which previously broke hydration of streamed pages that use scoped `<style>` — the cursor adopted a style tag as the component root and rebuilt the whole tree.
- 4c5b1d0: Identifier JSX tags that don't start with a lowercase ASCII letter — `<_Inner/>`, `<$Inner/>` — now compile as component REFERENCES (`createElement(_Inner, …)`), matching JSX semantics (Babel/TS `isCompatTag`). Previously only `/^[A-Z]/` tags were components, so `_`/`$`-prefixed tags miscompiled to host string tags (`createElement('_Inner', …)`) on the client and invalid-tag errors or literal `<_inner>` markup on the server. Lowercase and dashed tags (`<div>`, `<my-element>`) stay host tags.
- b732399: Marker elision M3: a component call that is the sole root of a `@{ … }` body now INHERITS its parent block's marker range on all three sides — the client borrows the parent's markers instead of minting a `comp`/`/comp` pair, the server skips the child's `<!--[-->…<!--]-->` frame pair, and hydration adopts nothing at the site. Sole-child wrapper chains (layout stacks, `<ctx.Provider>` router/binding wrappers, member and dynamic tags included) collapse to the outermost pair with zero comments per layer. `key=` sites and the boundary builtins (Suspense/ErrorBoundary/Activity — declined by identity at runtime, so aliased/member references are safe) keep their pairs. As a side effect, a component-form and a bare-element-form of the same markup now serialize identically and cross-reconnect clean during hydration, matching React.
- 6d27cb0: Add `isChildrenBlock(value)` to distinguish compiled element/text children from render-prop function children.

  A component's element/text children (`<C><D/></C>`) lower to a render function, while a render-prop child (`<C>{(data) => …}</C>`) is passed through raw — both are `typeof === 'function'`, so React-ecosystem APIs that branch on `typeof children === 'function'` (function-as-child / render props) could not tell them apart. The compiler now tags compiled children-blocks (`markChildrenBlock`), and the new public `isChildrenBlock(value)` returns `true` only for them, so a consumer can write `typeof children === 'function' && !isChildrenBlock(children)` to detect a genuine render-prop child. Enables faithful ports of libraries whose components accept either content or a render function (e.g. Base UI's Dialog/Popover payload render functions).

- a3784b1: Hydration: `componentSlotLite` now advances the hydration cursor past its adopted `<!--[-->…<!--]-->` range after its body renders (mirroring `componentSlot`'s post-render advance). Before, a hookless component followed by a SIBLING hookless component in the same children block left the cursor parked on its adopted root, so the next slot adopted no range, its commit insert MOVED the previous sibling's element to the shared end anchor, and the second component's server DOM was stranded — multi-child `{children}` hierarchies (`<Box><Box/><Box/></Box>`) did not hydrate byte-stably. Nested and multi-child component hierarchies now adopt server markup byte-for-byte.
- fa77edf: `useFormStatus` now activates for the manual-action idiom (React parity): a `startTransition` called synchronously during a form's submit dispatch whose default was prevented (`onSubmit={e => { e.preventDefault(); startTransition(async () => …) }}`) publishes pending status to that form until every such transition settles. Previously only the intercepted `<form action={fn}>` path published form status. A plain async handler (no transition) or a non-prevented submit still never activates it, and the manual and intercepted paths share the same pending counter so overlapping submissions coalesce.
- f5c9dba: Compiler: the binding bag is now allocated in ONE shot by shared runtime arity factories (`bag0`…`bag16`, spill `bagOf`) with its real mount values — `_b = _$bag5(__s, _root, v0, …)` builds `{a: v0, b: v1, …}` (final hidden class + real field representations at allocation, one hot allocation site per arity), inserts the root, and commits `__s.slots[0]`, replacing the per-field property-write mount and the inline insert/commit pair. Bag fields are compiler-assigned 1-char names (minifiers can't shorten object properties — this is a shipped-bytes win: −17.6% minified / −5.5% gzip on the codegen-size corpus), except ref/spread/fragmentRef fields, which keep their long names for the runtime's suspense-hide ref walk and route through `bagOf`.
- 12d5410: Parallel `use()`: the compiler now eliminates suspense waterfalls from idiomatic sequential `use()` code — ON by default (opt out with `parallelUse: false` on `compile()`/the vite plugin for React-timing waterfall semantics). Non-trivial `use()` arguments compile to slot-keyed memoized creations (member-path deps — replays can never mint fresh promises, refetch happens exactly when inputs change); provably-independent creations in one body hoist above the first unwrap and suspend as ONE batch (`_$useBatch` — one boundary retry per settled stratum instead of one per promise); and suspended bodies warm the descendant fetch tree (compiled `Comp.__warm` plans start every child fetch whose reachability and props are provably independent of the suspended data, recursion depth-capped, dep-keyed cache adopted by the real mounts). A 10-level nested async chain (`benchmarks/async-waterfall`) drops from 174.8ms (10.9× the latency floor) to 20.1ms (1.3× — Solid 2.0 / Ripple territory) while React runs the same code at 307.3ms. Unwrap order, hydration-seed order, rejection routing, and `@pending`/transition semantics are unchanged; true data dependencies stay sequential.

  Always-on runtime hardening that shipped with it (flag or no flag): `use()` thenable slots are now scoped to one suspension episode (cleared on fresh renders and after a completed body — React's thenableState lifecycle), a resume replay that creates a fresh promise for a slot that already holds one reuses the stored thenable instead of re-suspending forever (with React's "uncached promise" dev warning), and a replay that discovers a new pending `use()` behind a data dependency logs a dev waterfall diagnostic.

- d71f1fc: Compiler: hook slot symbols in non-HMR output (production builds, SSR) are now `Symbol("<filenameHash>#<n>")` instead of `Symbol.for("octane:<module path>:<Comp>.<hook>#<n>")` — only HMR's module re-import needs the registry identity, and the old form leaked the ABSOLUTE source file path into shipped bundles (~80-120 chars per hook call site). The short description is load-bearing, not cosmetic: the runtime composes custom-hook slot paths from slot DESCRIPTIONS (`resolveSlot`), so it must stay unique per call site — a bare `Symbol()` collapses the composition and collides custom-hook state (pinned by the new prod-mode hydration smoke test). Dev serve keeps the stable `Symbol.for` keys so hook state survives hot swaps, including the plain-`.ts` `slotHooks` pass.
- 2f8c6ed: Compiled output: ref manifest. Bodies with ref-carrying bindings (`ref={…}`, spreads, `<Fragment ref>`) now stamp a module-scope manifest (`__s.refFields` — flat kind/field/element triads) that the suspense-hide path walks directly, replacing the key-prefix scan over the binding bag. Those fields therefore take normal 1-char names and ride the positional bag arity factories — previously one ref anywhere in a component forced the whole bag onto the named-literal spill. Detach/re-attach timing across a suspend is unchanged.
- 63e51e8: compiler: return-JSX functions now contribute real sourcemap segments. `compileReturnJsxFunction` prints via `printNodeWithMap` and threads esrap's per-token mappings into the module map (adjusted for inlined directive helpers and export wrappers), so chained maps over compiled output — e.g. @octanejs/mdx's two-stage `.mdx` map — compose instead of falling back to the intermediate-JSX map.
- 6d3b269: Runtime: two error/suspense boundary fixes surfaced by the @octanejs/tanstack-router
  parity work. (1) A catch-less `tryBlock` that receives an error mid-render now
  RETHROWS instead of synchronously delegating to the parent boundary's handler —
  delegation let the frames between the throw site and the outer boundary keep
  rendering into DOM the outer boundary's switch had already swept (stale-anchor
  `insertBefore` NotFoundError replacing the original error). (2) An update
  scheduled for a block inside a suspense-hidden subtree (try content
  soft-detached to `savedDom` while the fallback shows) now re-attempts the WHOLE
  boundary — reattach, render, reveal on success / re-stash on re-suspend — per
  React's "setState on a suspended component retries the render" semantics,
  instead of rendering the block against detached DOM geometry. Compiler:
  method-style hook calls (`route.useLoaderData()`, `api.useSearch()`) now get
  per-call-site slot wrapping (`withSlot` thunk preserving `this`), enabling
  object-carried hooks like TanStack Router's Route/RouteApi accessors.
- b171c6d: `octane/server` now exports the React-compatible element utilities the client entry already had: `isValidElement`, `cloneElement`, `Children`, and `createPortal`. Bindings that inspect or re-project descriptor children (recharts' axis-tick cloning, a Radix-style Slot) compile the same source for both modes, so these imports must resolve under the server build too — previously the SSR bundle failed with missing exports. Server `cloneElement`/`Children` mirror the client semantics over the shared descriptor shape; server `createPortal` mints the PORTAL_TAG descriptor the SSR serializer already renders as a bare site anchor (portal content mounts client-side on hydration).
- 7f3d9c9: SSR: tag server-compiled `__schildren` component-children render-fns with
  `markChildrenBlock`, matching the client emission. Untagged, a component's
  render-prop check (`typeof children === 'function' &&
!isChildrenBlock(children)`) misfired on the server only — the children block
  was INVOKED as a render prop, returned its HTML string, and the enclosing hole
  escaped that markup into visible text (e.g. the router `<Link><img/></Link>`
  logo rendering as raw `src="data:image/svg+xml,…"` text before hydration, plus
  hydration mismatches). Regression test:
  packages/octane/tests/hydration/children-local-hydrate.test.ts.
- 820baaf: SSR now renders member-expression / dynamic JSX tags (`<obj.tag/>`, `<{expr}/>`) whose runtime value is a host tag STRING — e.g. MDX's `_components.h1` mapping, unoverridden. `ssrComponent` routes a string comp to the host-element serializer inside the same single `<!--[-->…<!--]-->` block a component body gets (the client's de-opt descriptor shape), instead of calling the string as a component body (`TypeError: comp is not a function`). Dispatch stays dynamic: the same tag site renders a component when the runtime value is a function, and hydration adopts either shape without mismatch. Injection-unsafe tag strings still throw (`Invalid tag`), matching the client where `document.createElement` rejects them.
- c36cb32: SSR mirror of parallel `use()`. The compiler's memoize + hoist/batch passes now run on server bodies too (same `parallelUse: false` opt-out): independent `use()` creations register with the render loop in one batch before the first suspend, so a body stratum of K independent fetches costs ONE network round instead of K — measured flat at ~1×latency for k=4 and k=8 in the new `ssr-throughput` `parallel-k*` ops. Creations are memoized in a keyed cross-pass cache (`puMemo`), so discovery re-runs and the final canonical pass reuse the same in-flight promise instead of re-firing the fetch (a D=3 waterfall's first-level creator now fires once, previously three times). Batch-registered thenables resolve at their unwrap sites by instance identity; plain `use()` sites keep their exact occurrence-keyed semantics, and hydration seed order (use()-call order) is unchanged. True data dependencies remain sequential.
- c33f409: SSR now processes render-phase state updates, matching React's server renderer: a `useState`/`useReducer` dispatch fired while its own component renders queues the update and re-invokes the body until a pass settles (bounded at 25, then "Too many re-renders"), so `renderToString`/`prerender` serialize the converged state instead of the initial value. Dispatches after the pass or from a different component stay inert, exactly like Fizz. Each retry rewinds what the discarded pass emitted — `useId` numbering, suspense seed order, suspense/discovery registrations, hoisted head markup, and frame child/occurrence counters — so the settled pass is byte-identical to a single-pass render of the final state.
- 63e51e8: SSR: a return-JSX component returning a FRAGMENT (`function Doc() { return <>…</>; }`) now serializes hydration-compatibly. The client value-lowers the returned fragment to a descriptor array mounted by the return-slot `childSlot` — one slot range plus one `<!--[-->…<!--]-->` block per item (text items included) — but the server's template walk concatenated the children with markerless text separators and no slot range, so `hydrateRoot` silently rebuilt (duplicated) the content instead of adopting it. The server compiler now routes value-position returned fragments through `ssrChild([...])` over the same descriptor array, making server output byte-adoptable by the client. Single-element returns, `@{}` template bodies, and value holes are unchanged.
- 8fc8554: Two server-runtime fixes surfaced by the first production SSR build of an @octanejs/tanstack-router app:

  - `octane/server` now exports `flushSync` (server semantics: a render is synchronous and there is no update queue, so it runs the callback and returns its result — mirroring `startTransition`) and `isChildrenBlock`/`markChildrenBlock` (same `Symbol.for` key as the client runtime, so identity holds across mixed graphs). Router code importing these compiled fine for the client but failed to resolve in any SSR module graph.
  - Server compiler: synthetic subs (`@if`/`@for`/`@switch`/`@try` branches and `__schildren` component children) are now always compiled in TEMPLATE position. They previously reset to VALUE position, which made `ssrEmitComponent` take the descriptor-children path inside every sub — silently DROPPING directive-block children of nested components (`lowerJsxChild` cannot lower an `@if` to a descriptor) and desyncing the server block count from the client (which compiles those branches through the template walk). A `<C>@if (…) { … }</C>` nested one sub deep — e.g. the router's `Provider > CatchBoundary > @if { <Match/> }` chain — server-rendered `<C>` childless, blanking whole pages.

- 569daad: SSR warm walk — the server now executes compiled `__warm` fetch plans, completing the parallel-`use()` mirror across component depth. When a component's first batch suspends, its warm thunk starts descendant components' provably-independent creations (recursing through each child's own `Comp.__warm` plan, the same eligibility rules as the client: warm-safe props, guard chains preserved, edges gated on suspended data cut) and registers them with the render loop, so nested independent fetches all go out in pass 1: a depth-8 chain of ~4ms fetches renders in one ~4.6ms round instead of eight (new `ssr-throughput` `parallel-nested-d4/d8` ops, p50 flat across depth). The descendant's real render adopts the warmed promise by slot + deps (transfer semantics — each fetch fires exactly once; a props drift between warm and render is a clean miss). Seed order, true-dependency sequencing, and the `parallelUse: false` opt-out are unchanged.
- 6b7b727: Compile-time-baked static object styles now serialize in CSSOM shape (`width: 100px; overflow: auto;` — declarations terminated, not separated). Previously a baked `style` attribute dropped the final semicolon, so the same element's style read back differently depending on whether the style was static (template-baked) or dynamic (written through `el.style`) — an observable byte difference in innerHTML comparisons (and vs React, whose styles always go through CSSOM). Applies to both client templates and SSR output, which share the serializer.
- 2ce7bc5: Streaming SSR now delivers each Suspense boundary's segment at its OWN resolve time. The round loop in `renderToPipeableStream` / `renderToReadableStream` used to settle a round with `Promise.all` over every suspended thenable, so on a staggered data schedule the earliest boundary's HTML was held until the slowest sibling landed (one giant tail chunk). Rounds are now WAVES: await the first unresolved settle, coalesce everything else that lands in the same event-loop turn (one `setImmediate`/`setTimeout(0)` yield plus microtask drains), re-pass, flush newly-done segments, repeat — so simultaneous resolutions still share a single re-pass (the all-fast case stays at ~2 passes) while staggered boundaries stream as they arrive. `MAX_SUSPENSE_PASSES` accordingly now bounds CONSECUTIVE passes that complete no boundary (one pass per resolution wave is legitimate, not a runaway); waterfall-depth and nondeterministic-key runaways still trip it. Buffered `prerender` settling is unchanged.
- c6a23f5: SVG-only tags (`g`, `rect`, `path`, `circle`, … — every tag with no HTML counterpart) now imply the SVG namespace in namespace-ambiguous positions: a component whose ROOT is such a tag, a value-position/`createElement` descriptor, fragment roots, and portal children targeting an SVG container. Previously these compiled/rendered as HTML-namespace elements (`HTMLUnknownElement`) that paint nothing inside an `<svg>` — a component returning `<g>…</g>` only worked if its markup lexically sat under `<svg>` in the same file. The inference table (`SVG_ONLY_TAGS`) is shared by the compiler's template namespacing and the runtime's de-opt reconciler; ambiguous names (`a`, `title`, `script`, `style`) keep the inherited namespace, matching browser foreign-content rules.
- c93aad5: Compiler: an SVG `<title>` (the accessibility tooltip element) is no longer
  head-hoisted — hoisting `<title>`/`<meta>`/`<link>` to document.head now skips
  svg-namespace subtrees, matching React 19's exception. Previously a tooltip
  inside `<svg>` was hoisted on the client (stomping the document title) and made
  the server compile throw ("does not support node type HeadHoist"). Also fixes
  the server emitter's namespace tracking (`nsForSelf`/`nsForChildren` were
  called with the node instead of the tag, so svg subtrees never entered the svg
  namespace server-side). Regression tests:
  packages/octane/tests/svg-title-hoist.test.ts.
- 2942afb: Six React-parity fixes surfaced by the react-hook-form port. (1) `act()` now supports React's SYNC form: a non-async callback has all scheduled work (renders + effects) flushed synchronously before act returns, so `act(() => setState(...)); expect(...)` works without awaiting; async callbacks keep the awaited drain-until-quiescent behavior. (2) Zero-arg `useState()` / `useRef()` (state/ref starting undefined) no longer throw "called without a slot symbol" — the compiler appends the slot as the last argument, so it lands in the initial-value position and is now reinterpreted, matching the effect hooks' ABI rule. (3) The compiler drops type-only statements (`type X = …`, `interface I {}`) declared inside function bodies from the runtime emit — previously the nulled-out alias crashed the printer; top-level statements were already filtered. (4) The de-opt pure-host → component upgrade now ADOPTS the existing host tree instead of rebuilding it: when a conditional child of a previously component-free createElement tree flips to a component, the element and its raw children are adopted in place (recursively) into the blocks representation — sibling host nodes keep their identity, focus, and input state, matching React. (5) Controlled checkables (`checked={…}` + native `onInput`/`onChange`) work now: the controlled-state restore no longer runs at the end of the CLICK dispatch (the platform fires `input`/`change` AFTER click, so native handlers read a reverted `checked` and the toggle was unusable); the follow-up input/change arms the restore instead, and rejected toggles still snap back. (6) Mixed fragment children in the de-opt list path (`<>{items.map(...)}<button/></>`) now key nested-array leaves WITHIN their top-level slot (compound keys, like React's implicit-key scoping) — a nested list growing or shrinking no longer shifts a sibling's implicit key and remounts it.
- 388b23c: Value-position JSX fragments (`return <>…</>` in `.tsx` bodies — and every MDX document root compiled through `@octanejs/mdx`) no longer trip the de-opt missing-key warning. The compiler now lowers a fragment's children through the new `positionalChildren([...])` tier-2 runtime export, marking the array as FIXED siblings (React's "static children" — `jsxs` — which React never key-warns) so the de-opt list keys it by index silently. This also covers interleaved text items (MDX's `"\n"` separators), which can never carry a key. Runtime-built arrays (unkeyed `.map()` results, arrays through props) keep the warning.
- 352cff1: `<ViewTransition>` (experimental, React-parity core): transition-lane commits
  that touch a boundary now run inside `document.startViewTransition` — enter
  (subtree inserted), exit (subtree removed), and update (inner mutation /
  size change) activations with auto view-transition-name assignment and
  `onEnter`/`onExit`/`onUpdate` callbacks. Falls back to a plain synchronous
  commit when the browser has no View Transitions support; `flushSync` and
  urgent updates skip the animation (React's rule). Also exported as
  `unstable_ViewTransition` so React-experimental imports port unchanged.
  Shared-element `share`/`name` pairing, `addTransitionType`, Suspense-reveal
  integration, and SSR annotations land in later phases
  (docs/view-transitions-plan.md).
- c7989eb: View Transitions phase 2: shared-element transitions + transition types + the
  full callback contract. Same-named boundaries deleted/inserted in one
  transition-lane commit now pair as a shared-element transition (`onShare`
  fires on the exiting side, suppressing its `onExit` and the entering side's
  `onEnter`; pairs decay to separate exit/enter when either side is outside the
  viewport). New `addTransitionType` (+`unstable_addTransitionType`) tags the
  current transition batch — the types array reaches every on\* callback, and
  `enter`/`exit`/`update`/`share`/`default` class props now resolve strings,
  `'auto'`, `'none'` (deactivates the boundary), or per-type maps
  (`{ 'nav-back': 'slide-right', default: 'auto' }`), applied as
  `view-transition-class` alongside the name. Callbacks now receive
  `(instance, types)` where the instance carries `.animate()`-capable handles
  for the boundary's `old`/`new`/`group`/`imagePair` pseudo-elements, and a
  returned cleanup runs before the boundary's next activation.
- dda2854: View Transitions phase 3: Suspense integration + scheduling depth. Suspense
  reveal commits (fallback → content, standalone or the entangled held-
  transition batch) now route through the view-transition controller — a
  boundary wrapping the Suspense update-activates on the swap, and boundaries
  inside the revealed content enter. Nested boundaries inserted/removed as ONE
  unit fire only the outermost enter/exit (React's rule; nested stay silent).
  `render()` called inside a transition no longer commits synchronously — it
  schedules at transition priority, so boundaries mounting with the initial
  content enter-animate (e.g. a Suspense fallback appearing under a
  `<ViewTransition>`). Passive effects scheduled during an animation now wait
  for the transition's `finished` (React's ordering); update detection also
  catches element replacement (identity, not just count).
- dda2854: View Transitions phase 4: parent enter/exit relays (React's
  `enableViewTransitionParentEnterExit` — on in the experimental channel where
  ViewTransition ships). New boundary props `parentEnter`/`parentExit` (class
  values, per-type maps supported) + `onParentEnter`/`onParentExit` callbacks: a
  nested boundary inside a subtree that entered/exited as one unit now activates
  its parent relay when every strict intermediate boundary also relays (declares
  the relay prop or handler and doesn't resolve `'none'`) and the unit's
  outermost boundary genuinely enters/exits — not `'none'`, not consumed by a
  shared-element pair. Plain DOM between boundaries never breaks the chain;
  handler-only boundaries participate; a `'none'` relay class stops the chain
  below it. All 25 in-scope ReactDOMViewTransition tests are now ported and
  passing.
- 3a9d855: View Transitions phase 5 (final): Fizz-parity SSR annotations. Server renders
  now stamp resolved `vt-*` attributes on each `<ViewTransition>` boundary's
  first element — `vt-update` always (per-type maps resolve to their `default`;
  SSR has no transition types), `vt-name` + `vt-share` for explicitly named
  boundaries and for boundaries wrapping a Suspense boundary (auto names derive
  from the stable frame path, so every streaming pass mints the same name and
  the fallback/content captures pair across the swap), and `vt-enter`/`vt-exit`
  on boundaries at the top of a Suspense content/fallback arm (both can apply).
  Streamed segment chunks carry the wrapping boundary's name onto the revealed
  content. Hydration adopts the annotations untouched. All 4
  ReactDOMFizzViewTransition tests are ported and passing — the View
  Transitions plan is complete (see docs/view-transitions.md for the user-facing
  guide).
- 1f85217: A lone pure-host descriptor at a value position (e.g. `createElement('div')` returned from a pass-through component or rendered at a root) now mounts ANCHORLESS — no comment markers, the element self-delimits, mirroring the singleRoot component regime. `container.firstChild` is the element itself (React/RTL parity) instead of a comment anchor. A later render that flips the slot's value to another mode (text, null, array, component, portal) promotes the slot to the marked regime in place.

## 0.1.3

### Patch Changes

- 71b5167: Attribute-write fixes surfaced by the Tier-3 React DOM attribute-matrix port:

  - **Enumerated attributes stringify their boolean form**: `spellCheck={false}` / `contentEditable={false}` / `draggable={false}` now write `"false"` instead of removing the attribute — an absent enumerated attribute means "inherit / UA default", a genuinely different platform state (e.g. `contentEditable={false}` used to silently flip back to inherited editability).
  - **Empty `src`/`href` are stripped** (React parity, dev + prod): an empty-string URL resolves to the current page, so browsers would re-fetch the whole document as an image/script/stylesheet. `<a href="">`/`<area href="">` keep it (a legitimate self-link).
  - **Function and symbol attribute values are removed** instead of stringified — a function's source text can never leak into the DOM.
  - **`className={null}` removes the `class` attribute** (React parity); an empty string still writes `class=""` — the raw-value distinction is checked before clsx composition erases it.
  - **SSR style values are trimmed** (`{left: '16 '}` → `left:16`), matching what the client CSSOM produces on parse — removes a server/client byte divergence.

  Documented intentional divergences (native pass-through, no known-attribute table): `unknown={true}` writes boolean presence (`""`) rather than being stripped; `inert=""` stays present (platform: presence = true; React coerces to false); truthy strings on boolean attributes stay verbatim (`disabled="disabled"` — functionally identical state); throwing-valueOf objects render their `toString()` instead of throwing. React-19 custom-element semantics (lowercase `on*` listeners, property-vs-attribute heuristics) remain an open, pinned gap.

- 7b2acbd: `useDeferredValue` React-parity fixes (closes the five gaps pinned from
  ReactDeferredValue-test.js) via a "deferred lane" bit on the scheduler:

  - **Render-phase updates inherit the in-progress render's priority**: a
    setState fired while the same component's body is rendering replays at the
    current pass's priority (and deferred bit) instead of always urgent — so a
    transition render that syncs state from props no longer makes
    `useDeferredValue` defer in the replay (both values commit in one pass).
  - **Only the first `useDeferredValue` level defers**: the spawned deferred
    swap tags its re-render pass as deferred (`Block.currentRenderDeferred`); a
    `useDeferredValue(value, initialValue)` MOUNTING inside that pass adopts the
    final value directly instead of waterfalling its own preview — the outer
    preview already covered the loading state (React's anti-waterfall rule).
  - **Hidden `<Activity>` trees behave like fresh mounts for the hook**: a value
    change while hidden re-renders the NEW preview state (prerender keeps up);
    revealing hidden→visible with a different value shows the preview first
    (with `initialValue`) or adopts the new value immediately (without) — the
    hidden tree's committed value never flashes on reveal. Revealing with an
    identical value still skips the preview (prerender payoff, unchanged).

- a000fa2: Host-element ref lifecycle now matches React's commit phasing across all paths.

  - De-opt host refs (object and callback `ref`s on `createElement`/value-position
    JSX) are detached when their subtree is torn down: keyed-list item removal,
    full list clears (including the `batchClearItems` fast path), wholesale scope
    unmount of a pure `hostNode` or `hostElementBody` element, and mode-switch
    rebuilds. Previously `ref.current` kept pointing at the removed DOM node and
    callback refs never received their `null`/cleanup call.
  - All ref detaches — teardown and identity swaps, compiled templates, spreads,
    fragment refs, and the de-opt paths alike — are deferred to commit and drain
    before that commit's ref attaches (React's mutation→layout phasing). A ref
    hopping between elements in one render no longer ends `null` when a later
    binding's detach ran after an earlier binding's attach, and a state setter
    used as a ref settles on the replacement element instead of oscillating.
  - `useImperativeHandle` honors a callback ref's React-19 cleanup return: detach
    runs the returned cleanup instead of re-invoking the ref with `null`.

- 71b5167: Hardening + parity fixes surfaced by the ReactDOMComponent conformance port:

  - **SSR tag-name validation** (security): a dynamic de-opt tag like `createElement('div><img onerror=…>')` was concatenated verbatim into the server response — it now throws `Invalid tag` like React. (The client was already guarded by `document.createElement` itself.)
  - **Client attribute writes are guarded**: an injection-shaped attribute name arriving through a spread used to crash the whole render with `InvalidCharacterError`; it is now reported and skipped, mirroring the SSR serializer's `VALID_ATTR_NAME` rejection.
  - **`dangerouslySetInnerHTML` validation** (React parity): a malformed value (not `{__html}`) and combining it with `children` now throw instead of silently rendering; `__html: false` renders `'false'` consistently on both the compiled and spread paths.
  - **`<link onLoad>`/`onError` now fire**: hoisted head elements live outside every delegation root, so the compiler now passes `on*` props through and `headBlock` attaches them as direct listeners (SSR skips them).
  - **iOS Safari tap delivery**: delegation roots (createRoot containers + portal targets) get a noop `onclick` property so the whole subtree is tappable — the root-delegation equivalent of React's per-element stamping.
  - **Boolean style values clear the property** (`fontFamily: true` no longer sets the literal string `"true"`), client + SSR.
  - **`suppressContentEditableWarning` never lands in the DOM.**

  Documented intentional divergences: no `possibleStandardNames` alias table (attribute names are written as authored — use native spellings like `accept-charset={…}`, valid in TSRX and React alike), and `muted` stays a plain attribute per the no-controlled-properties policy (the live `.muted` property belongs to the platform). Still pinned: void-element children/dSIH validation (compile-time diagnostic planned) and React-19 custom-element semantics.

- 735f5ca: Keyed `@for` reorders no longer re-render survivors whose only change is position.

  When a `@for` header binds no `index` name, its body cannot observe an item's
  position, so a pure reorder (same item reference, moved to a new index) does not
  need to re-render the survivor — only its DOM moves. The compiler now marks such
  loops index-independent (a new `forBlock` flag), and the reconciler's pure
  short-circuit skips the body for a moved survivor instead of calling `renderBlock`.
  Previously every moved survivor re-rendered even though its output was identical.

  Measured on a 1000-row keyed table: displace-k −46–48%, rotate/remove-first
  −21–33%, reverse/shuffle a few percent (there the DOM moves dominate). An `@for`
  that binds an `index` still re-renders on reorder so the index value stays correct
  (conservative: the optimization applies only when the header provably binds no
  index).

- 634c4b4: Compiler-emitted runtime helpers can no longer be shadowed by user bindings. Generated code used to import and call helpers by their bare names (`setText`, `htext`, `clone`, `template`, …), so a user binding with the same name inside a component silently hijacked the generated call — `const [text, setText] = useState('')` (React's most common naming for text state) broke the text-hole update and stored a DOM Text node in state, and a module-level `const template = …` was a duplicate-declaration SyntaxError against the prelude import. The compiler now imports every generated-code helper under a collision-proof alias (`import { setText as _$setText } from 'octane'`) and references it as `_$setText(…)`, on both the client and server (`octane/server`) codegen paths — covering all emitted helpers (text/attr/style/class/spread setters, block helpers, refs, `createElement`, `withSlot`, `normalizeClass`, HMR wiring, and the `ssr*` family). Names the user's own code references — their preserved `octane` import specifiers (including `x as y` renames, which previously lost the alias) and slotted base-hook call sites — stay un-aliased.
- 1987d47: Implement React's implicit same-element bailout, and fix a context-propagation bug the work surfaced:

  - **Implicit bailout (React beginWork's `oldProps === newProps` skip):** re-rendering a parent that passes an identical (reference-equal) element to a value position (provider children, `.ts` binding trees, `return children` passthroughs, cached array items) now skips that child's body outright, while consumers of a changed context inside the bailed subtree still refresh via lazy per-context propagation. Value-position component blocks are armed as context-stamping targets (like `memo()` blocks) so the bail is always sound; compiled template positions re-create props per render and pay nothing. `@octanejs/radix`'s NavigationMenu no longer needs its `MemoChildren` memo() shim or its shallow-equal registration convergence bail — both were workarounds for this exact gap and are now deleted.
  - **Bugfix — bailed subtrees no longer strand context consumers:** a memo boundary's re-render (own props changed) interleaved with an inner memo bail used to erase the outer boundary's recorded context dependencies (its `$$ctxReads` cleared, the bailed inner subtree never re-stamping them), so a LATER context change could bail straight past the consumer and leave it on a stale value. Bails now re-stamp the bailed block's surviving context deps onto memo/armed ancestors.

- fda2200: Compiler: fix reversed child order when a component root precedes a static host root
  in a multi-root fragment body.

  A component authored as `<><Comp/><input/></>` (or whose children are threaded through
  `createElement` as a compiled children fragment — e.g. a headless UI binding that renders
  `createElement('fieldset', { children })`) dropped the component root's source-order `<!>`
  anchor. The static template content drained into the parent first and the component was
  appended at `endMarker` AFTER it, so `<Comp/>` before `<input/>` rendered as
  `<input/>` then `<Comp/>`. The fix emits the `<!>` anchor for a component root in a mixed
  body, mirroring the in-element mixed-children path and the control-flow root path — so the
  component mounts at its source position. The server already emitted source order, so this
  also removes a client/server divergence that could mis-adopt on hydration.

- 71b5167: Native event delegation fixes (surfaced by the Tier-3 React event-matrix port — 212 conformance tests, all passing):

  - **Non-bubbling native events now reach their target's handler.** The media/resource lifecycle family (`play`, `pause`, `timeupdate`, `load`, `error`, `loadstart`, …), `toggle`/`beforetoggle`, `close`/`cancel`, `abort`, and `resize` were delegated with a bubble-phase root listener that never hears a non-bubbling event — so `onPlay` on the `<video>` itself silently never fired. They are now capture-delegated with target-only delivery: the target's own handler fires, ancestors' do not — exactly the platform contract. (React's synthetic layer re-dispatches these up the tree; octane deliberately does not — documented intentional divergence.)
  - **Capture handlers now fire before bubble/target handlers for capture-delegated types** (`focus`, `blur`, `invalid`, `scroll`, `scrollend`, and the new family). Both dispatchers are capture-phase listeners on the same root, so same-node registration order used to invert React/platform ordering (bubble walk before capture pass). The walk dispatcher now runs the capture pass explicitly first and honors a capture-phase `stopPropagation`.
  - **A throwing or invalid listener no longer aborts the dispatch walk.** Each handler invocation is guarded like a separate native listener: exceptions surface through the global error event (`reportError`, with the standard polyfill fallback) and the walk continues to ancestors; a non-function listener value is reported and skipped instead of crashing dispatch.

- fda2200: Add three React parity APIs, closing the "missing API" gaps short of streaming SSR:

  - `lazy(load)` — code-splitting. Suspends into the nearest `@try`/`<Suspense>` until the module promise settles, then tail-calls the loaded component (hooks, context, and props flow as if statically imported); a rejected load routes to `@catch`. Works on the server too: `renderToString` emits the pending fallback, `prerender` awaits the module. Accepts `{ default: Component }` or a bare component function.
  - `requestFormReset(form)` — React DOM parity. Inside a transition/action the reset is deferred until the action window settles (the manual companion to the automatic reset of plain `<form action={fn}>`); outside one it warns and resets immediately.
  - `useDebugValue()` — no-op (octane has no devtools inspector), so custom hooks ported from React run unchanged.

  All three are exported from `octane` and mirrored in `octane/server`. (`createRef` stays out: it exists for class components, which octane does not support.)

- 3431ec3: React parity: an unguarded render-phase state update (a `setState` called
  unconditionally during render) now throws `Too many re-renders. Octane limits the
number of renders to prevent an infinite loop.` after 25 same-block re-renders in one
  drain, instead of hanging the flush forever. The error routes through `@try` /
  `ErrorBoundary` like any render error. Guarded derived-state patterns (mirror a prop,
  converge in a few passes) are unaffected and now pinned by conformance tests.
- 3afe217: Resource hints land (React DOM parity): `preload`, `preinit`, `preconnect`, and `prefetchDNS`, exported from `octane` and mirrored in `octane/server`. Client calls insert deduped `<link>`/async-`<script>` tags into `document.head`; server calls collect into the render's head output (flushed with the streaming shell). A shared `data-oct-hint` dedupe key means a hydrating client call for an SSR-emitted resource is a no-op.
- 1a1f1db: Multiple unhandled root errors in one flush now aggregate (React parity): when several roots throw during a single synchronous flush and no boundary handles them, the flush rethrows an `AggregateError` carrying every error instead of silently keeping only the first. A single unhandled error still rethrows as-is; failed roots still unmount and the rest of the queue still commits. Also: SSR spread attributes now skip function/symbol values and `suppressContentEditableWarning` (mirroring the client's setAttribute policy).
- 3431ec3: SSR: the buffered renderers (`renderToString`/`renderToStaticMarkup` in
  `octane/server`, `prerender` in `octane/static`) gain a `RenderOptions` argument:
  `nonce` (CSP nonce stamped on the emitted inline `<style>` tags and the suspense seed
  script — all renderers), plus `signal` (AbortSignal that rejects a suspended render
  when the request dies) and `timeoutMs` (per-render override of the suspense settle
  deadline) on the async `prerender`. `octane/server` now documents which exports are
  the compiler's private ABI and exports the `executeServerFunction` RPC executor the
  vite plugin's dev RPC handler loads via `ssrLoadModule('octane/server')` (previously a
  missing export, so any `module server` call crashed). Wire format is devalue, matching
  `@ripple-ts/adapter`'s client stub: devalue-encoded argument array in, devalue-encoded
  `{ value }` envelope out. See the new `docs/ssr.md` for the full SSR guide and the
  current gaps (streaming, selective hydration, production server build).
- 5e3858f: SSR serialization + hydration React-parity fixes (Tier-4 conformance):

  - Adjacent dynamic text holes serialize with a `<!-- -->` separator so the parser can't merge them; the hydration walk adopts each hole's node (previously the second hole's content was lost, and adjacent empty holes crashed hydration). Empty static text literals no longer desync template child paths.
  - Multi-root fragment bodies hydrate through a virtual wrapper: root fragments with component members adopt cleanly (previously the cursor desynced and content was detached/re-appended), and the mount drain is a hydration no-op (`drainFrag`).
  - Nested-array children flatten one item per leaf in the de-opt list (React fragment semantics) — previously a nested array member rendered as nothing on the client and desynced hydration; component-bearing items now borrow their adopted item range.
  - `ssrAttr` mirrors React's value-type filters where the functional outcome flips — and the client `setAttribute` applies the same rules (shared tables in constants.ts) so hydration agrees with the serialized markup: positive-numeric drop (`size={0}`), empty `src`/`href` strip (except `<a>`/`<area>`), function/symbol drop, `data-*` boolean stringify, boolean drop on string props (`href={true}`), unknown lowercase `on*` drop, `htmlFor` kept verbatim on custom elements, and `suppressContentEditableWarning` never serializes. Boolean-prop truthiness (`hidden={0}`, `inert=""`) deliberately stays native-as-written on both sides (adjudicated divergence).
  - `<pre>`/`<textarea>`/`<listing>` protect a leading newline (the parser eats it) by emitting an extra `\n`.
  - A plain-object child throws ("Objects are not valid as a child") instead of serializing `[object Object]`.
  - Parser CR/CRLF→LF normalization no longer reports a spurious hydration text mismatch.

- d2afbbb: Streaming SSR: `renderToPipeableStream` (Node streams) and `renderToReadableStream` (web streams) land in `octane/server` — React `react-dom/server` parity with out-of-order Suspense streaming.

  - **Shell first**: one synchronous pass flushes immediately — scoped styles, hoisted head, the body with each still-pending `@try`/`<Suspense>` boundary rendering its fallback behind a `<template data-oct-b="N">` sentinel, the shell's `use()` seeds, and a ~600-byte inline swap runtime. `onShellReady` fires at flush.
  - **Out-of-order completion**: as each boundary's data settles, the stream appends a hidden segment (`<div hidden data-oct-s="N">`) holding the real content plus that boundary's own `use()` seed JSON, followed by `$OCTRC("N")` — which swaps the content into the boundary's live range, stashes the seeds on `window.$OCTS`, and leaves a `<!--oct-seed:N-->` scoping comment. Nested boundaries stream parent-first; a rejected promise streams the `@catch` arm through the same path. `onAllReady` fires when the last boundary lands; `abort()`/`signal` mark still-pending boundaries errored (`$OCTRX`) so hydration client-renders them.
  - **Hydration**: the client's `mountTry` recognizes the seed-scope comment and scopes that boundary's seeds to its subtree during adoption — a streamed page hydrates byte-for-byte with no re-suspend, no rebuild, and no mismatch warnings, verified end-to-end (stream → swap-runtime execution → `hydrateRoot`).
  - Built on the same pass/cache engine as `prerender`: each settle round re-renders against the warmed cache and flushes newly-completed boundaries (plus any late scoped styles). The compiled `@try` emit now routes through a runtime `ssrTry` helper (byte-identical output for buffered renders), and the JSX `<Suspense>` builtin streams too.

  Documented divergences from React Fizz: no selective hydration (octane has no synthetic event replay), per-round re-passes rather than per-boundary incremental renders, and head elements hoisted from inside a streamed boundary are re-created client-side on hydration rather than shipped mid-stream.

- 1987d47: Two hide/reveal fidelity fixes (React Offscreen parity):

  - **Insertion effects stay connected while hidden** (per `Activity-test.js:1428`): hiding an `<Activity>` (or a suspended boundary) no longer runs `useInsertionEffect` cleanups, revealing no longer re-fires them, and a deps-changed update while hidden still cycles them — insertion effects own injected styles that must persist while a tree is merely hidden; only a real unmount tears them down. Each effect slot now records its phase so the hide machinery can single insertion effects out.
  - **Closure-attached refs now cycle across a suspend** (per `ReactSuspenseEffectsSemantics-test.js:2877`): refs inside a spread object, `<Fragment ref>` instances, and refs on value-position pure-host descriptors (the de-opt path, nested elements included) are now detached when a boundary suspends and re-attached on reveal, matching the compiled template host-ref behavior. Previously these three flavors kept pointing at hidden DOM.

- eb48930: Error-handling fixes surfaced by the Tier-7 React error-boundary port (React 19 parity):

  - **Deletion-phase errors reach boundaries**: an error thrown by an unmount cleanup used to be swallowed with `console.error`; it is now collected during the teardown walk and dispatched to the boundary enclosing the deletion after the walk completes (a boundary inside the deleted range is itself dying and is skipped), so the enclosing `@try` shows its `@catch` like React's `commitDeletionEffects` error routing.
  - **Throwing ref detaches route to the boundary too**: a callback ref that throws on its `null` detach no longer escapes `flushSync` to the caller — the queued detach is guarded, the remaining detaches/attaches still run, and the error reaches the nearest still-mounted boundary.
  - **Refs of aborted mounts are never invoked**: when a boundary unwinds a mount that never completed, the queued ref detach is suppressed — React never calls a ref (not even with `null`) for work that never committed. A previously-attached ref still detaches normally on real unmounts.
  - **Uncaught errors unmount the whole tree**: when no boundary handles an error, the failed root's entire tree is removed from the DOM before the error is rethrown from the flush (React's documented contract — known-broken UI never stays on screen). Unrelated roots batched into the same flush keep draining.

  The port also stress-verified the LIS keyed reconciler under mid-reconcile throws (40 seeded shuffle streams of 101 keyed rows, byte-equal against from-scratch baselines) — no inconsistency found.

- 3431ec3: React parity: `useReducer` dispatch no longer eagerly bails out on `Object.is`-equal
  state. Unlike `useState`'s setter (which keeps its eager fast path, matching React's
  `dispatchSetState`), a dispatch whose reducer returns the same state still re-renders
  the component once, matching `ReactHooksWithNoopRenderer-test.js` ("useReducer does not
  eagerly bail out of state updates").
- 87c5bc3: Children and `dangerouslySetInnerHTML` on void elements (`<input>`, `<br>`, `<img>`, …) are now rejected instead of failing silently (React parity — React throws "`input` is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`"):

  - **Compile-time diagnostic** (client, server, and value-position `createElement` lowering): `<input>{'kid'}</input>` and `<input dangerouslySetInnerHTML={…}/>` now fail the compile with a source-located error. Previously the template parser silently dropped the children out of the emitted `<input>…</input>` markup, and the `htmlOnlyChild` fast path wrote invisible `input.innerHTML`.
  - **Runtime throw** on the routes the compiler can't see: a spread (`<input {...props}/>`) or de-opt (`createElement('input', {dangerouslySetInnerHTML})`) descriptor carrying `dangerouslySetInnerHTML` onto a void host now throws from `setAttribute`'s danger arm.

## 0.1.2

### Patch Changes

- c19f1aa: React parity: `aria-*` attributes are now treated as ENUMERATED, not boolean.

  `aria-expanded={false}` now renders `aria-expanded="false"` (was: attribute removed) and
  `aria-expanded={true}` renders `aria-expanded="true"` (was: `aria-expanded=""`), matching
  React — only `null`/`undefined` removes an `aria-*` attribute. Applied consistently on the
  client (`setAttribute`, and therefore the de-opt/spread paths) and in SSR (`ssrAttr`), so
  server and client agree and accessibility state serialises correctly.

- 6983478: React parity: static `aria-*` boolean literals bake as enumerated "true"/"false".

  The compile-time static-literal attribute fast paths (client template HTML and
  SSR) bypassed the `aria-*` enumeration the runtime `setAttribute`/`ssrAttr`
  already implement: a static `aria-hidden={false}` was dropped entirely and
  `aria-expanded={true}` baked a bare attribute. Both fast paths now special-case
  `aria-*` boolean literals — `false` renders `aria-x="false"` and `true` renders
  `aria-x="true"`, matching React and the dynamic-value path, so accessibility
  state serialises correctly regardless of whether the value is static or dynamic.

- 6983478: Callback-ref cleanups are now paired per (ref, element), matching React 19.

  React stores a callback ref's returned cleanup per attach site. Octane kept one
  cleanup per ref FUNCTION, so the common list pattern — the same `ref={registerItem}`
  on every row — overwrote earlier cleanups: removing row 1 ran row 2's cleanup and
  row 2's later detach fell back to `ref(null)`. `attachRef` now keys cleanups by
  (ref, attached element/fragment) and every detach site (runtime and compiled output)
  passes the element it is releasing, so exactly the right cleanup runs.

- 169c7c6: Fix children passed from a `.tsrx` parent through a `.ts` component that forwards them
  onto a host element via `createElement` (e.g. a binding component like
  `@octanejs/floating-ui`'s `FloatingOverlay` doing `createElement('div', { children })`).

  Two issues are addressed:

  - `descNeedsBlocks` now treats a render-FUNCTION child as needing a Block. The `.tsrx`
    lowering of `<Host>{children}</Host>` passes `props.children` as a component body (not a
    descriptor); previously such a child reached the raw de-opt reconciler and rendered as
    nothing.
  - `childSlot` now reconciles a bare render-function child by SLOT (swapping the block body
    in place) instead of by identity. A `.tsrx` children body is re-created every render, so
    identity-based reconciliation re-mounted the child on every parent render — losing its
    state and, once effects re-rendered the tree, looping unboundedly.

  `.tsx` callers (which pass descriptor children) were unaffected; this fixes the `.tsrx`
  → `.ts`-component children path.

- 86ae0c5: Add React-compatible `cloneElement`, `Children`, and `isValidElement` to the public API.

  These operate on octane's element descriptors (`createElement` / JSX-at-value) and children
  values, mirroring React's semantics so libraries that inspect or re-project children — a
  Radix-style `Slot`/`asChild`, `Children.only`, `Children.map`, etc. — port unchanged.

  - `cloneElement(element, config?, ...children)` — shallow-merges props (config wins),
    overrides `key`, and replaces children when passed (else keeps the original). `ref` merges
    as a normal prop (octane is ref-as-prop).
  - `Children.map` / `forEach` / `count` / `toArray` / `only` — flatten nested arrays and treat
    `null`/`undefined`/booleans as empty (visited as `null`; dropped from `toArray`/`map`
    results), matching React's traversal.
  - `isValidElement(value)` — true for `createElement` / JSX descriptors.

  Verified byte-for-byte against React via the differential rig (the same fixture runs through
  octane and `@tsrx/react`, where these imports resolve to React's own implementations).

- 357f841: Add clsx-style `class` / `className` composition to the runtime.

  `class` and `className` now accept strings, numbers, arrays, objects, and any nesting
  of those — composed the same way the `clsx` / `classnames` packages do (falsy parts
  drop out; object keys are kept when truthy). For example
  `class={['btn', props.size, { active: isActive }, props.extra]}` renders `"btn lg active"`.

  - Native, dependency-free: a new `normalizeClass` helper (exported from `octane` and
    `octane/server`) inlines the algorithm and fast-paths plain strings (~3× faster than
    the `clsx` package on the common `class={someString}` path), with byte-identical output.
  - Applied at every class site: dynamic bindings, `{...spread}` props, SVG elements
    (via `setClassAttr`, which still removes the attribute on a nullish value), and
    scoped-`<style>` components — where a compiler pre-pass normalizes the value _before_
    the scope hash is appended, so array/object classes compose correctly alongside the
    hash (and a nullish class no longer emits the literal `"undefined <hash>"`).
  - SSR (`ssrAttr`) composes identically, so a server-rendered composed class hydrates
    without a mismatch.

  This is an intentional divergence from React, which coerces `className={['a','b']}` to
  the string `"a,b"`; Octane yields `"a b"`.

- 6675ac7: Compiler: emit smaller mount code for two common shapes.

  - **No binding bag for control-flow-only bodies.** A component/branch body whose
    output is purely control flow or component slots (no static HTML — e.g. the
    recursive `Node` in a deep tree, an `@if` wrapper, a Provider/portal body) no
    longer allocates a per-render binding-bag object or commits it to `slots[0]`.
    Its hosts are `__block.parentNode` (recomputable every render) and its anchors
    `__block.endMarker`, so the `let _b … if (_b === undefined) { _b = {}; … } else {}`
    scaffold is dropped entirely and slots start at index 0. This removes one object
    allocation per such block instance (meaningful for control-flow-heavy trees) and
    shrinks the compiled output (~24% smaller for the recursive-context benchmark's
    component).
  - **Shared DOM-navigation prefixes.** Template element references are now walked
    incrementally from the nearest already-materialized ancestor instead of
    re-walking the whole path from the cloned root for every hole. Siblings that
    share a deep prefix (e.g. a row of buttons) reuse the prefix's navigation var
    rather than repeating `child(child(child(_root)))` per element — fewer
    `child`/`sibling` calls at mount and less repeated code.

  Compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build
  output). No public component-API or behavior change.

- f414710: Performance: faster context reads and text updates.

  - `use(Context)` now caches the resolved provider per consumer, so repeat reads are an O(1) live-value lookup instead of an O(depth) walk up the scope/block tree. Removing the per-read walk also keeps the shared property inline-caches monomorphic, which speeds up the surrounding render path. On a deep-tree context-fan-out benchmark (1024 consumers re-reading a root context) this cut the full-tree update from ~3.0ms to ~1.6ms.
  - `setText` no longer reads `node.data` back before writing. The compiler already guards every text-binding update with a previous-value check, so the read only re-confirmed a known change while materializing a throwaway string from the DOM each call — pure CPU and GC overhead on text-heavy updates.

  No API or behavior changes.

- 894d51c: `createElement` is now React-shaped around `key` and `props`. `key` is lifted OUT of
  the descriptor's `props` (it was previously left on it), and the caller-supplied props
  object is never mutated — positional children are folded into a fresh copy instead of
  being written onto the caller's object. The hot 2-arg `createElement(Comp, props)` path
  (no key, no positional children) stays allocation-free and passes props through.
- f44fb6b: Widen `createPortal`'s `body` type to accept any renderable (an `ElementDescriptor`, host
  element, array, or text) — the runtime has always normalized these (`normalizePortalBody`);
  only the TypeScript signature required a `ComponentBody`. No behavior change.
- 056c441: Custom hooks now work across module boundaries, in plain `.ts`/`.js` and in `.tsx`. A custom hook (any `use[A-Z]` function) defined in a plain `.ts`/`.js` file gets its base octane hooks slotted by a new lightweight, surgical Vite-plugin pass that edits ONLY the hook call sites and leaves every other byte — including TypeScript the full compiler can't print (index signatures, generic type aliases) — verbatim; the `.tsrx`/`.tsx` caller still wraps the call in `withSlot`, so reuse and nested composition keep independent state across the boundary. `.tsx` (TS + JSX) files now go through the full compiler alongside `.tsrx`, so components and hooks authored in `.tsx` work too. The pass only runs on files importing a hook from `octane`, skips `node_modules` (published bindings ship pre-slotted), and honors a `// octane-no-slot` opt-out plus the plugin's new `exclude` option for hand-written slot-forwarding bindings in a monorepo.
- aa9cc6e: Compiler: support custom hooks and library bindings.

  The compiler now injects a per-call-site slot symbol for any call matching React's
  `use[A-Z]` hook convention — not just the built-in hooks — and passes it as the
  trailing argument. A custom hook is therefore a plain wrapper that **forwards** that
  slot to the base hook it composes (every base hook already accepts an optional trailing
  slot). Because the slot is per-call-site, two calls to the same custom hook in one
  component — `useFoo(a)` and `useFoo(b)` — stay independent, exactly like in React.

  Nested hook calls now resolve too: a hook used as an **argument** to another hook (e.g.
  `useStore(api, useShallow(sel))`, or a hook in a deps array) gets its own slot. Before,
  `rewriteHookCalls` appended the outer slot but did not recurse into the call's arguments,
  so the inner hook was left without one.

  This is what lets hook-based libraries be bound to octane by reimplementing only their
  thin React binding on octane's base hooks (see the new `@octanejs/zustand`).

- 0f57f20: Adopt React's `dangerouslySetInnerHTML={{ __html: … }}` for raw HTML, and stop
  special-casing the `innerHTML` attribute.

  Raw HTML is now set the React way: `<div dangerouslySetInnerHTML={{ __html: markup }} />`.
  The compiler extracts `__html` and uses the existing innerHTML-assignment fast
  path (markerless, only-child) on both the client and the server (SSR emits the raw
  content). Spreads are handled on both sides too — `<div {...props} dangerouslySetInnerHTML={{ __html }} />`
  and a spread that itself carries `dangerouslySetInnerHTML` (the client reads
  `.__html` via the spread/property path; SSR binds each spread once and renders its
  `__html` as the element's content, last-source-wins).

  **Breaking:** the bare `innerHTML={expr}` attribute is no longer treated as raw
  HTML — like React, it's now just an ordinary (inert) attribute. Replace
  `innerHTML={markup}` with `dangerouslySetInnerHTML={{ __html: markup }}`. (The
  `.tsrx` `{html expr}` child directive is unaffected.)

- f44fb6b: React parity: `event.currentTarget` during delegated dispatch is now the element whose
  handler is firing.

  octane delegates events at the root, so the native `currentTarget` was the delegation
  root — while React's synthetic system guarantees each handler sees its OWN element. Ported
  React code leans on this constantly (`event.target === event.currentTarget` self-origin
  guards, `currentTarget`-relative measurement, `indexOf(event.currentTarget)` in list
  navigation — e.g. Radix's RovingFocusGroup). Both the bubble and capture walks now shadow
  `currentTarget` per-handler (a configurable own property) and restore native semantics
  after the dispatch completes.

- 067efa3: `dangerouslySetInnerHTML` now works on the de-opt host path (`createElement`-built elements).

  `createElement('style', { dangerouslySetInnerHTML: { __html } })` (and any other
  element built through the runtime de-opt path rather than compiled JSX) rendered
  empty: props application correctly wrote `el.innerHTML`, but the unconditional child
  reconciliation that followed ran with (empty) `children` and wiped it. Per the React
  contract the two are mutually exclusive — when `dangerouslySetInnerHTML` is present
  the raw HTML owns the element's content, and the de-opt paths (`hostElementBody`,
  including both hydration branches, and the value-position host reconciler) now skip
  child processing entirely. SSR already implemented raw-HTML-wins; this aligns the
  client. Surfaced by Radix ScrollArea's injected `<style>` viewport rules.

- f0c6c4d: Fix de-opt host descriptor refs (`{cond ? <div ref={r}/> : null}` and other value-position
  host JSX) not being detached when the node is removed or its ref changes, leaving `ref.current`
  (or a callback ref) pointing at a node no longer in the DOM.

  `patchDeoptProps` now detaches the previous ref when it is removed or its identity changes (it
  previously relied on `removeDeoptProp`, which intentionally no-ops `ref`), and the de-opt
  removal paths (`clearChildContent` and the list/replace reconcilers) now detach a removed host
  node's ref before dropping it.

- dd24fd5: An unkeyed `{cond ? <Comp/> : null}` in a de-opt children array now unmounts cleanly.

  `deoptItemBody` assumed one item scope "either always holds Blocks or never does" —
  but an unkeyed conditional sits at a stable index key and flips between the Blocks
  path (component) and the pure path (null/text/host). The pure path never tore down
  the Blocks residue: the toggled-off component's DOM and live effects stayed in the
  item range forever. Each path now tears down the other's residue on a switch, firing
  unmount cleanups and clearing DOM (and the reverse pure→component direction clears
  the stale raw node).

- 524939e: Style declarations dropped between renders are now removed on de-opt-patched elements.

  `patchDeoptProps` reused the fresh-element prop applier for `style`, which passes no
  previous value into `setStyle` — so a declaration present in one render's style
  object and absent from the next was never removed from the reused element (Radix
  Slider's thumb kept its pre-measurement `display: none` forever). The patch path
  now threads the real previous style so dropped keys are diffed away.

- e8ee0a8: The runtime de-opt reconciler now creates SVG elements in the correct namespace.
  Previously, an SVG subtree produced at a VALUE position — e.g. `createElement('svg',
…)` / `<svg>…</svg>` returned from a component, rather than a compiled static
  template — was built with `document.createElement`, yielding HTML-namespaced
  `HTMLUnknownElement`s (so `<svg>`/`<path>` didn't render and `clipPath` was
  lowercased to `clippath`).

  `reconcileDeoptNode`/`reconcileDeoptChildren` (and the component-bearing
  `hostElementBody`) now open the SVG namespace at `<svg>` and inherit it through the
  subtree, switching a `foreignObject`'s children back to HTML. Class assignment on the
  de-opt path is also SVG-safe (`setAttribute('class', …)` for SVG, whose `className`
  is a read-only `SVGAnimatedString`). The compiled template path is unchanged.

- b680431: Map JSX-compatible `onDoubleClick` handlers to the native `dblclick` DOM event in both compiled and spread/de-opt event paths, and expose positional `createElement` children on `props.children` for host descriptors as well as components.
- 524939e: Effect drains are now re-entrancy-safe (React parity).

  An effect body that synchronously dispatches a DISCRETE event (e.g. a hidden form
  "bubble input" dispatching `click`) triggers a synchronous flush from the event
  handler — which re-entered `drainPhase` over the same live queue, re-running
  entries the outer walk had already executed. When the re-run effect re-dispatched,
  the recursion was unbounded (a Radix Checkbox inside a `<form onChange>` exploded
  to hundreds of change events and a stack overflow). Each drain now takes ownership
  of its batch up-front (React nulls `rootWithPendingPassiveEffects` before running
  effects — same idea): a re-entrant call sees only effects enqueued during the
  drain, which it runs like React's nested passive flush.

- 7f8dbc0: Layout / insertion / passive effects now fire in React's exact **post-order** commit
  order — a node's descendants run before it, and disjoint subtrees run in tree order.
  Previously octane drained each effect phase by depth (deepest-first globally), which got
  the parent/child relationship right but mis-ordered a shallow node in an EARLIER sibling
  subtree against a deeper node in a LATER one (e.g. `<A/>` then `<Wrap><B/></Wrap>` fired
  B before A because B was deeper). Effects are now tagged with their enqueue sequence and
  drained descendant-before-ancestor via the block tree, falling back to enqueue (tree)
  order for siblings — matching React's commit walk. This matters for any parent effect
  that reads refs/measurements established by an earlier sibling subtree's effects.

  Deferred ref attaches now drain in the same post-order (they previously used the same
  depth sort), so callback/object refs attach child-first and in tree order, consistent
  with the effect phases that read them.

- a13acd1: Transitions now commit entangled Suspense boundaries together (React's atomic-commit
  contract). When a single `startTransition` causes several boundaries to suspend — sibling
  `@try` blocks, or several off-screen component/branch swaps — octane now holds the prior
  content of EVERY boundary until ALL their data is ready, then reveals them in one batch.
  Previously each boundary revealed the moment its own promise resolved, so a transition
  that fanned out to multiple regions could show a half-updated screen mid-transition (one
  region's new content next to another region's stale content).

  Implementation: a data-ready barrier in the runtime (`HELD_TRANSITIONS` / `STAGED_REVEALS`).
  A boundary holding prior content for an in-flight transition stages its reveal as its data
  resolves instead of committing immediately; when every held boundary in the transition is
  data-ready the whole group flushes in one commit. `isPending` stays true until that batch.
  Boundaries that leave the group abnormally (an urgent update superseding the transition, an
  error, or unmounting) are dropped so the rest aren't left waiting. Closes the
  "entangled-transition partial-commit" and "per-swap cross-boundary reveal" divergences.

- 067efa3: `onPointerEnter`/`onPointerLeave`/`onMouseEnter`/`onMouseLeave` now fire.

  The enter/leave event family doesn't bubble, so octane's bubble-phase root
  delegation never received these events — the handlers silently never fired
  (unless the element was the delegation root itself). They are now delegated in
  the capture phase (the same treatment focus/blur already had), but dispatched to
  the **target only**: the browser sends each entered/left element its own event,
  so the focus/blur ancestor walk would double-fire ancestors. This matches both
  native semantics and React (whose enter/leave events don't bubble either).

- 524939e: Event handlers whose body calls a METHOD now work (`onClick={() => obj.method(x)}`).

  The compiler's event-bundle optimization extracted the callee into a stable `fn`
  slot for identity-diffing — but extracting a member callee (`props.log.push`) loses
  its receiver, so the dispatcher's bare `fn(...)` invocation ran the method with
  `this === undefined` and threw mid-dispatch. Bundling is now restricted to plain
  identifier callees (the hot path it was built for); member callees keep the
  ordinary closure handler.

- 894d51c: Two delegated-event fixes:

  - **No double dispatch across nested delegation targets.** A native event that reaches
    more than one delegation listener (a portal target nested inside a root, nested roots,
    or overlapping portal targets) is now walked once — the first listener does the full
    logical-tree walk and the rest no-op. Previously each nested target re-walked the
    shared part of the chain and fired its handlers multiple times.
  - **`onXxxCapture` handlers now work.** Capture-phase handlers (`onClickCapture`,
    `onPointerDownCapture`, …) were compiled to a dead `$$clickcapture` slot plus a
    never-fired `clickcapture` delegated event. They now register a real capture-phase
    delegated listener and fire root→target (React's capture order) before bubble
    handlers. The real `gotpointercapture`/`lostpointercapture` events are handled
    correctly (not mistaken for capture-phase of `gotpointer`).

- 894d51c: `flushSync()` now flushes renders scheduled by the effects it commits. A layout
  effect that calls `setState` (e.g. `useTransitionStatus`'s rAF→`flushSync(setState)`)
  schedules a render while `syncFlush` is set, which previously left that render stranded
  in the queue with no microtask armed — so the update never committed until an unrelated
  update happened to flush it. `flushSync` now hands those effect-scheduled renders to
  the normal async scheduler before returning, so transition/`useTransitionStyles` state
  lands as expected.
- 1960647: `flushSync` now drains convergent `useLayoutEffect` → `setState` cascades synchronously (React parity).

  Previously `flushSync` ran layout effects once, but any re-render a layout effect scheduled
  (by calling a state setter) was deferred to a microtask instead of being flushed before
  `flushSync` returned. React drains these synchronously, so a component whose layout effect
  settles derived state across a couple of passes (e.g. a mount/exit-animation presence gate)
  would be observed mid-cascade right after a `flushSync`.

  `flushSync` now loops render → layout-effects until the queue settles, with **convergence
  detection**: it keeps draining while each pass schedules only blocks not yet rendered in this
  `flushSync` (a finite cascade propagating through the tree), and the moment a block
  re-schedules **itself** a second time it treats the cascade as non-convergent, stops, and
  hands the remainder to the async scheduler — which advances it lazily, one render per
  microtask, exactly as before. This preserves octane's deliberate divergence from React for
  non-convergent cascades (an unstable `useSyncExternalStore` `getSnapshot` returning a fresh
  object every call re-schedules its component from every layout pass — React throws
  "Maximum update depth exceeded" / warns "The result of getSnapshot should be cached";
  octane neither hangs nor burst-renders). A count backstop (50) additionally bounds
  pathological wide-but-finite chains. Passive (`useEffect`) effects stay post-paint,
  except that pending passives flush before each new render wave (see the
  passive-before-render changeset).

- e8ee0a8: `onFocus` / `onBlur` handlers now fire. They were treated as delegated events but the
  single root listener was attached in the bubbling phase — and `focus`/`blur` don't
  bubble, so the handlers never ran. They are now delegated in the **capture** phase, so
  the dispatcher (which walks from `event.target` upward) reproduces React's bubbling
  `onFocus`/`onBlur` semantics (the target handler fires, then each ancestor's). Other
  event types keep the cheaper bubbling-phase delegation. This is what lets focus-driven
  UI — e.g. a focus trap's guards — work.
- 93e2733: Return-JSX (and `@{}`) host elements containing control-flow directives — `@if`, `@for`, `@switch`, `@try` — now fold into the return-based fragment model. The directive's branch/item/case/try bodies are compiled inside the component (preserving their closure over setup locals/props), and the control inputs (condition, items, discriminant + cases array, branch/item/case/try/catch/pending functions, dep-pure deps) thread into the hoisted renderer as `props.hN` holes; the `@for` key function stays module-hoisted. The folded output is byte-identical to the inline form on the client, SSRs identically, and hydrates by adopting the server markup (verified for each directive incl. keyed reconciliation and the error-boundary path). This is the directive groundwork for collapsing `@{}` and `return <jsx>` onto one component model.
- 149800c: Fix effect/ref cleanup leak on the keyed-list batch-clear fast path.

  Clearing a keyed `@for` list (or replacing every key at once) tears down items through
  `batchClearItems`, which previously fired only each item scope's own `cleanups` and
  `children` — gated behind a `hasCleanups` flag that only `useEffect` registration set.
  Cross-module component rows (a `componentSlot` stashed on the item's `_slots`, not
  `.children`) never had their effect cleanups fired, cleanup-returning callback refs
  leaked whenever the row had no effects, and portal content in foreign targets was left
  in the DOM. Items now dispose through the full `unmountBlock(b, false)` scope walk
  (slots, portals, trySlot bookkeeping) whenever they carry any teardown work, with plain
  template rows keeping the cheap fast path. The scattered per-item removal path was
  always correct; only bulk clear/replace leaked. Teardown walks also now traverse the
  intrusive item chain (`head` → `nextSibling`) instead of the keyed Map's iterator.

- 6983478: `@for` DEP-PURE deps compare with `Object.is` (NaN-safe), like hook deps.

  The reconciler's deps-snapshot compare used strict `!==`, so a NaN dep permanently
  defeated the pure promotion (survivor bodies re-ran on every render) and ±0 behaved
  differently from the hook-side `depsChanged`. Both paths now share `Object.is`
  semantics.

- 6983478: Compiler: a valueless `key` attribute inside `@for` no longer crashes the compile.

  `@for (…) { <li key>…</li> }` hit a TypeError dereferencing the missing
  attribute value in the legacy key-attribute extraction. A bare `key` carries no
  expression, so it is now skipped (matching the component-slot `key` handling)
  and the `@for` falls back to the header key / index / `x.id ?? x` default.

- 6983478: `<form action>` toggling function → string → function re-wires submit interception.

  Switching a form's action from a function to a string cleared the intercepting
  `$$submit` handler but left the wired-once guard set, so flipping back to a function
  action skipped the re-wire and submit interception was permanently dead for that
  form. The guard is now reset alongside the handler.

- 169c7c6: Three hook fixes:

  - **`useDeferredValue`** now compares with `Object.is` instead of `===`/`!==`. `NaN` no
    longer schedules a deferred re-render every tick (it used to never settle), and a
    `-0`/`+0` change is now detected.
  - **`useImperativeHandle`** now re-attaches when the `ref` identity changes even if `deps`
    are stable (e.g. `[]`). A swapped ref previously left the old ref populated and the new
    ref unset; now the old ref is cleared and the new one is populated.
  - **`useCallback(fn)`** with no deps inside a custom hook is no longer brittle. It used to
    pre-resolve the slot and forward it to `useMemo`, which (in a custom-hook path context)
    defeated `useMemo`'s own omitted-deps reinterpret and let the trailing slot Symbol be
    treated as a deps array — caching a stale callback. It now reinterprets the omitted-deps
    form itself and forwards the raw slot so `useMemo` resolves it exactly once.

- bbc3275: Hooks now work in any function, not just components. A custom hook (a plain `use[A-Z]` function) defined in a `.tsrx` module gets its base hooks slotted — previously it threw "useState was called without a slot symbol". Base hooks keep their per-call-site trailing slot; custom-hook calls are wrapped in `withSlot` so the SAME custom hook reused at two call sites (or composed inside another custom hook) keeps independent state. The runtime combines a base hook's own slot with the call-site path stack, so this composes without changing existing component or library-binding behavior.
- ed6afad: Add two runtime primitives for plain-TS (non-template) component bindings:

  - `hostComponent` — render a host element (`<tag>`) that WRAPS a children render-body, with reactive props (className / style / events / ref) and the children rendered inside it via `childSlot`. The runtime counterpart of the compiled `<tag …>{children}</tag>` emission, for runtime-proxy host components (e.g. a `motion.div` factory). The wrapped children render-body is a fresh closure each parent render, so `hostComponent` hands `childSlot` a stable delegating body — without it a control-flow child (`@for`/`@if`) re-mounts and DOM-duplicates instead of reconciling on re-render.
  - `provideContext(scope, context, value)` — programmatically provide a context value for a scope's descendants (the same stamping `<Context.Provider>` performs), so a plain-TS component that renders children can provide context without authoring a `.tsrx` Provider wrapper.

  Both are used by the new `@octanejs/motion` (`motion.div`, `MotionConfig`, variant propagation).

- 40bcb16: Fix `hostComponent` (the primitive behind @octanejs/motion's `motion.<tag>`) leaving stale
  props on its reused element and mis-handling capture-phase events:

  - It now DIFFS against the previous render's props and removes any attribute, class, style,
    event handler, or ref that disappeared — instead of only ever applying the current props (so
    a prop present last render but absent now no longer lingers on the element).
  - Events now go through `eventSlot` rather than a hand-rolled `on<Upper>` parse, so
    `onClickCapture` registers a real capture-phase listener (`$$capture:click` + a capture-phase
    delegated listener) instead of a dead `$$clickcapture` slot on a never-fired `clickcapture`
    event.

- c842fb7: Smaller text-hole mount codegen: fold the value coercion into `htext`/`htextSwap`.

  A text-hole mount previously emitted the coercion inline at every call site —
  `htext(el, _v == null || _v === false ? '' : String(_v))`. `htext`/`htextSwap`
  now coerce the value themselves (the same coercion `setText` already does), so the
  compiler emits a bare `htext(el, _v)` / `htextSwap(pos, _v)`. The coercion runs
  exactly where it did (mount-once, never the hot update path), so it's
  runtime-neutral and byte-identical output — just less generated code per text hole
  (~240 fewer chars on the dbmon component, scaling with text-hole count).

- c62efa7: Fix a crash (`Cannot read properties of null (reading 'parentNode')`) when a template
  interleaves sibling text holes with component or control-flow holes — e.g. a metadata row
  like `{score} <Link/> {time} <Link/>`.

  A sibling-position `{x as string}` text hole mounts via `htextSwap`, which replaces its `<!>`
  placeholder with a text node, DETACHING the placeholder. The compiler was emitting that mount
  before later element walks that navigate _from_ the placeholder (`sibling(_el, n)` for the next
  text hole AND for the following component/control-flow anchors), so those walks read a detached
  node, returned `null`, and `htextSwap(null)` threw. The compiler now defers sibling-text-hole
  mounts until after every element walk is emitted, so all navigation happens on the intact
  template.

- 524939e: `htmlFor` now writes the native `for` attribute (React parity, like `className`).

  Previously it produced a dead `htmlfor` attribute. Aliased everywhere an attribute
  can be written: the compiler's static template emission, the runtime's dynamic
  `setAttribute`/de-opt paths, and SSR serialization.

- b3a9191: Rename `hydrate` → `hydrateRoot` and adopt React 18's shape. The hydration entry is now `hydrateRoot(container, <App/>)` — container first — and returns a full `Root` (with `.render()` and `.unmount()`), symmetric with `createRoot`. Previously `hydrate(Component, container, props)` put the component first and returned only `{ unmount }`. After hydration the returned root's `.render()` performs a normal client update against the adopted DOM (no re-hydration). The vite-plugin's generated client entry now imports and calls `hydrateRoot`.
- ffe32c4: Fix five hydration mismatch recovery bugs surfaced by porting React's hydration diff matrix
  (`ReactDOMHydrationDiff-test.js` + `ReactDOMServerIntegrationReconnecting-test.js`) as
  conformance tests:

  - **`clone()` corrupted the enclosing range on a client-only branch.** When the server left a
    slot empty (e.g. a client-only `@if` branch) the cursor sits on the block's close marker;
    the structural-rebuild path removed it, breaking the parent range (the whole subtree could
    vanish). It now builds fresh and consumes nothing in that case.
  - **`ifBlock`/`switchBlock` read a stale cursor for an empty server branch.** The
    "borrow markers" path (hit when the server branch had no inner markers, i.e. was empty)
    never positioned the hydration cursor, so a non-empty _client_ branch mis-adopted. It now
    parks the cursor on the slot content.
  - **`ifBlock`/`switchBlock` left server content behind for an empty client branch.** When the
    client branch renders nothing but the server rendered content, the stale server range is now
    discarded so siblings stay aligned.
  - **`setStyle` did not detect inline-style hydration mismatches.** It now warns (dev) on a
    server/client style divergence and honors `suppressHydrationWarning`, matching the
    text/attribute paths.
  - **`setClassName` did not detect `class` hydration mismatches.** Same treatment: dev warning
    - `suppressHydrationWarning` support (previously `class` mismatches were silently patched).

  All recovery runs in dev + production; warnings remain dev-only and gated, so production output
  is unchanged.

- e1f996b: Add React-shaped hydration mismatch detection + recovery, with `suppressHydrationWarning`
  and dev-only source-location attribution. Previously `hydrateRoot` adopted the server DOM
  blindly, so any server/client divergence silently produced broken DOM (and a list-grow
  mismatch could crash). Now:

  - **Value mismatch (text / attribute):** the adopted node is patched to the client value
    (`htext`/`htextSwap`/`childTextHole`/`setAttribute`).
  - **`suppressHydrationWarning`:** React shallow semantics — keeps the server value and
    suppresses the warning for that element. It is never serialized to the server HTML.
  - **Structural mismatch:** a swapped `@if`/`@switch` branch (including same-tag branches
    that differ only by a static attribute or by nested static markup), a changed tag, a
    host↔component swap, or a changed `@for` length (longer, shorter, or toggled to/from the
    `@empty` arm) is detected and the affected subtree is rebuilt on the client (the stale
    server nodes are discarded and the hydration cursor stays aligned, so following siblings
    still adopt correctly).
  - **Dev DX:** mismatch warnings include a Svelte-5-style source location
    (`App.tsrx:42:5`), surfaced via a new dev-only `dev` compiler option.

  Recovery runs in development and production; the warnings and source-location metadata are
  development-only and strictly gated, so production output is byte-identical (zero cost).

- 6983478: Structural hydration recovery at template roots now runs in production builds.

  `clone()`'s structural mismatch check (swapped `@if`/`@switch` branch, changed tag)
  was gated on the dev-only source-loc argument, so prod builds silently adopted the
  wrong server subtree with no rebuild — contradicting the documented contract that
  only the WARNING is dev-only. Detection + rebuild now run unconditionally (synthetic
  multi-root template wrappers, which have no 1:1 server node, are stamped by
  `template()` and skipped); the warning stays dev-gated.

- fc36e15: Fix `innerHTML={expr}` rendering as a dead lowercased `innerhtml` attribute (and an
  empty element) when the element also carries a spread, e.g.
  `<div {...stylex.props(x)} innerHTML={html} />`. With a spread the dedicated
  html-child fast path can't be used and the binding is routed through `setAttribute`,
  which now correctly assigns the `innerHTML` property instead of adding an attribute.
- 524939e: `onInvalid` now fires, on the control and its ancestors (React parity).

  The native `invalid` event doesn't bubble, so octane's bubble-phase root delegation
  never received it. It is now capture-delegated with the focus/blur ancestor walk —
  matching React, where a form's `onInvalid` observes its controls' invalid events
  (Radix Form relies on this to focus the first invalid control and suppress the
  browser's validation bubbles).

- 405f06e: Fix React-style `.tsx` (JSX) rendering of `Context.Provider` children and of host elements with component children.

  - `<SomeContext.Provider value={…}>…</SomeContext.Provider>` authored in `.tsx` now renders its children. Previously the built-in Provider only ran a `.tsrx`-style render-function child and silently ignored an element-descriptor child (the shape a React-style parent produces via `createElement`), so the whole subtree under the Provider rendered nothing.
  - A host element with component children produced via `createElement` from a control-flow return — e.g. a component that returns `<div><Child/><Child/></div>` from inside an `if`, so the compiler emits the de-opt path instead of a static template — now renders, and its component children mount as real Blocks that **reconcile** across re-renders (their state/hooks are preserved) and unmount cleanly. Previously this threw "rendering a component on the de-opt path is not supported".
  - The de-opt path now **reconciles host elements in place** (reuses the DOM node, diffs props, matches children by key/position) instead of rebuilding them every render. This was a correctness bug, not just a perf issue: rebuilding destroyed DOM-resident state — an `<input>`'s value, focus, selection, scroll position, media playback — whenever a parent re-rendered. Host nodes (and their per-item nodes in a `{items.map(...)}` list) now keep their identity across re-renders, and adopt the server DOM on hydration.
  - Positional component children (`<div><A/><B/></div>`, which `createElement` collapses into an array) no longer emit the "each element should have a unique key" warning — those are fixed siblings that never reorder, so they're keyed by index silently. A real `.map()` without keys still warns.

  Together these let deeply-recursive, control-flow-driven component trees with Context (the shape React-style code commonly uses) render through octane's JSX backwards-compat path with correct DOM-state preservation. Also fixes a latent teardown gap where an array-valued `{expr}` child slot (`{items.map(...)}`) did not fire its items' cleanups on unmount.

- f50c829: Compile `{items.map(item => <jsx key={…}/>)}` keyed lists to the same `forBlock`
  fast path as `@for`, instead of the de-opt descriptor/childSlot path.

  A React-style `.tsx` `.map(...)` (and a `.tsx`/`.tsrx` `.map` written in value
  position) previously built a `createElement(...)` descriptor for every row on
  every render and reconciled that array through `childSlot`/`reconcileKeyed`. It
  now lowers — on both the client (`forBlock`) and the server (`ssrBlock`) — to a
  compiled per-item body run over the raw items array, with the `key={…}` attribute
  becoming the keyed reconciler's key function. The eager per-row descriptor
  allocation is gone, the row body diffs per-binding, and server + client emit
  matching markers so the list hydrates by adoption.

  Lowered when the callback is an expression-body arrow returning a single JSX
  element: `xs.map((item) => <el key={…}>…)` and `xs.map((item, index) => …)`
  (destructured item params and the index param are supported). A block-body arrow,
  a fragment/non-element return, or a non-arrow callback keep the previous childSlot
  path. No authoring change and no behavioral change — keyed reconcile identity and
  DOM-resident state are preserved (covered by new `.tsx` `.map` reorder + hydration
  tests); it's a substantial update-throughput win for keyed lists authored with
  `.map` (e.g. the dbmon benchmark's full-table tick roughly halved).

- b3a9191: Text holes no longer require an `as string` cast when the compiler can already see the value is a string. A `{expr}` hole is classified as text (rather than a renderable child) when `expr` is a string or template literal, a `+`-concatenation involving a string (e.g. `{'Count: ' + count}`), or a local `const`/param the compiler tracks back to a string (a provably-string initializer or a `: string` annotation). The classification runs identically on the server and client compile paths, so SSR markup and hydration stay in lockstep. Names a render scope re-binds (e.g. a `@for` loop variable) are excluded from tracking so they're never misclassified.
- dd24fd5: `memo()` now bails for components rendered at value positions, with React's lazy context propagation.

  The React.memo bail lived only in `componentSlot` (compiled component positions) — a
  memo'd component rendered as value-position children (context-provider children,
  `createElement` trees in bindings) re-rendered unconditionally, and the
  context-refresh walk missed consumers under a childSlot in ARRAY mode (its keyed list
  lives in an embedded forSlot). Both same-component update paths now share the bail:
  stable props skip the body, and only consumers of a CHANGED context re-render below
  the bailed boundary (React's `['App','Consumer']` — no 'Indirection'). This is the
  building block for expressing React's implicit same-element bailout in octane
  bindings (e.g. Radix NavigationMenu's convergence).

- 7042056: Internal: store a scope's binding bag and control-flow / component / child slots in a per-scope dense `slots` array indexed by a compile-time slot index, instead of dynamic `scope["_for$N"]` string-key own-properties.

  Previously each compiled body stamped its bindings (`b$N`) and slot states (`_for$N`, `_if$N`, `_comp$N`, …) directly on the scope as string-keyed own-properties, which made the Scope/Block hidden class polymorphic across components and turned slot access into a computed-key lookup. They now live in `scope.slots[i]` (bag at index 0), so the scope object shape is monomorphic and slot access is an array index.

  - Slot indices are assigned in execution (source-id) order, so each scope's `slots` array is written front-to-back and stays packed (not a holey/dictionary-mode array).
  - `headBlock` (the `<title>`/`<meta>`/`<link>`→`<head>` hoisting) and `hostComponent` (the runtime host-with-children proxy used by `@octanejs/motion`) were the last helpers stamping `(scope as any)[key]`; both now use the `slots` array, so there are **no** remaining dynamic scope-key stamps. `headBlock` and `hostComponent` gained a leading numeric slot argument (internal/advanced APIs; `headBlock` keeps the content key for SSR adoption).
  - The `[key: string]: any` escape hatch is removed from `Scope`/`ScopeImpl`/`BlockImpl` and the interfaces are fully typed.

  No public component-API or behavior change; compiled `.tsrx`/`.tsx` output format changed (regenerate any committed build output).

- 6983478: Compiler: fix top-level control-flow placement in multi-root bodies.

  - **Constructs between static roots now render at their source position.** A
    top-level `@if`/`@for`/`@switch`/`@try`/`<Activity>` in a multi-root
    (fragment-root) body used to be appended at the end of the block — after
    later static siblings — and, worse, still advanced the template child index,
    so any BOUND static sibling after the construct resolved the wrong template
    path and crashed the mount walk. Such constructs now emit a `<!>` anchor at
    their child index (exactly like the in-element mixed-children path) and the
    child index only advances for nodes that actually contribute template HTML.
  - **Control-flow-only bodies anchor at the block end marker.** A component
    whose body is ONLY a `@for`/`@switch`/`@try` rendered its content outside the
    component's block range (after later siblings of the component) because the
    `__block.endMarker` fallback existed only on the `@if`/component emit paths.
    The anchor selection is now one shared helper across all construct emits, so
    the fallback applies uniformly and the emit sites can't drift again.

- e031a7d: Smaller template codegen: stop duplicating property-write bindings across the
  mount and update branches.

  A `class` / `attr` / `style` / `formAction` / `dangerouslySetInnerHTML` binding
  used to emit its write twice — once unconditionally in the mount branch
  (`setClassName(_el, _v)`) and once as a guarded diff in the update branch. The
  mount now only stores the element ref + seeds the diff field; a single diff runs on
  every render and performs the write, firing on the first render via the `undefined`
  seed (and `setClassName(el, undefined)` / `setAttribute(el, name, undefined)` no-op
  on a freshly-cloned element, so output is byte-identical). Elements carrying a
  spread are left untouched — a spread can write any key, so its source-order
  position and commit-phase ref timing are preserved. Runtime-neutral; the dbmon
  component (6 class bindings) shrinks ~12%, on top of the text-hole and
  sibling-navigation reductions (~20% combined).

- 86ae0c5: React parity: numeric `style` object values now get `px` appended.

  A bare number given to a style property is coerced the way React does — `style={{ width: 100 }}`
  now produces `width: 100px` instead of the invalid `width: 100`. The known **unitless**
  properties (`opacity`, `zIndex`, `lineHeight`, `flex`, `gridRow`, `strokeWidth`, …, plus their
  vendor-prefixed variants) stay raw, `0` never gets a unit, and custom properties (`--x`) are
  left untouched. String values are unchanged.

  The rule is applied consistently everywhere a style object is realized — the dynamic runtime
  path (`setStyle`), server rendering (`ssrStyle`), and the compiler's static-object bake — so
  static and dynamic styles agree and SSR hydrates without a mismatch. The static bake also now
  hyphenates camelCase keys (`fontSize` → `font-size`), matching the runtime.

- a33cdd6: Ship a built package to npm (JS + type declarations) instead of raw TypeScript source.

  Previously `octane`'s `main`/`module`/`types`/`exports` pointed at `src/*.ts`, so the
  published tarball contained raw `.ts` — which a plain Node SSR server or any consumer that
  doesn't transpile `node_modules` could not import.

  - A new build (`pnpm --filter octane build`, run automatically from `prepack`) transpiles the
    runtime to ESM `.js` + emits `.d.ts`, and copies the already-JS compiler, into `dist/`.
  - `publishConfig` repoints `main`/`module`/`types`/`exports` at `dist/` **only when
    published** — the workspace, tests, and examples keep importing `./src` directly, so local
    dev needs no build step.
  - Relative imports in the runtime now carry explicit `.js` extensions, so the emitted JS and
    declarations resolve under Node ESM and `node16`/`nodenext` consumers (not just bundlers).

  The published package now loads in plain Node ESM with no transpiler. No API or behavior change.

- 067efa3: Pending passive effects now flush before the next render pass begins (React parity).

  React flushes pending `useEffect` work at the start of any new render
  (`flushPassiveEffects`-at-render-start), so a commit's passive effects are
  guaranteed to observe the world **before** a follow-up render mutates it. Octane
  deferred all passives to post-paint unconditionally, so when a layout effect
  scheduled a follow-up render (a Presence-style reveal: commit #1 flips `open`,
  a layout effect flips local state, commit #2 mounts the revealed children), both
  commits' passive effects merged into one post-paint drain and ran child-first —
  letting a freshly-mounted child's effect observe an event announcing its own
  mount. Real-world symptom: Radix Tooltip self-closed immediately on open (its
  content's `TOOLTIP_OPEN` document listener heard the open dispatch from its own
  root).

  Both the async scheduler and `flushSync`'s layout-cascade convergence loop now
  drain pending passive effects before starting a render wave, matching React's
  observable ordering: an earlier commit's passive dispatch fires while later-
  commit children do not exist yet.

- fab1cb0: `createPortal(...)` now renders as an ordinary renderable VALUE — at any position,
  not only as a direct `{createPortal(...)}` child of a host element. Returning a
  portal from a component (`return createPortal(...)`), placing one in a ternary
  (`{cond ? createPortal(...) : null}`), at a fragment root (`<>{createPortal(...)}</>`),
  in an array (`useDecorators`-style), or from a render function all work now. A custom
  portal body may be a component (`createPortal(Comp, target, props)`) or inline JSX
  (`createPortal(<Comp/>, target)`). The host-element-child form keeps its lowered
  fast path; everything else routes through the de-opt `childSlot`, which renders the
  `PortalDescriptor`, flows context, and tears down cleanly (no orphan markers).

  Also fixes a latent bug in the return-value render path: a component whose `return`
  flips between a single-root component (the markerless `componentSlot` path) and
  `null` / a portal / an array (the `childSlot` path) — e.g. a placeholder toggling on
  and off, or a typeahead menu opening and closing — corrupted its return slot and
  crashed. The slot is now disposed when its shape changes, so it rebuilds cleanly.

- 6983478: Value-position portals: context propagation under memo bails + text-mode flips.

  Two gaps for a `createPortal(...)` living in a childSlot (a component return,
  ternary, fragment root, or render-fn result): a memo boundary that bailed on equal
  props never refreshed context consumers INSIDE the portal (the content Block lives in
  the slot's embedded PortalSlot, which `refreshContextConsumers` didn't walk — it now
  has a portal arm, like the array arm); and `textSlot`'s primitive hot path didn't
  recognize a portal-mode slot, so flipping the hole from a portal to a string wrote
  the text but left the portal's foreign-target content mounted forever. The
  mode-switch guard now routes portal-mode slots through the full classifier, which
  tears the portal down.

- dd24fd5: `createPortal` content targeting an octane-managed element now survives the owner's re-renders.

  The raw de-opt reconciler assumed full ownership of its element's live children — a
  portal's whole `<!--portal-->…<!--/portal-->` range was removed on the target owner's
  next re-render (Radix Toast portals each toast into the viewport list; every provider
  re-render deleted all toasts). Portal ranges are now tagged and treated as FOREIGN:
  the reconciler's reuse, removal, and reorder passes all skip them, so portal content
  coexists with the container's rendered children exactly like React portals.

- 149800c: Compiler: `createPortal(<div …>…</div>, target)` with an inline JSX element (or
  fragment) body at JSX child position now compiles.

  React's most common portal authoring shape previously printed the raw JSX verbatim
  into the emitted `portal()` call — invalid output reaching the bundler. The inline
  body is now hoisted into a sub-template render fn (the same lowering as an `@if`
  branch body), landing on the same `portal()` fast path as the documented
  `() => @{ … }` arrow form.

- 6983478: Prop removal now mirrors the SET path on every prop-diff loop.

  The three stale-prop removal loops (spread updates, de-opt reconcile, hostComponent
  re-apply) had drifted apart; they now share one `removeHostProp` helper. Fixes folded
  in: a removed `htmlFor` clears the real `for` attribute (previously the raw
  `removeAttribute('htmlFor')` no-op leaked it); a vanished `className` on a de-opt
  element removes the attribute instead of leaving `class=""`; a vanished
  `suppressHydrationWarning` resets the element's suppression flag on the de-opt patch
  path (it was skipped, leaking suppression onto reused elements); and generic removals
  go through `setAttribute(el, name, null)` so aria-\* and namespaced attributes remove
  with the same semantics they were set with.

- cb9ad82: Rename the project from `vyre` to `octane`. The runtime now publishes as `octane` and the Vite metaframework plugin as `@octanejs/vite-plugin`. Identifiers inherited from the Ripple fork were also renamed to Octane (e.g. `setIsRippleActEnvironment` → `setIsOctaneActEnvironment`, the metaframework `ripple()` plugin → `octane()`, and the `ripple.config.ts` convention → `octane.config.ts`). References to the upstream Ripple framework and its `@ripple-ts`/`@tsrx` packages are unchanged.
- ea6352e: The compiler now supports React-style render-prop children — `<Comp>{(data) => <jsx/>}</Comp>`. Previously only the octane `{(data) => @{ … }}` form (a JSXCodeBlock arrow) was lowered; a bare-JSX arrow body left its JSX un-lowered (invalid output), and a function child was always wrapped as a scope-receiving child renderer (so the consumer couldn't call it as `props.children(data)`). Now a component whose sole child is a `(args) => <jsx/>` / `(args) => (<jsx/>)` / `(args) => <>…</>` render-prop has that JSX lowered to `createElement(...)` while the arrow is preserved and passed RAW, so the component can call it with arbitrary args and render the returned descriptor. (Client/`.tsrx` + `.tsx`; render-prop children that return JSX are not yet supported under SSR.)
- 1987bd7: Runtime + SSR micro-optimizations (no behavior change):

  - `escapeHtml`/`escapeAttr` first run a single `.test()` scan and return the
    original string when nothing needs escaping (~5× on clean text, the common
    case); escape-bearing strings keep the native chained replaces.
  - `styleName` hyphenation (camelCase → kebab) is memoized, and `normalizeClass`/
    `styleName` now live once in `css.ts` with both the client runtime and the SSR
    serializer importing them (completing the intended shared-module split; they
    previously carried divergent private copies).
  - `shallowEqualProps` (every memo bail) uses a zero-allocation for-in compare for
    plain-prototype props instead of two `Object.keys` arrays, with the exact
    slow path kept for non-plain objects. React `shallowEqual` semantics preserved.
  - Hydration structural-mismatch diagnostics (`describeHydrationNode` etc.) are
    now constructed only when a dev source-loc exists, so production recovery pays
    only the mismatch check itself.
  - Keyed-list teardown walks the intrusive item chain (`head → nextSibling`)
    instead of allocating Map iterators.
  - `createElement` (client and SSR) no longer strips `key` via `delete` — the
    delete dropped every spread-created props object into V8 dictionary mode,
    slowing all later enumeration over those props (memo compares on
    value-position rows measured ~2× slower because of it). The key is now
    excluded during a manual own-key copy.

- 0c4d5a1: Performance: coalesce overlapping cascades in a batched flush.

  When several components in the same subtree update in one batch, an ancestor's
  re-render already cascades through its descendants — so the scheduler now skips
  re-rendering a queued block that an ancestor's cascade already brought up to date
  this flush, instead of rendering it a second time from the queue. The render
  queue is drained in depth-sorted waves (ancestors first), so this coalescing is
  independent of the order the updates were queued in. For a batch that updates an
  N-deep chain of stateful components, render work drops from O(N²) to O(N) (e.g. a
  10-deep chain: 55 block renders → 10). Behavior is unchanged — every update is
  still applied; only the redundant re-renders are removed. The depth sort runs
  only on batches of more than one block, so single (the common case),
  non-overlapping, and re-entrant updates are unaffected.

- dd24fd5: `onScroll`/`onScrollEnd` now fire (React 17+ per-element semantics).

  Native `scroll` doesn't bubble, so bubble-phase root delegation never received it —
  element scroll handlers silently never fired (Radix Select's expand-on-scroll
  viewport exposed it). `scroll`/`scrollend` are now capture-delegated and dispatched
  to the scrolled element only, matching React 17+, where `onScroll` stopped bubbling
  and ancestors receive their own scroll events natively.

- fcac573: Unify the server-rendering ABI to props-first, matching the client. A component body is now invoked as `(props, scope, extra)` on the server (it used to be `(scope, props, extra)`). This makes a plain `function Foo(props)` used at a `<Foo/>` site work the same on the server as on the client — including components that return a non-JSX value (a primitive coerced to text, an early return, `null`). SSR markup is unchanged (only the invocation order flipped), so hydration is unaffected. The server layout/page wrappers in the vite-plugin were updated to match.
- 41aa22a: Fix the server `createElement` leaking `key` into a component's `props`. The client
  `createElement` lifts `key` out of props (React semantics — `key` is never a real prop), but
  the server returned the original props object with `key` intact, so `ssrChild` spread it into
  the component and a `.tsx` component reading `props.key` saw a value during SSR but `undefined`
  on the client. The server now strips `key` copy-on-write, matching the client.
- c842fb7: Faster + smaller template navigation: chain sibling lookups instead of re-walking
  from the root.

  When a template binds several elements at the same level (e.g. a table row's
  `<td>` cells), the compiler resolved each one with a fresh walk from the parent —
  `_root.firstChild`, `_root.firstChild.nextSibling`,
  `_root.firstChild.nextSibling.nextSibling`, … — which is O(k²) navigation steps for
  k siblings, in both generated code and mount-time DOM walking. `ensureVar` now
  chains off the nearest already-materialized preceding sibling
  (`_el1 = _el0.nextSibling`, `_el2 = _el1.nextSibling`, …), so a row of k cells costs
  O(k) steps. Hole-aware templates chain via `sibling(node, n)` (still skipping
  control-flow `<!--[-->…<!--]-->` ranges as one logical step), so hydration is
  unchanged and output stays byte-identical. On the dbmon fixture's 7-cell row this
  trims the compiled component ~5% and speeds the 1,000-row mount ~11%.

- 6983478: Spread props now hydrate like direct bindings: `suppressHydrationWarning` and `class`.

  A spread-supplied `suppressHydrationWarning` was written as a literal
  `suppresshydrationwarning=""` DOM attribute — itself a guaranteed server/client
  divergence, since SSR skips the key — and never armed the suppression. `setSpread` now
  stamps the JS flag (before the other keys apply, so it's order-independent) exactly
  like the compiler's direct-attribute binding and the de-opt paths. The spread `class`
  fast path also bypassed hydration handling; it now routes through the hydration-aware
  attribute class setter, so spread and SVG/MathML classes get the same
  suppress/warn-and-patch semantics as an HTML `className` binding.

- 6983478: SSR: drop function-valued `action`/`formAction` instead of serialising the source.

  A React 19 function action — `<form action={fn}>`, `<button formAction={fn}>`,
  `<input formAction={fn}>` — is submit wiring for the client's `setFormAction`,
  not a URL. The server emitter used to serialise the function's source text into
  the HTML attribute, leaving pre-hydration markup with function source as a
  navigable action. It now drops function values (mirroring the client's tag+name
  condition); string values still serialise, under the native lowercase
  `formaction` name the client also uses.

- 634fd52: Align the SSR API with React and reshape the render result to `{ html, css }`.

  The octane-invented `render(Component, props) → { head, body, css }` is replaced by
  React-aligned entry points:

  - `octane/server` (mirrors `react-dom/server`):
    - `renderToString(element, props?, options?)` — a single synchronous pass; a Suspense
      boundary that suspends renders its `@pending` fallback (no awaiting).
    - `renderToStaticMarkup(element, props?, options?)` — clean, non-hydratable HTML (no block
      or head-adoption markers, no suspense seed script).
  - `octane/static` (NEW subpath, mirrors `react-dom/static`):
    - `prerender(element, props?, options?)` — the await-everything behaviour of the old
      `render()`: all Suspense data resolves and success arms render, returning complete HTML.

  All three return `{ html, css }`. The separate `head` field is gone — hoisted `<title>`/
  `<meta>`/`<link>` fold into `html` (spliced into `<head>` when the render produced a
  document, else prepended), matching React 19's resource hoisting. `css` remains a distinct
  field (octane has scoped CSS that React core does not). `render` is removed; the vite
  plugin's dev SSR now uses `prerender`.

- 149800c: SSR: `render()` now normalizes a root component that returns a `createElement`
  descriptor.

  A plain-`.ts` root (the shape every `@octanejs/*` binding produces) returns a
  descriptor rather than a compiled HTML string; `render()` previously used the return
  value as the body directly, yielding `[object Object]`. The root's return is now routed
  through `ssrChild` exactly like `ssrComponent` already does for child components —
  descriptor trees, component descriptors, and `null` roots all render correctly.

- aafaaa9: SSR: support the router `Match` boundary shape (`@try { <Component/> } @pending { … }`) end-to-end.

  - `octane/server` now exports `withSlot` and `startTransition`. A server build of a `.tsrx` that defines/uses a custom hook (whose inner hook calls the compiler lowers through `withSlot`) or calls `startTransition` — exactly what the `@octanejs/tanstack-router` bindings emit — previously failed to resolve those imports from `octane/server`. The server `withSlot` invokes the wrapped hook with its args (no per-call-site slot tracking is needed in a single synchronous render pass); the server `startTransition` runs its callback synchronously, matching the existing server no-op transition hooks.
  - Hydration of a `@try`/Suspense boundary whose success-arm body is a COMPONENT (the router `Match` shape) now ADOPTS the server DOM instead of throwing. The component-block adoption paths (`componentSlot`, `componentSlotLite`, `forBlock`) now adopt the server's `<!--[-->…<!--]-->` range from the parked hydration cursor when the slot is the sole hole of a control-flow arm — so its anchor is the arm's end marker rather than a block-open — mirroring the cursor-based adopt branch `childSlot` already had. Previously the cursor stayed parked on the component's open marker, so the inner mount cloned a comment node and dereferenced `firstChild`/`appendChild` on it (`TypeError`/`DOMException`), forcing the boundary to its `@catch`/rebuild path.

- 1987bd7: SSR Suspense: collapse the per-pass full-tree re-render for waterfalls.

  `render()` used to re-render the WHOLE tree once per suspense pass, so a D-level
  `use(thenable)` waterfall cost D+1 full-tree serializations — O(tree × D), which
  re-serialized all the static page bulk on every pass. It now records a discovery
  job for the innermost suspending COMPONENT and re-renders only that subtree
  between the (few) canonical full passes, so a deep waterfall costs ~2 full passes
  plus D cheap subtree re-runs. The emitted HTML, `<head>`, scoped CSS, hydration
  markers, and suspense seed order all still come from a single normal full pass, so
  output and hydration are byte-identical; `use()` keys are now scoped to the
  enclosing component frame (internal only — the client still seeds by cursor). The
  no-suspense fast path is unchanged. On the SSR throughput waterfall bench the D=4
  render dropped from ~0.104ms to ~0.049ms (depth-4-vs-1 scaling 2.6x → 1.15x), and
  32-in-flight concurrent throughput roughly doubled, while a shallow (D=1) render
  and no-suspense pages are unchanged. Deep waterfalls also stop re-firing shallow
  `use(fetch(...))` thenable creators on every pass.

- 74cbff9: SSR + hydration: render and hydrate a full app (deeply nested providers, a fragment-returning component with an empty child, and the router `Match` boundary shape) without a cursor desync. Fixes a family of bugs where the server and client serialized the SAME component tree to a different `<!--[-->…<!--]-->` block structure, so hydration adopted the wrong server node and a descendant boundary threw `TypeError: el.setAttribute is not a function` (the boundary then rebuilt, doubling the DOM).

  Compiler:

  - `.tsx` value-position component children now serialize as `createElement(...)` DESCRIPTORS on the server, matching the client. A React-style `return <Provider><Child/></Provider>` body lowered `Child` to a `__schildren` render-fn server-side (which `ssrChild` wraps in its own block) but to a `createElement` descriptor client-side (one block) — one block deeper on the server. `@{}` (template-position) bodies keep the render-fn on both sides.
  - Appended children (fragment children / a control-flow-only body, all anchored at the block end marker) emit in SOURCE order. They were grouped by type (for → if → component), so e.g. `<><Foo/> @if{…}</>` ran the `@if` before `<Foo/>` — reversing DOM order vs the source-order server output and desyncing hydration.
  - Nested JSX inside a server `{cond && <jsx/>}` child hole and inside a server component prop (e.g. `fallback={(e) => <Fallback/>}`) now lowers to `createElement(...)` instead of leaking raw, unparseable JSX into the emitted server module.

  Runtime:

  - `octane/server` now exports the `Suspense` and `ErrorBoundary` JSX built-ins (the component forms of `@try`/`@pending`/`@catch`), so authors writing `.tsx` Suspense/error boundaries can server-render them.
  - `childSlot` no longer sweeps the adopted server DOM when first rendering a component descriptor during hydration (it was deleting the very nodes it was about to adopt, stranding the cursor).
  - `componentSlot` / `childSlot` advance the hydration cursor past a component's adopted range after rendering, so a following sibling adopts the right node — fixes an EMPTY component (`<></>`, e.g. a render-nothing effect component) leaving the cursor on its own close marker.
  - `tryBlock` / `ifBlock` adopt the server range from the parked cursor when they are the SOLE hole of an enclosing scope (so their anchor is the scope's end marker, not a block-open), via a shared `resolveHydrationOpen` helper — the same dual-branch logic `componentSlot` already had.

- 894d51c: SSR + hydration now work for `.tsx` `<Context.Provider>` and de-opt host subtrees:

  - The server `Provider` only rendered children when they were a render function (the
    `.tsrx` shape); a React-style `createElement(Provider, {}, <child/>)` passes a
    descriptor, which was silently dropped — direct-JSX provider SSR rendered empty. It
    now renders descriptor / array / primitive children too.
  - `ssrComponent` now normalizes a component body that RETURNS a `createElement`
    descriptor (the de-opt return path) instead of stringifying it to `[object Object]`.
  - A de-opt HOST element whose children contain COMPONENTS (`<div><Comp/><Comp/></div>`
    returned via the de-opt path) now hydrates without mismatch: the client
    `hostElementBody` adopts the server host node instead of building a fresh one, and the
    server emits the matching `childSlot`/`forSlot`/component block nesting
    (`ssrDeoptBlockChildren`).

- 0040cad: SSR now renders value-position JSX. React-style render-prop children that return
  JSX (`<Comp>{(data) => <span>{data as string}</span>}</Comp>`), `{xs.map(x => <li>{x as string}</li>)}`,
  and render-props returning a fragment now server-render instead of throwing the
  `ssrUnsupported` error. The compiler lowers the JSX to `createElement(...)` host
  descriptors (a new server `createElement` mirrors the client's), and `ssrChild`
  serializes them — a host descriptor to `<tag …>…</tag>` (void-element aware), an
  array to one hydration block per item, and a component descriptor through
  `ssrComponent` (children preserved). The output hydrates cleanly: the de-opt
  `childSlot` array path no longer sweeps the server-rendered item ranges before
  adopting them.
- a3dce2f: A Suspense / `@try`/`@pending` boundary that re-suspends after resolving no
  longer leaves the `@pending` fallback stuck alongside the resolved content.
  When a boundary that was already showing its `@pending` fallback re-suspended on
  a DIFFERENT thenable (e.g. two consecutive `useSuspenseQuery` calls on the same
  route boundary), the runtime mounted a second fallback without tearing down the
  first; once the second thenable resolved, the content mounted but a stale
  fallback remained in the DOM next to it. The boundary now unmounts the prior
  `@pending` body (removing its DOM exactly once) before mounting the new one, so a
  re-suspend while pending REPLACES rather than STACKS the fallback, and the
  fallback is gone once the content commits.
- 3656e32: Suspense now matches React's effect lifecycle: when an already-committed boundary
  RE-SUSPENDS (its content is hidden behind the fallback), the hidden subtree's layout
  and passive effects are DESTROYED (their cleanups run), and they are RECREATED when the
  content reveals again. Previously octane's suspend hold preserved the subtree's effects,
  so a suspended component's subscriptions/timers/observers kept running while the fallback
  was shown. Component state (useState/useMemo/useRef) is still preserved across the
  suspend — only effects destroy/recreate, exactly like React.

  Effects are also destroyed exactly ONCE when a boundary suspends in multiple places
  (a partial resolve that leaves it suspended does not re-destroy or recreate them), and a
  nested inner-boundary re-suspend destroys only the inner subtree's effects, not the
  outer boundary's.

  Implementation: the suspend-hide paths run the hidden subtree's cleanups via
  `deactivateScope` (clearing effect deps so they re-fire on reveal) and mark the hidden
  tryBlock `inactive` so a re-suspend during a resume doesn't leave its enqueued effects
  stuck; the resume retry now commits effects on both the reveal and re-suspend paths
  (this also fixes a latent issue where a resume's layout effects weren't committed until a
  later flush, leaving the scheduler non-quiescent). Per `ReactSuspenseEffectsSemantics-test.js`.

- 43d940d: Add `<Suspense>` and `<ErrorBoundary>` components — JSX forms of the `@try`/`@pending` and `@try`/`@catch` directives, for authors writing JSX rather than the template control-flow (e.g. porting React / TanStack Query code).

  - `<Suspense fallback={…}>…</Suspense>` shows `fallback` while a descendant suspends (via `use(thenable)`), then the children once resolved.
  - `<ErrorBoundary fallback={…}>…</ErrorBoundary>` swaps to `fallback` when a descendant throws; `fallback` may be a renderable or a `(error, reset) => renderable` render prop.

  Both are thin built-ins over the same `tryBlock` primitive the directives compile to, so behavior is identical.

  Also: inline JSX in a component prop value (e.g. `<Suspense fallback={<Spinner/>}>`) now lowers to `createElement(...)` instead of emitting raw, unprintable JSX.

- a032c5c: Fix `block.body is not a function` when `<Suspense>` or `<ErrorBoundary>` is used
  with element children in React-style `.tsx` value position (e.g. inside `.map`,
  as in a list of independently-suspending rows). These built-ins render their
  children as the try body, which the runtime invokes as a function; `.tsrx` lowers
  children to a render function, but a `.tsx` parent lowers element children to a
  `createElement` descriptor. The runtime now normalizes either shape to a callable
  body, so JSX like `{items.map((id) => <Suspense fallback={…}><Row id={id}/></Suspense>)}`
  renders identically whether authored in `.tsrx` or `.tsx`.
- 7f8dbc0: Suspense now cycles host refs across a suspend like React does: when a boundary
  suspends, host refs in the hidden subtree are detached (object refs set to `null`,
  callback refs invoked with `null`) and re-attached on reveal — even though octane
  preserves the DOM node (React preserves it too, as `hidden`). Previously octane left
  the ref pointing at the detached/hidden node, so a callback ref never saw `null` and an
  object ref's `.current` stayed populated while the content was behind the fallback.

  This covers the compiled template host-ref path (`<span ref={...}/>`) and de-opt host
  slots (value-position / motion-style hosts). Refs attached purely through closures
  (prop spread, the de-opt prop path, fragment refs) are not yet cycled. Per
  `ReactSuspenseEffectsSemantics-test.js:2877`.

- c71d4f3: Make React-style `.tsx` `{expr}` value-hole updates as fast as a `.tsrx`
  `{… as string}` text binding.

  - A renderable `{expr}` child in a template body now compiles to an INLINE
    text-hole fast path: the text node + last value are cached on the binding bag
    (`_chv`/`_chp`), and on update — when the value is an unchanged-skippable
    primitive already backed by a text node — it does a direct `setText`, exactly
    like the `.tsrx` text-binding hot path. Objects/functions (component / element /
    array), the first render, and mode switches go through a `textHole` slow path
    that delegates to the full `childSlot`. Previously every value hole called
    `childSlot` per render — a large function V8 won't inline, with a slot-state
    indirection — which dominated update-heavy keyed lists. (A control-flow-only
    `noTemplate` body, which has no bag, uses a small `textSlot` wrapper instead.)
  - Text-node writes use `node.nodeValue` instead of `node.data` (a `Node`-level
    accessor vs `CharacterData` one prototype hop deeper) across `setText`,
    `childSlot`, the inline text-hole, and the de-opt reconciler — faster on the hot
    text-update path (also speeds the `.tsrx` `setText` path).
  - An ONLY-CHILD `{expr}` value hole (the host's sole content) now lowers FULLY
    MARKERLESS, exactly like a `.tsrx` `{… as string}` text hole: a primitive value
    is a single Text node appended to the host — no `<!>` placeholder, no slot state,
    no end marker — and only an object/function (component / element / array) lazily
    mints markers via `childSlot`. New runtime `childTextHole` + server `ssrChildText`
    (a primitive serializes as the host's bare text; an object keeps its
    `<!--[-->…<!--]-->` block) so hydration adopts either shape. (Sibling-position
    value holes keep a single placeholder via the `ownEnd` reuse above.) This removes
    the per-cell hole-aware `child`/`sibling` navigation + `insertBefore` that the
    marker forced.

  No API or behavioural change. On the dbmon update benchmark (1000-row table) this
  brings `.tsx` to PARITY with `.tsrx` on every op (and byte-identical markerless
  DOM): full-table `tick` ~2.1ms → ~1.4ms, partial `tick` ~0.9ms → ~0.5ms,
  mount ~5.9ms → ~4.4ms, remount ~5.2ms → ~3.9ms.

- a3dce2f: A transition-priority re-suspend of a DESCENDANT under a `@try`/`@pending`
  (Suspense) boundary that already has committed content now HOLDS the previous
  content instead of flashing the `@pending` fallback — matching React's
  `useTransition` "stale screen stays" contract. Previously the hold fired only
  when the boundary's OWN body re-suspended; a child component that re-rendered on
  its own (its own state update inside a transition) and re-suspended on a
  per-value `use(thenable)` / `useSuspenseQuery` would flash the fallback. The
  common case is a router route paginating via a search-param change inside a
  navigation transition: the current page now stays on screen until the next page
  is ready, with `isPending` held true throughout. A non-transition descendant
  re-suspend still soft-detaches and shows the fallback, unchanged.
- c2f3f69: A transition-held Suspense/`@try` boundary now keeps the previously committed
  content across URGENT (async) re-suspensions of that still-committed content,
  instead of flashing the `@pending` fallback — matching React's `useTransition`
  contract that, once prior content is showing, it stays on screen until the new
  tree is ready.

  Previously the hold only fired while the re-suspending render was at transition
  priority. But a held boundary's content can re-suspend at urgent priority — e.g.
  `@octanejs/tanstack-query`'s `useSuspenseQuery` observer notifies on a `setTimeout(0)`
  macrotask, AFTER octane's transition window has closed, so the re-render (and its
  re-suspend on the new in-flight fetch) is urgent. `handleSuspense` then took the
  softDetach + fallback path and the fallback flashed. It now continues the hold
  when the boundary is already transition-held (`hasResolved`, success arm live and
  intact), tracks the new thenable via the existing resume path, and re-arms the
  transition-fallback timeout against it. A fresh urgent suspend with no prior
  committed content still shows the fallback (React parity for urgent suspense).

- 3656e32: Transitions now keep the previous content on screen when they swap in a NEW subtree
  that suspends — matching React's concurrent transition + Suspense contract. Previously
  octane held prior content only for an IN-PLACE re-suspend (the same component re-renders
  and throws before mutating); a transition that REPLACED one component/branch with a
  different one that suspended on mount tore the old content down first, so the boundary
  went blank (no content, fallback suppressed) until the new subtree resolved.

  The fix adds per-swap **off-screen (WIP-model) rendering**: at each swap site
  (`componentSlot`, `childSlot`, `ifBlock`, `switchBlock`), a transition-priority swap to a
  new subtree is rendered off-screen first, with its effects/ref-attaches captured so they
  don't fire until commit. If it completes, it's committed atomically and the old subtree is
  torn down; if it suspends, the partial is discarded and the suspend is re-thrown so the
  enclosing `@try` boundary's existing transition hold keeps the OLD content live and resumes
  - commits once the data resolves. Urgent (non-transition) and hydration renders keep the
    existing clear-then-render path. This also closes the `@octanejs/tanstack-router` gap where a
    concurrent navigation to a slow route briefly blanked instead of holding the current page.

  Note: this is per-swap/per-boundary off-screen rendering, not a full double-buffered tree —
  a single transition that fans out to multiple independent suspending regions reveals them
  piecewise rather than all-at-once (same family as the documented entangled-transition
  partial-commit divergence). Single-boundary transitions (route/tab/query-key changes) match
  React's observable behavior.

- 1987bd7: Perf: a `startTransition` swap at a dynamic `<Comp/>` (`componentSlot`) or an
  `@if`/`@switch`/JSX-ternary branch (`renderBranchSlot`) now renders the incoming
  subtree ONCE instead of twice. Both sites previously rendered the new subtree
  off-screen, discarded it, then rendered it AGAIN in place — a full double render
  of every body, hook, and DOM node. They now COMMIT the off-screen work-in-progress
  the way value-hole `childSlot` already did (adopting and renaming the WIP marker
  pair in place, splicing its captured effects/refs/store-syncs into the live
  queues), halving the swap render work (incoming body executions: 3→2 per swap,
  matching the `childSlot` baseline). Suspend/error hold semantics, effect ordering,
  and final DOM are unchanged; single-root `<Comp/>` return slots keep the legacy
  path.
- f42e5b7: Fix JSX backwards-compat interop: a React-style `.tsx` parent now correctly passes
  children to a `.tsrx` `{props.children}` consumer (previously the children were
  dropped, so e.g. a `.tsx` app entry wrapping `.tsrx` provider components —
  `QueryClientProvider` / `RouterProvider` — rendered the providers but never their
  subtree, blanking the page).

  - `createElement`: for a COMPONENT descriptor, positional children are now mirrored
    into `props.children` (React's `createElement` contract). A component reaches its
    body through `componentSlot`, which forwards `props` only — so `{props.children}`
    could not see positional children. Host descriptors keep using
    `descriptor.children` via the de-opt path (unchanged).
  - `deoptItemBody`: a COMPONENT descriptor appearing as an element of an array child
    (a `.tsx` parent passing MULTIPLE children) now mounts through a nested
    `childSlot` (a real Block with hooks/reconciliation) instead of throwing on the
    host-only de-opt rebuild path.

- cc2bca1: Fix two React-JSX (`.tsx`) compiler backwards-compat gaps. A prop or local referenced
  only inside a spread (`{...expr}`) is now forwarded into the lowered fragment — previously
  the spread applied nothing (prop) or threw a ReferenceError (local), because the
  reference analysis that builds the `createElement(_frag, {…})` arg object only walked
  attribute values and text holes, not spread expressions. And a JSX comment child
  (`{/* … */}`) now compiles to nothing (matching React) instead of an empty interpolation
  hole that produced a build error. The `.tsrx` directive form was already correct.
- 6983478: `useDeferredValue(value, initialValue)`: the initial→value swap is a transition.

  The steady-state deferral already committed via `startTransition` so a suspending
  consumer keeps the prior DOM; the initialValue swap scheduled an URGENT re-render, so
  a consumer that suspends on the real value tore down the initial content and flashed
  the Suspense fallback. Both commits now run at transition priority (React's
  `useDeferredValue` contract).

- 1987bd7: `useSyncExternalStore`: replace the per-commit layout effect with a dedicated
  store-sync queue.

  The value-sync previously ran as a `useLayoutEffect` with
  `[subscribe, value, getSnapshot]` deps, so every snapshot change — and, for the
  dominant inline-`getSnapshot` pattern the zustand/query bindings produce, every
  render — paid effect enqueue, deps compare, and the drainPhase post-order sort per
  subscriber. Store syncs now go through a dedicated sort-free queue drained in
  `commitEffects` right after the layout phase (React's `updateStoreInstance` shape):
  one identity-stable inst cell per hook, a render-phase gate that enqueues only when
  the snapshot or store actually changed, and offscreen/WIP capture integration so
  abandoned transition renders drop their syncs. Subscription lifecycle stays a real
  passive effect. One intentional divergence recorded in the parity plan: a
  getSnapshot-identity-only change with an unchanged value no longer forces a
  commit-time re-read.

## 0.1.1

### Patch Changes

- [#1](https://github.com/octanejs/octane/pull/1) [`dcdf237`](https://github.com/octanejs/octane/commit/dcdf2375ce3a8a2e00b1e1de04f65c2529fd287e) Thanks [@trueadm](https://github.com/trueadm)! - Rename the project from `vyre` to `octane`. The runtime now publishes as `octane` and the Vite metaframework plugin as `@octanejs/vite-plugin`. Identifiers inherited from the Ripple fork were also renamed to Octane (e.g. `setIsRippleActEnvironment` → `setIsOctaneActEnvironment`, the metaframework `ripple()` plugin → `octane()`, and the `ripple.config.ts` convention → `octane.config.ts`). References to the upstream Ripple framework and its `@ripple-ts`/`@tsrx` packages are unchanged.
