# @octanejs/codemod

## 0.2.5

### Patch Changes

- Updated dependencies [5224963]
- Updated dependencies [b2470a0]
- Updated dependencies [598f48a]
  - octane@0.19.3

## 0.2.4

### Patch Changes

- 7d264e5: Report a retained React Intl error callback that issues React DOM resource hints when a migrated component creates a formatter with an empty locale or formats a message from a fresh empty catalog.
- Updated dependencies [761d8bd]
- Updated dependencies [9c8cf37]
- Updated dependencies [b6e67a0]
  - octane@0.19.2

## 0.2.3

### Patch Changes

- b81eb54: Warn when a retained React JSX component renders a migrated Octane wrapper through an unambiguous relative extensionless import.
- bb2a60f: Report the standalone store-provider requirement when an exported const function expression directly returns a migrated server render.
- 4ce4b29: Protect retained React DOM client roots when a relative extensionless import is rewritten to a migrated Octane component.
- b763371: Report verified retained React context reads through private arrow helpers with block bodies.
- 4bea98f: Report hook dependencies that can run React-owned getters or coercion inside comma expressions and template interpolations.
- 9e66821: Report eager property reads and computed key coercion inside object literals used as hook dependencies.
- 5c2e59f: Report getters that can run while spreading an object in a React hook dependency before migrating the component to native SSR.
- c55822c: Migrate React's `onChange` to `onInput` on native inputs whose dynamic type is proven to report per-edit changes.
- df41f93: Report the standalone store-provider advisory when a migrated exported arrow function or function expression reads the store as a component.
- 047f531: Avoid blocking a migration when a retained React DOM client root uses a wrapper that the React import can replace.
- ecd756e: Report React context member reads through a TypeScript path alias and selected named re-exports before writing the migration.
- 5b8d2fb: Preserve element-only children when a selected component is imported through a local named or default export alias.
- 43529a8: Warn when an exported arrow function renders a migrated scoped-store component at a standalone server root.
- b78fb7f: Keep the original React sources when converting a JSX map would initialize its index before a constructor argument in the callback parameter can read it.
- 05490f3: Protect templates rendered by a retained React DOM root stored in a JavaScript private class field.
- 8f37340: Report property reads and coercion in relational hook dependencies that can invoke React-owned code during standalone SSR.
- 7d27cdc: Report React-owned getter reads inside strict equality comparisons in hook dependency arrays.
- b89e477: Keep unsupported named React runtime re-exports on React and report them for migration. Supported siblings can still move to Octane.
- dc15bcf: Report a blocking diagnostic before converting a JSX map callback whose local function name would be lost in an `@for` row.
- 9fdd750: Report the standalone SSR store-provider advisory for default-exported arrow functions and function expressions that return a migrated server render.
- dbe3d77: Report React-owned getters evaluated while constructing inline arrays or spread operands in hook dependencies.
- 1a7e43d: Protect components rendered by retained React DOM client roots from an incompatible Octane template rewrite.
- Updated dependencies [90243e1]
- Updated dependencies [1e57075]
- Updated dependencies [c9149ed]
- Updated dependencies [b1b9de3]
- Updated dependencies [1031884]
  - octane@0.19.1

## 0.2.2

### Patch Changes

- 5c9b2ae: Keep React's element factory in direct callbacks whose output belongs to an explicitly authored React island.
- 21fd89b: Block JSX map conversion when a parameter default reaches a binary operand that reads the callback index before initialization.
- 2926f1c: Migrate direct literal-bracket React namespace hook calls and preserve React's `createRef` allocator for the same syntax. Report computed hook accesses that need a manual migration.
- 6851329: Block JSX map conversions when a `delete` operand in a parameter default reads the callback index before initialization.
- a23e594: Keep authored OctaneCompat hosts in React when a selected component returns one after local setup or inside a plain JSX wrapper.
- 1d0902e: Generate new native external-store helpers as `.tsrx` files so builds that compile only TSRX apply the correct hook slots and runtime imports.
- 206d5b3: Report unsupported React namespace APIs when an application accesses them through a literal computed property.
- 64228dd: Report nested element-only children on path-alias calls and stop writes until the component’s runtime import target is verified.
- 95f1958: Report when an automatically inserted React island can attach a ref after the parent layout effect reads it.
- 6cb9e93: Detect reads of an uninitialized map index in a destructuring default that immediately invokes an arrow with a single return statement.
- 96be027: Block JSX map conversions when a safe `void` expression is followed by a read of the uninitialized callback index in a parameter default.
- ea0101c: Report imported React classes that a migrated native template renders as direct children of ordinary HTML containers.
- 4c35afc: Enable the React Intl and scoped-store migration adapters when the project uses Octane 0.18.
- 9c5a0c9: Enable the React Intl and scoped-store migration adapters when the project uses Octane 0.19.
- 814c800: Accept hook dependencies that read a proven own data field on a component-owned state record.
- 33e4655: Warn when a parenthesized server render reaches a migrated store hook that may need its original provider.
- 2086891: Report a rename conflict when a native CommonJS `require('./Component.js')` uses a JavaScript runtime file with separate TypeScript types and the migration would rename either file.
- bcbdeb6: Preserve React Intl’s message comparison in the generated adapter. Equal substitutions keep the previous output, and context updates still refresh the catalog.
- 596d0a3: Warn when a retained React JSX caller has an unambiguous extensionless import that the codemod redirects to an Octane component.
- d29040c: Include directly exported constant arrow functions in the retained React hook diagnostic.
- fd98195: Warn when a retained React JSX child calls a migrated factory that now returns an Octane renderable.
- 174fed1: Warn when a native template directly renders an unchanged local component that returns React JSX under the project's JSX settings.
- da6efe8: Warn when the codemod redirects a retained React lazy component's literal import to TSRX.
- 731b0ec: Warn when a retained React caller renders a migrated component whose intrinsic JSX return follows straight-line const setup.
- 872fd9b: Warn when a directly migrated React server render passes a linked-store component to `React.createElement` without a standalone Octane provider.
- a2b09d2: Report potentially React-owned property reads in reachable operands of `&&`, `||`, and `??` in hook dependency arrays.
- 653d363: Report when an opaque `.map()` receiver can inspect renderer-specific JSX elements returned directly by a callback’s final `switch`.
- f562e27: Migrate text input change handlers when the input type is written as a JSX string expression, such as `type={'text'}`, and the attributes allow the same rewrite as a quoted type.
- b9cdc3a: Block a top-level alias rewrite that would skip a local React context provider replacement installed through `Object.assign`.
- da22162: Block migration when reading a React context Provider into a top-level variable would skip an authored getter.
- b2e1f51: Warn when a migrated server function directly renders a scoped-store consumer that may need its original provider during standalone rendering.
- b10318f: Preserve proven ordinary context-like members and report ambiguous selected context aliases in ES2015, ES2020 and ES2022 TypeScript projects.
- 39e5146: Preserve React element factories in typed retained-registry callbacks that contain a single return statement.
- bdde6b1: Block a JSX map conversion when a literal array spread or a completing void expression can lead a parameter default to read the callback index before initialization.
- d60a994: Stop write mode before editing a project with an unresolved React type projection, including a `typeof` query on a missing React export. Preview mode still shows proposed changes and reports the blocker as `react-type-projection`.
- f01e68f: Block writes that would migrate buffered React server renders called with an options argument.
- 0f982cb: Block buffered server render migrations when the new renderer would invoke a retained React component with a proven React hook.
- e3341a7: Use the inline React host for generated React Intl message fallbacks inside paragraphs when the installed Octane runtime supports it. The formatter ownership check still applies.
- a78cb2d: Keep proven implicit React Router 7 root and route configuration entry files at their existing extensions so React Router can still discover them after migration.
- cb61df7: Preserve React `Touch` namespace references in interface `extends` and class `implements` clauses.
- 7edf0b2: Preserve React root identity and reserve `key` when JSX root props include a spread.
- f3fc6e3: Block JSX map conversions when copying a fresh object literal leads a parameter default to read the callback index before initialization.
- 7476d36: Detect early JSX map index reads reached through literal conditions in short-circuit expressions and ternaries, including signed numbers, bigint literals, simple `void` expressions, and arrays and objects with safe literal contents.
- 08303f1: Add Motion's `useInView` hook to `@octanejs/motion` and enable the codemod to migrate it when the binding exports it.
- 9a6894a: Render plain React Intl message parts directly in the generated adapter so React-hosted Octane components can server-render scalar substitutions.
- 0811815: Preserve React factory props when a root call uses a local binding named `undefined`.
- 0224a5c: Preserve createElement configuration when migrating React root calls, including component keys and the factory's props snapshot.
- 8e2a962: Report a rename conflict when an executable relative import names an existing `.js` or `.jsx` path and TypeScript resolves it to a selected `.tsx` source. Preserve the JavaScript path and its type source together. Explicitly type-only references in TypeScript files can still follow the rename.
- b39404d: Keep query strings and fragments on quoted page-relative HTML module entries when renaming their source files. Locate actual script attributes so comments, inline JavaScript and unrelated attributes are preserved.
- 92b70b9: Preserve entity references, literal backslashes, and line breaks in quoted JSX props when migrating React roots.
- 803bfa9: Preserve the explicit element type argument in qualified and inline ReactElement types during migration.
- 1b48b8a: Preserve a React element factory when a typed registration file also declares immutable exported primitive constants.
- c39a9a5: Keep the application-owned React Router `AppLoadContext` type on its original module while migrating other supported imports.
- 5e26016: Preserve a selected JavaScript file when an executable relative import names that file but TypeScript resolves the request to a different source. The rename conflict keeps the original runtime path and its separate types together.
- e6d4726: Preserve a plain leading SVG title when migrating a supported static icon with `--svg-paths`.
- 9828d36: Preserve React element factories when migrating a JSX-free TSX registration whose retained registry expects React's `ReactNode`.
- f65c42e: Allow static SVG adapters inside a selected component passed directly to the installed Octane server renderer.
- 9ccab60: Emit an empty callback for direct React DOM `flushSync()` and `flushSync(null)` calls so migrated code can drain queued updates on Octane versions that require a callback.
- 0b5acbc: Warn when a retained React server renderer directly renders a migrated component imported through an unambiguous extensionless path.
- 6bb9544: Report native template roots that directly render an imported React class component.
- c6f3bff: Report inline arrow and function-expression getters that replace the Provider of a local React context.
- e92e53e: Report imported React classes rendered through native Fragment and Suspense children.
- 71aa550: Report a retained React context read through a directly called private module-level arrow when a migrated component can reach it.
- 284ae03: Report retained private React context hooks called through static namespace members.
- 08c0df5: Report React class components in the final JSX return of a component that stays in plain JSX after an early return, including returns inside fragments or StrictMode.
- 8a14695: Report React imports that the codemod keeps under their original renderer. Direct blocked hooks and context reads to their React renderer without claiming that no Octane binding exists.
- 00c08d1: Report renderer-owned hook dependency getters inside eager unary expressions.
- 017e280: Keep authored React `OctaneCompat` client hosts under their original renderer during migration.
- 5b8da66: Warn when a relative `.js` import resolves to an unchanged TypeScript hook that reads React context through a private helper.
- 4b08b19: Warn when a retained React JSX caller's explicit relative import now points to a migrated component wrapper template.
- 3c4c246: Report React DOM resource hints from retained TypeScript callbacks that an automatically migrated React Intl provider can call for an empty locale.
- d30cc10: Warn when a native template root, conditional arm or keyed row would render an unchanged React context provider. Keep the migration preview available so consumers can verify or migrate the context owner.
- 1864b1a: Report retained React JSX that reaches a migrated component through an ordinary JavaScript specifier or a direct named TypeScript re-export.
- 25af6d4: Report retained React DOM server calls that render migrated wrapper components through JSX or React.createElement.
- 4e4296a: Keep the original React `createElement` import when a separately selected plain TypeScript registration module passes a literal element callback to a retained function that requires React's `ReactNode`.
- 1025df8: Warn when native setup calls a retained TypeScript wrapper whose original linked workspace export reaches a React hook.
- c9e663c: Report React Intl scalar formatter calls in inline React memo calculators and lazy state initializers. These callbacks can call into the original React renderer during render.
- 2d74d36: Migrate direct scoped-store hook imports from linked packages that use local named exports or aliases. Preserve the resolved runtime export when generating the native store hook.
- dd9d755: Warn when migrated code awaits a React DOM server stream's `allReady` before reading the body. Octane may need the reader to pull deferred content before that promise settles.
- 1e5a8f3: Block an Intl provider migration when another import of the same React Intl class is assigned defaults in the same module.
- 97c81fa: Report React Intl scalar formatter calls inside synchronous functions invoked inline during render. The formatter can depend on the original React renderer even when it returns plain text.
- 4706e9c: Preserve React `Touch` annotations when migrating handlers that consume native touch points.
- 7d342f0: Warn about migrated standalone server render calls that pass literal props to a component with a generated scoped-store hook.
- 2520254: Report React types that have no matching Octane declaration in direct type references and explicit type re-exports.
- 85bb861: Report conflicting Unicode spellings that would leave an import or HTML entry pointing to a renamed file on macOS.
- 6a65a3c: Report the NativeStoreProvider requirement when an existing native root renders a migrated store consumer through a local root handle.
- 961a648: Warn when a registered React Router route would hand its migrated Octane default component to React.
- 65924ee: Warn when a retained TypeScript function returns React's `createElement` with a directly imported component selected for Octane migration.
- c9f39b3: Report the existing standalone server provider warning for direct module expressions, default exports, and `import.meta.main` entry guards.
- Updated dependencies [aa7068e]
- Updated dependencies [bdd71fa]
- Updated dependencies [d3994e6]
- Updated dependencies [801df5d]
- Updated dependencies [82828d1]
- Updated dependencies [a588f5d]
- Updated dependencies [901e2c5]
- Updated dependencies [1005f7d]
- Updated dependencies [e452908]
- Updated dependencies [51227c8]
- Updated dependencies [d058a1c]
- Updated dependencies [8274f84]
- Updated dependencies [349a168]
- Updated dependencies [f4f9658]
- Updated dependencies [ecf05ed]
- Updated dependencies [1247dfd]
- Updated dependencies [6fd588c]
- Updated dependencies [4f51cc8]
- Updated dependencies [08303f1]
- Updated dependencies [1950df7]
- Updated dependencies [f35440d]
- Updated dependencies [b1d701b]
- Updated dependencies [69eafbb]
- Updated dependencies [5fa8210]
- Updated dependencies [cc568ff]
- Updated dependencies [df79854]
- Updated dependencies [1ada0a3]
- Updated dependencies [28b5ebf]
- Updated dependencies [aba2955]
- Updated dependencies [523bf0e]
- Updated dependencies [f5a9920]
- Updated dependencies [d6b46e7]
- Updated dependencies [489470f]
- Updated dependencies [271454d]
- Updated dependencies [10bf0fa]
- Updated dependencies [bc63bc3]
- Updated dependencies [4706e9c]
- Updated dependencies [15c0987]
- Updated dependencies [e811e62]
- Updated dependencies [ff666bb]
- Updated dependencies [6b8a3b3]
- Updated dependencies [9c2054c]
- Updated dependencies [ef249e7]
- Updated dependencies [f16b371]
- Updated dependencies [7cde992]
  - octane@0.19.0
  - @octanejs/cli@0.3.6

## 0.2.1

### Patch Changes

- 4d23599: Refuse to migrate a local React context's Provider JSX when a direct module-level Object.defineProperty call defines its getter earlier in the same source file.
- 32532ec: Report migrated React DOM roots that directly render an unchanged local component which still calls a React hook.
- 898108e: Warn when an existing Octane server renderer directly renders a migrated component whose generated store hook needs the original provider during standalone rendering.
- f3acd8e: Preserve the original React source when an authored ReactCompat island receives an imported component through a local constant.
- b9e9c78: Preserve JSX map calls on runtime-supplied arrays and report the React element ownership that their methods can observe.
- aad5480: Convert one-way render-state latches initialized directly from a typed boolean prop, preserving eager and retry prop reads.
- cdab185: Report unresolved bare SVG tags as `svg-issuer` errors even when a store hook in the same file migrates.
- 9988377: Report potentially renderer-owned getters read by conditional expressions in React hook dependency lists.
- b9e26af: Report writable or prematurely initialized map callback parameters when an unkeyed conditional row becomes an `@for` directive. Refuse to write the affected migration.
- e502c24: Report bare SVG imports selected by object destructuring when the imported component can reach a JSX tag.
- e7dd31c: Report opaque property reads in effect dependency lists that can execute a React-owned getter during native SSR.
- 2a97508: Report potentially renderer-owned getters in React layout effect, insertion effect, imperative handle, memo, and callback dependency lists.
- 83d262f: Move ref-only helpers into an effect when all of their calls belong to that effect, preserving the original setup and cleanup behavior.
- 1711879: Preserve an explicit effect restart trigger when an unrelated property has the same name.
- 46785e6: Keep scoped-store migration diagnostics when a locally exposed handle can acquire a callback that schedules React DOM resources.
- 32c189c: Retain renderer ownership diagnostics for render-time reads of scoped store results through scalar hook inputs and local value aliases.
- 51ee741: Report React DOM resource hints called through local TypeScript helpers during inline state initialization.
- 0336f7a: Report unknown renderer ownership for React Intl formatters in generated Intl islands, and honor nested TypeScript package aliases when selecting the Intl adapter.
- 6736c8f: Report React Intl provider ownership when migrating a `FormattedMessage` to the generated native adapter.
- 7b5848e: Report render-time React Intl date range, relative time, plural and display name calls whose provider may schedule React DOM resources during server rendering.
- afba690: Report possible React-owned SSR effects from direct React Intl date, time, and number formatting during render.
- 5d3f3e7: Preserve React JSX evaluation order when mapped row props or children are evaluated before an observable key. Report rows that need manual migration.
- 2657380: Retain async and generator JSX map callbacks for review so a native loop cannot discard their promise or iterator results.
- 052d8a7: Refuse map-to-`@for` writes when a parameter default reads the later index through an eagerly evaluated property access, receiver, or call argument.
- aaf72b8: Flag more map destructuring expressions that may read the callback index before it is initialized. This protects against suppressing a `ReferenceError` when an eager arithmetic expression, unary expression, or first argument of a direct call becomes part of an `@for` loop.
- 91510a9: Report a map callback's destructuring read of its later index when an `@for` conversion would change initialization order, and refuse to write the migration.
- c62f457: Migrate typed React state setters used exclusively as one native host ref to a component-local external-store snapshot in Strong mode.
- 494156c: Preserve eager prop reads and callable React state initializers when strengthening modules, and preserve parenthesized reducer initial values.
- 5fcffd4: Allow a single literal boolean or null JSX child in a React compatibility island, preserving the value passed to the React component.
- a340118: Report unchanged local React hooks called before a component returns conditional JSX.
- f5f888d: Keep retained JSX map expressions renderable inside conditional directive arms.
- 54b928d: Warn when a retained React server render directly imports a JSX component selected for migration.
- a37c90a: Allow scoped-store hook migration when a local Effect Event uses the store and every call to that Effect Event comes directly from the same component's effects or their cleanups.
- 1d1ea68: Defer scoped-store migrations when an imported argument carries JSX from a producer selected for renderer conversion.
- 59ce57c: Keep a bindings diagnostic when a native render reads a member supplied by an opaque scoped store provider.
- 06b23f4: Recover project types for shorthand scalar props from plain exported component parameters after checking for local writes and callers.
- 6c422d9: Apply the map callback parameter checks to array literals with spreads. Block writes when converting these callbacks to `@for` would change a parameter assignment or when its binding pattern could read the index too early.
- a3d6f36: Refuse to rename a source when an import or HTML entry page would keep pointing to its old name through another spelling of the same symlinked directory.
- a4dc429: Report React DOM resource hints in imported TypeScript state initializers when native server rendering cannot collect them.
- cfd7ebf: Migrate static SVG circles and plain data attributes authored on the SVG root when the component is proven to render in Octane.
- 2e13507: Migrate supported static SVGs with local linear gradients, alpha masks, and simple filters when `--svg-paths` can prove native renderer ownership.
- 6b71eec: Keep the scoped-store diagnostic when an instance field can read the store after its enclosing effect or event has finished.
- 4c7b483: Follow wildcard re-exports when checking whether a scoped-store argument carries JSX from a module selected for conversion.
- d4b6e6a: Report conflicting migration outputs reached through symlinked directories before writing any files.
- 028f776: Warn when migrating a text input or textarea's `onChangeCapture` would move it ahead of an existing `onInput` handler.
- 060db00: Report conflicting migration output names that differ only by Unicode normalization on macOS when a source file proves both names refer to the same directory entry.
- 0e8d8ee: Warn when a migrated component calls an unchanged local hook that reads React context through a private helper after its module initializes.
- 8ba0941: Warn when an admitted SVG asset declares xmlns and a React loader that forwards it can differ from Octane on a fresh mount.
- a586fc3: Report writable map callback indexes and destructured bindings when conversion would make them read-only in an `@for` row. Refuse the migration before writing project files.
- baceb39: Preserve `.Provider` and `.Consumer` on const object literals exported directly by unselected `.ts` and `.tsx` files when a relative import names the file or its extensionless path in an ESNext project.
- f9e5005: Warn at a directly migrated top-level server render when its component may need `NativeStoreProvider` in standalone Octane.
- 5bbb134: Report later map index reads in earlier parameter tests and in branches selected by literal conditions before converting to an Octane loop.
- 84bd2a4: Report later map index reads in earlier parameter defaults that evaluate comma or strict equality operands before converting to an Octane loop.
- 0970200: Keep simple inline `useImperativeHandle` factories in Strong mode when React refreshes the handle on every committed render.
- 98de84e: Add `OctaneCompatInline` to host compiled Octane phrasing content inside React using a span on the client and server. The codemod preserves its authored React server ownership.
- c091087: Report native React Intl `formatMessage` calls and generated `FormattedMessage` React islands that can lose React request resource hints or ancestor context. Keep the existing migration preview for review.
- 439a50c: Retain React Motion `MotionConfigContext` type references and re-exports when migrating named imports. The Octane binding exports a different context value.
- 016f22c: Report context member references through a TypeScript path alias when the selected local export needs review. Keep the member in previews and stop write mode before changing the project.
- 922c9ee: Report a migration conflict before writing when a selected change would replace an authored React island's component or a statically imported local implementation dependency.
- 9708f41: Report direct server-side `OctaneCompat` edges that would reach an emitted `ReactCompat` island, and stop write mode before changing those files.
- f06f862: Report unchanged local wrappers that still call React Intl's `useIntl` before native component output.
- aea2f15: Check React Motion imports and re-exports against the Octane Motion binding's catalog. Keep requests for missing exports or an unknown namespace on their original entry points and report a binding error.
- 5aaa75f: Check named Motion imports against the project's installed Octane binding before rewriting them. Report an existing binding whose exports cannot be verified.
- 8c2e32c: Report unchanged local hooks that call React's `useCallback` when a migrated component calls them during native render setup.
- a93ff97: Report a JSX map parameter that reads the later index inside a template literal before lowering the map to `@for`.
- d019be8: Warn when an existing standalone Octane client root directly renders a migrated store consumer that may read its original provider context.
- e288b40: Report bare SVG imports that are rendered through a namespace's default export.
- 988a2d0: Allow React to set the host class and style on `OctaneCompat` and
  `OctaneCompatInline` with `hostClassName` and `hostStyle`. Both hosts use
  `display: contents` by default.

  Keep the codemod's React SSR ownership checks active when a host sets either
  presentation prop.
- 49ab3c2: Report JSX map callbacks whose `this`, `arguments`, or `new.target` reads can change when the codemod migrates their component or lowers the callback to a row.
- e34aabd: Refuse to migrate a React module that directly returns an authored server `OctaneCompat` host.
- fc0d598: Migrate deferred calls on verified scoped stores when the original package supplies a data descriptor. Preserve the descriptor import and identity, the method receiver, and the effect setup timing.
- 96d8a87: Report retained private React context helpers that use a literal namespace member such as `React["useContext"]`.
- 25bb730: Report native component setup that calls an unchanged local React hook with a literal parameter default.
- 6099bf2: Report unselected local hooks that still call React when native component setup returns component JSX or follows ordinary state declarations.
- b8a47e1: Warn when a retained private helper reads React context through a React namespace import.
- cc274f3: Report retained React effect hooks reached during a migrated component's setup, including calls after ordinary const initializers.
- 32ad2e1: Warn when an unchanged React component directly renders a JSX export selected for migration to Octane.
- ca9fc73: Preserve React Intl imports when a configured TypeScript custom condition can select a runtime export for the package's root entry.
- 7df9fb2: Verify the final Strong-mode repair before choosing the output mode and reporting remaining diagnostics.
- 760f5f7: Report unchanged local hooks that call React's `useContext` when a migrated component calls them during native render setup.
- 999d8e9: Report eager reads of a later map index inside array and object literals before converting the callback to a keyed loop.
- 8fc40b3: Report a JSX map parameter that reads the later index in an immediately invoked synchronous arrow before lowering the map to `@for`.
- Updated dependencies [7a917ac]
- Updated dependencies [14af2dc]
- Updated dependencies [9507c7b]
- Updated dependencies [7a0fa8a]
- Updated dependencies [45536c1]
- Updated dependencies [cb13e64]
- Updated dependencies [9a756ff]
- Updated dependencies [35f0615]
- Updated dependencies [cd695f2]
- Updated dependencies [229c9fa]
- Updated dependencies [c6641b6]
- Updated dependencies [a5b9bef]
- Updated dependencies [ff21aac]
- Updated dependencies [30acf9b]
- Updated dependencies [01a68e4]
- Updated dependencies [c3bea0c]
- Updated dependencies [bbbb499]
- Updated dependencies [c493477]
- Updated dependencies [33224c9]
- Updated dependencies [dd23f96]
- Updated dependencies [cbadc1e]
- Updated dependencies [13f4a75]
- Updated dependencies [e6024c4]
- Updated dependencies [36a0ac5]
- Updated dependencies [116bb8c]
- Updated dependencies [98de84e]
- Updated dependencies [d2a12e2]
- Updated dependencies [0b487b9]
- Updated dependencies [69b5971]
- Updated dependencies [79e59b7]
- Updated dependencies [08c8f21]
- Updated dependencies [52963f5]
- Updated dependencies [7d04546]
- Updated dependencies [0c0ab0d]
- Updated dependencies [e43ef86]
- Updated dependencies [46e438c]
- Updated dependencies [235acdb]
- Updated dependencies [4ae0559]
- Updated dependencies [a60018e]
- Updated dependencies [998ad73]
- Updated dependencies [42d6270]
- Updated dependencies [aea2f15]
- Updated dependencies [4abf364]
- Updated dependencies [988a2d0]
- Updated dependencies [7240091]
- Updated dependencies [3158125]
- Updated dependencies [6fe9c4e]
- Updated dependencies [598df83]
- Updated dependencies [173a573]
- Updated dependencies [6921d3d]
- Updated dependencies [09160df]
- Updated dependencies [db22792]
- Updated dependencies [aa67310]
- Updated dependencies [84ae971]
- Updated dependencies [f3e22ba]
- Updated dependencies [b117586]
- Updated dependencies [92ad772]
- Updated dependencies [296e948]
  - octane@0.18.0
  - @octanejs/cli@0.3.5

## 0.2.0

### Minor Changes

- 5fff265: Run a local migration recipe with `octane-codemod --recipe <file>`. Recipes export a `runCodemod` function and use the CLI's existing options and reports.
- ee25fab: Add a `--svg-paths` option to migrate simple SVG component imports to native SVG elements in projects that expose the original markup through `?raw`.
- 9f446e0: Migrate supported React store hooks from linked TypeScript workspace packages. The codemod generates native hooks that share the original store and preserves manual diagnostics for renderer-dependent uses.
- dd36745: Convert a scoped signal declaration and its readers and writers together with a configured migration recipe.

### Patch Changes

- c96cd6c: Require a known React Intl provider before migrating a formatter’s locale property read, so custom getters can still emit React DOM resource hints during server rendering.
- 6c496e3: Report a bare default SVG import used as a component in a file migrating to `.tsrx`, where SVG loaders can return an asset URL. The diagnostic identifies the JSX site and explains how to preserve component loading.
- 98afa90: Write the full migration report when the command's output is piped to another process.
- ad1c372: Preserve the live value of an unkeyed input when a JSX conditional only changes its literal default value.
- f916824: Keep React store hooks when an imported handle receives unverified factory arguments from an application module linked to a React DOM resource-hint API.
- 597eecc: Convert JSX lists over dense array literals when names that match row bindings are only property names or are declared inside the iterable.
- 8957832: Allow a scalar field destructured from a local object to cross into a React island when another field contains JSX. Continue checking writes to the selected field.
- 6e46fd8: Preserve unused effect dependency identifiers that intentionally trigger cleanup and setup when migrating React components to Strong mode.
- 403a876: Migrate a lazily initialized React state record whose value is consumed only by effects to a lazy ref in Strong mode. The record retains its original identity and effect dependency behavior through updates and cleanup.
- 254327f: Pass a single nested JSX element as an explicit children prop when the selected React component requires element values. Report narrow slots that need caller review.
- 73783bd: Migrate imperative handles with a fresh local method to Strong mode while preserving ref attachment on every render.
- 9be71db: Preserve fixed receiver dependencies when migrating React imperative handles to Strong mode.
- 1391aeb: Update imports in other modules when migrating a component individually so its callers can still find the renamed TSRX file.
- 6c70e90: Keep the binding diagnostic when JSX reaches a React island through Object.assign or an object passed to or returned from a local helper.
- 1987f37: Preserve child descriptors when a component passes its children to a local inspection helper. Preserve mapped JSX children at directly imported, selected components. Keep the original `className` on nested intrinsic descriptors so inspectors can read it.
- 74f3374: Follow a localized message through two selected components when the formatter result reaches a native text attribute.
- 7319277: Migrate React Intl locale destructuring when a private component reads from its proven local IntlProvider.
- 03cab30: Keep the binding diagnostic when JSX reaches a React island through writes to a local object property.
- f73e68e: Preserve authored property dependencies and fresh setup callbacks when migrating React layout effects to Strong mode.
- 036ca9c: Convert a component's render-time update that keeps it mounted after opening to linked state when the codemod can preserve its input reads and its closed render returns null.
- 30c62de: Migrate proven local external-store wrappers for native callers. Keep the original React hook and share its browser snapshot and subscription functions with one generated Octane wrapper.
- a259a31: Recognize top-level const aliases of store handles created by verified shared factories. Migrated hooks keep reading and updating the original handle.
- 2cf99e4: Migrate more React Intl calls whose results reach DOM text attributes through JSX wrappers, including calls with scalar substitutions and fallback labels.
- fd0f5b2: Keep JSX map calls with known custom methods or visibly sparse array literals in compatibility mode so the original callback dispatch is preserved.
- 772ed22: Retain the migration diagnostic when a store handle's defining module changes one of its members.
- dd36745: Ship the codemod CLI and library from strict TypeScript sources, with generated declaration files and named types for programmatic consumers and local recipes.
- 0568690: Report a collision before migrating when a TSRX output already exists or two source files would create the same output. Dry runs report the same conflict.
- b8f0af6: Continue codemod previews past TSRX rename collisions. Report each conflicting source and preview the remaining files so partially migrated projects can see their remaining work. Write mode still stops before editing the project when a collision is found.

  Convert JSX `&&` guards to `@if` when strict TypeScript types prove the condition can only be boolean or nullish.

  Add `--no-project-types` for previews on large projects. The codemod uses module-local types and keeps compiler verification and import resolution.

  Mark migrated files as blocked in the text report when the codemod found an error in their original source.

  Preserve every-render React hook schedules when requesting Strong mode. Convert filtered array lists when the callback parameter names overlap safely.
- e07e4a9: Migrate direct JSX uses of consolidated Radix Slot members to flat binding exports and preserve the element descriptor used to project props onto a single intrinsic child.
- af1d737: Migrate supported React Intl providers, scalar formatter reads, and plain messages through a shared project-local adapter. Keep the project's React Intl dependency for formatting and preserve its locale across supported React component boundaries. Inline rich-text callbacks with a single native tag can keep producing React elements inside a retained React component.

  Strong migrations can preserve effects keyed by object identity when a callback reads a property or calls a method on an immutable local receiver.
- 909f59b: Preserve paragraphs when automatically hosting an unported React child. Use the installed inline ReactCompat host where available and report a migration error when it cannot be resolved.
- 7e90829: Preserve React's `createRef` allocator in named imports and re-exports, dotted namespace access, and direct type queries. Its ref objects work with Octane's ref lifecycle.
- aa9472d: Keep inline intrinsic rich-text substitutions in React when migrating a component that uses the React Intl bridge.
- 92321ae: Migrate React DOM's `Root` type alongside its renderer APIs, including named, namespace, and inline type imports.
- b40ef32: Migrate SVG groups clipped by a single local rectangle with `--svg-paths`, preserving the authored clip ID and definition order.
- 87016a4: Allow React islands to receive scalar values destructured from local member expressions and array slots, or supplied by a missing-field default. Preserve the value of a scalar copied before a later field assignment.
- 629e219: Allow native SVG migration for rectangles filled by a local, single-path repeating pattern.

  Preserve scale, translate, and matrix transforms on SVG paths and fixed string tokens passed to `clsx`.
- feef00e: Migrate static SVG paths and rectangles inside scaled or translated groups with `--svg-paths`, preserving their order, strokes, opacity, and CSS custom-property paints.
- 063aaab: Recognize named re-exports of verified store handles, conditional hook arguments, and branded primitive identifiers. Reuse the same generated hook source across consumers of the same linked package.

  Migrate scalar React Intl message substitutions and localized native attributes. Retained React rich-text callbacks can use a literal key and multiline JSX around their argument. Keep authored React boundaries and report values that carry native JSX into a React component.
- 42cdd3d: Preserve the original React element when a verified store service receives a self-closing external React component with literal props.
- 07d6df0: Migrate React submit event and handler annotations to the existing Octane native event types. Report submit handlers that rely on synthetic event behavior or whose event escapes the handler.
- e9df1f8: Migrate supported path SVGs whose class names are assembled by the installed `clsx` package from literal tokens and simple conditions.
- bf6c401: Keep the SVG issuer diagnostic when a `clsx` condition can change before the native SVG renders.
- f43f499: Allow `--svg-paths` to migrate SVGs whose classes come directly from a CSS Module or from CSS Module tokens passed to the installed `clsx` package.
- 25a5b82: Preserve a fixed CSS custom-property color on a directly rendered SVG component with `--svg-paths`.
- f8745ae: Preserve supported inline CSS transforms when migrating static SVG imports with `--svg-paths`.
- 157ae95: Let `--svg-paths` migrate a static SVG stored in a component-local variable when its only read reaches a proven native render destination.
- 990cd16: With `--svg-paths`, migrate SVGs passed to a named prop when the receiving component checks its presence and renders it into native output, including as a nullish fallback.
- 7e00bdf: Migrate static SVGs with leading-dot opacity values and icons whose class is selected by a fixed local condition.
- 0d64904: Migrate path-only SVGs when their owning or receiving component is referenced in a TypeScript type query. A type-only export cannot establish a renderable owner.
- 30df38d: Follow rendered props through selected components when migrating path-only SVGs. Keep the original import when a component can inspect the element or pass it to another renderer.
- 44271b1: Preserve supported literal `fill` and `focusable` overrides on native SVG components migrated with `--svg-paths`.
- fcaa9a7: Report native component setup calls to unchanged local TypeScript hooks that directly invoke React's useState or useSyncExternalStore.
- ae26518: Migrate verified workspace store hooks when an effect or native click passes the store to an unchanged local TypeScript function.
- 03f27cd: Keep renderer ownership diagnostics when a Unicode-escaped `eval` can access a scoped store binding.
- c180c81: Keep keyed React lists as `.map()` when moving the key into an `@for` header could change the order of row setup and key evaluation.
- ea6faf3: Preserve literal string data attributes on native SVG components migrated with `--svg-paths`.
- b244f8c: Offer a Strong migration from an every-commit layout effect that copies a scalar DOM measurement into adjacent state to `useLayoutSnapshot`. The codemod preserves the every-commit schedule of React layout effects with omitted dependencies, including when a component stays in compatibility mode.
- e528743: Avoid loading the TypeScript dependency graph for component migrations that can be rewritten without project type information.
- bd48216: Migrate `@floating-ui/react-dom` imports to the standalone Octane positioning entry and add the root binding package as a dependency.
- 1498cf1: Migrate React Intl formatter reads when a local component forwards the result to a DOM text attribute, including through a rest-prop spread.
- 2abc648: Migrate mount effects that call local helpers over stable refs while preserving when those helpers read and clear their refs.
- 3e8d6b9: Migrate a direct React subscription to a native writable signal into a tracked signal read in Strong components when the client and server read the same value.
- e6dc5ea: Migrate `ReactEventHandler<T>` to Octane's native event handler type, with a typed `currentTarget`. The codemod reports React-only event uses for review.
- ee5e8be: Migrate store method calls that use a handle from the original workspace store and pass plain data.
- 00270a3: Warn about rendered SVG imports that request React components when migrating to TSRX.
- b336568: Migrate expression-bodied effects to Strong mode when their explicit dependencies can be preserved, including effects that return a cleanup function.
- 09cc966: Preserve authored ReactCompatInline boundaries and keep their children under the React renderer.
- 6cdbc95: Keep keyed map callbacks when a row guard can skip the key or run before it.
- 4c2092c: Preserve render-time property reads that trigger React effects when migrating eligible dependency lists to Strong mode.
- 842e279: Allow safe store hook migrations when a component is referenced by a TypeScript type query. Runtime component references still require renderer ownership proof.
- b19050a: Preserve string `className` and object `style` types when migrating React components that wrap intrinsic elements with `ComponentProps`, `ComponentPropsWithRef`, or `ComponentPropsWithoutRef`.
- 1125a21: Keep the workspace-store binding diagnostic for inputs traced to local factory wrappers, including primitive keys that can dispatch to renderer-owned callbacks.
- de65805: Defer workspace store helper calls when a local runtime dependency can change during migration.
- 429b910: Generate the React Intl and linked-store adapters on stable Octane 0.17 releases.
- b464246: Keep renderer-boundary diagnostics when a scalar-looking React island prop receives JSX through a local reassignment, destructuring assignment, or for-of loop.
- Updated dependencies [bf398e2]
- Updated dependencies [cd974fa]
- Updated dependencies [61e724f]
- Updated dependencies [3c4f5ad]
- Updated dependencies [ac86023]
- Updated dependencies [3dc24cf]
- Updated dependencies [5add880]
- Updated dependencies [75bcd35]
- Updated dependencies [5af6e70]
- Updated dependencies [f925209]
- Updated dependencies [6512e48]
- Updated dependencies [4258cf5]
- Updated dependencies [343be9a]
- Updated dependencies [792af47]
- Updated dependencies [a2fa609]
- Updated dependencies [1325880]
- Updated dependencies [0fda24c]
- Updated dependencies [5a5aa6c]
- Updated dependencies [3975992]
- Updated dependencies [7db3f95]
- Updated dependencies [1868a5b]
- Updated dependencies [e821117]
- Updated dependencies [6fa5f7f]
- Updated dependencies [435bdac]
- Updated dependencies [67298b5]
- Updated dependencies [4b64604]
- Updated dependencies [b244f8c]
- Updated dependencies [c9bcc4f]
- Updated dependencies [909a2ed]
- Updated dependencies [613a05a]
- Updated dependencies [acadce2]
- Updated dependencies [2c9d3e3]
- Updated dependencies [04b73de]
- Updated dependencies [898c502]
- Updated dependencies [0d65190]
- Updated dependencies [3778ae7]
- Updated dependencies [64d779e]
- Updated dependencies [ecd6844]
- Updated dependencies [5450451]
- Updated dependencies [d5d6be8]
- Updated dependencies [26b65e9]
- Updated dependencies [21f3bbf]
- Updated dependencies [b42faf3]
- Updated dependencies [3378352]
- Updated dependencies [ad6cb45]
- Updated dependencies [2060f37]
- Updated dependencies [895fc94]
  - octane@0.17.0
  - @octanejs/cli@0.3.4

## 0.1.4

### Patch Changes

- 58701b1: `npx @octanejs/codemod` now runs from a clean environment. The codemod verifies each migrated module with the Octane compiler it installs, and that compiler needs `@tsrx/oxc`, which `octane` declares only as an optional peer. The codemod did not install it, so every run on a project without Octane installed failed with `Cannot find package '@tsrx/oxc'`. The codemod now depends on `@tsrx/oxc` at the version `octane` peers on.
- 85a1144: A component from a React package with no Octane port that cannot render in a `ReactCompat` island now fails where it renders with the error the codemod reported, naming the component and the package. The codemod used to leave the element as it was, so Octane failed on the React component deep in its renderer with `Element type is invalid … object with keys {$$typeof, render}`. The element is now wrapped in a local `NoOctanePort` component that throws that error. Swap the wrapper for `ReactCompat` once nothing Octane renders reaches the component.

  String literals that are exactly the path of a module renamed to `.tsrx` are now updated in configs, scripts, and other modules that keep their names, such as Vite's `server.warmup.clientFiles: ['./src/main.tsx']`. A path resolves from its own file or from the project root. Before, Vite logged `Failed to load url /src/main.tsx` on every start.

## 0.1.3

### Patch Changes

- 42e8c19: Close the gaps a migration of T3 Code exposed. The codemod now adds each binding the migrated code imports to `package.json`, at its catalog version and beside the React package it replaces; TanStack's own adapters, which the catalog does not version, take `latest`. It names each patch the project applies to a replaced React package (pnpm or Bun `patchedDependencies`, or patch-package's `patches/`), which does not reach the binding. `jsx` and `jsxs` from `react/jsx-runtime`, passed to a JSX runtime consumer such as `hast-util-to-jsx-runtime`, become a local `jsx` that calls `createElement` with the key in its props, instead of an error. `event.target` reads as `event.currentTarget` when the handler's type wraps a control's event, such as Base UI's `BaseUIEvent<ChangeEvent<HTMLInputElement>>`, or is a control's `FocusEvent`. Base UI's `Input` and `Field.Control` count as text fields, so their `onChange` becomes `onInput`, and a wrapper that spreads its rest props onto one, directly or through a nested `const { style, ...rest } = props`, passes `onChange` on as `onInput`. The closing "Next" line names a project outside the current directory by its absolute path.
- Updated dependencies [99dcc06]
- Updated dependencies [a740e20]
- Updated dependencies [4eadb3d]
- Updated dependencies [c613495]
- Updated dependencies [d62c24e]
- Updated dependencies [a222919]
- Updated dependencies [0c8ec2f]
- Updated dependencies [134d36c]
- Updated dependencies [0c8ec2f]
- Updated dependencies [82f3946]
- Updated dependencies [b379919]
- Updated dependencies [a222919]
- Updated dependencies [73e718c]
- Updated dependencies [55daac6]
  - octane@0.16.7
  - @octanejs/cli@0.3.3

## 0.1.2

### Patch Changes

- 0bdbad9: Check each migrated binding subpath against what the binding exports. An import such as `@base-ui/react/dialog` that the binding serves no longer reports a "check that it exists" warning, and one it does not serve, such as `zustand/middleware/immer`, is now an error naming the missing export. The CLI's binding catalog records each binding's export subpaths for this check.
- Updated dependencies [0bdbad9]
- Updated dependencies [0bdbad9]
- Updated dependencies [b87a0a0]
  - @octanejs/cli@0.3.2
  - octane@0.16.6

## 0.1.1

### Patch Changes

- Updated dependencies [2b78b6b]
- Updated dependencies [999a5dd]
  - @octanejs/cli@0.3.1
  - octane@0.16.5

## 0.1.0

### Minor Changes

- 722b602: Add `@octanejs/codemod`, the `octane-codemod` command, which migrates a React +
  TSX/JSX codebase to Octane + TSRX.

  It rewrites React imports to `octane` and React libraries to their
  `@octanejs/*` bindings, lowers components to `@{ … }` templates with `@if`,
  `@for`, and `@try` where that keeps React's behavior, unwraps `forwardRef`,
  ports context providers and consumers, legacy roots, and text-input `onChange`,
  spells holes whose types prove them strings or numbers as text bindings, and
  renames every module with JSX to `.tsrx`, updating every import of them. Every
  migrated module is compiled before it is written. With `--strong` it applies the
  compiler's own fixes and keeps each module Strong where the compiler accepts it,
  falling back to compatibility mode with the remaining Strong errors reported.
  What it cannot migrate, such as class components and React libraries without a
  binding, is listed by file and line.

### Patch Changes

- 87271a4: Fixes from migrating the repo's React benchmark apps:

  - `if (c) return <A />;` guards in a component become `@if`/`@else`. Before,
    they rendered through runtime element descriptors.
  - `root.render(<App />)`, `root.render(createElement(App, props))` and
    `hydrateRoot(c, <App />)` mount the component directly, so the generic
    element renderer stays out of the bundle (7–21 kB gzip in the apps).
  - `renderToString` and `renderToStaticMarkup` read `.html`, since Octane returns
    `{ html, css }`.
  - `{x && <A />}` lowers to `@if` when `x` is a `const` holding a comparison.
  - Every HTML page beside the sources is updated, not only `index.html`, and
    imports through a tsconfig `paths` alias (`~/components/Card`) of a renamed
    module are rewritten like relative ones.
  - `react-dom/server.edge` and `react-dom/server.bun` map to `octane/server`, and
    `@tanstack/react-start` maps to the `@octanejs/tanstack-start` framework
    integration.
  - TSRX written for React (`@tsrx/react`), which the codemod cannot read, is
    reported instead of skipped silently.
  - A TanStack root shell's `<html>`, `<head>` and `<body>` become the router's
    `Html`, `Head` and `Body`, which own the hydration root.
  - A context made on either branch of a conditional, and `C.Provider` read as a
    value, are ported like `<C.Provider>`.
  - React names read only in types import as `type`, so bundlers elide them.
  - A `.map()` whose row writes an outer variable stays a `.map()`; `@for` rows
    may be skipped.
  - `//` and `/*` in element text stay text in TSRX.
  - `typeof children === 'function'` also checks `!isChildrenBlock(children)`.
  - `declare module` augmentations follow their package to its binding,
    `@visx/<feature>` imports map to `@octanejs/visx/<feature>`, and a package's
    `/react` entry without a binding is reported.
  - `flushSync` and React Three Fiber imports are reported: Octane's `flushSync`
    leaves the commit's `useEffect`s queued, and three.js scenes belong in
    `.three.tsrx` modules.
  - A Strong fallback no longer leaves a blank line where `"use strong"` was.
- 3430ec0: Fixes from migrating Memos and T3 Code:

  - A text field that spreads a component's rest props (a shadcn-style `Input` or
    `Textarea`) takes `onChange` out of the rest and passes it as `onInput`, so
    controlled fields keep updating per keystroke. Before, the spread passed it
    through as Octane's native `change`, which fires on blur. A spread the codemod
    cannot prove safe is reported.
  - `React.ReactNode`, `React.FC` and the other names of React's global namespace,
    written without an import, map to Octane's types.
  - `forwardRef` type arguments are rewritten like any other type, so
    `React.ComponentPropsWithoutRef<"div">` no longer survives the migration.
  - `e.target` becomes `e.currentTarget` in a handler a component passes on to a
    form control, as the project's types say (`<Input onChange={(e) => …}>`), in
    handlers annotated with a union of controls, and in `onFocus`/`onBlur`.
  - Declaration files are migrated: `declare module 'react' { namespace JSX }`
    custom-element typing moves to `octane/jsx-runtime`, and other augmentations
    of React's types are reported.
  - A package is reported as needing a binding only when the entry imported needs
    React: a package whose export map hides `package.json` is read from disk, and
    one with a `./react` entry needs a binding only there.
  - A component that reads its `children` as an element (`render={children}`,
    `cloneElement`, `Children.only`, `isValidElement`) is marked
    `descriptorChildren`, so its callers pass elements as React does, and its
    call sites in the module keep conditional children as expressions.
  - Added imports use the module's own quote style.
  - `@octanejs/cli` exports `readInstalled`, which reads an installed package's
    manifest without going through its export map.
- 64fea6c: Map Radix primitive packages and TanStack's React adapters to their Octane ports instead of reporting them as unported. `import * as DialogPrimitive from '@radix-ui/react-dialog'` becomes `import { Dialog as DialogPrimitive } from '@octanejs/radix'`, named imports read from that namespace, and `@radix-ui/react-slot` imports `Slot` from the binding's root. `@tanstack/react-table`, `@tanstack/react-hotkeys`, and `@tanstack/react-pacer` become TanStack's `@tanstack/octane-*` adapters, with `Octane` for `React` in type names. Names the port lacks, such as Radix's props types or TanStack Table v8's `useReactTable`, stay on the React package with an error saying what to do.
- e919601: A React package with no Octane binding now stays on React instead of failing
  every module that imports it. A component of that package whose element gives
  React only text and data renders in a `ReactCompat` island when the project has
  React and React DOM 19.2 or newer in the React 19 series, and a comment above each import says the
  package has no port. Its hooks, contexts, and components that take Octane
  children or render callbacks are reported where they are used, and the CLI
  lists every such package under **No Octane port**, with the modules that import
  it, the elements hosted in islands, and the uses that need a port. In
  `--json` output, `missing` lists those packages as objects rather than names.

  `useSyncExternalStore` imported from `use-sync-external-store` or its `/shim`
  entry, React's version for React 17 and earlier, now comes from Octane.
- 868ee70: A ternary between an element and a value now migrates the value arm as `<>{value}</>`. It was emitted as a bare `{value}` arm, which is a JavaScript block rather than a hole, so that branch rendered nothing and is now a compile error.
- b4e303d: Ship TypeScript declarations for the CLI, React codemod and MCP server, including their public subpath exports.
- Updated dependencies [868ee70]
- Updated dependencies [f47dfed]
- Updated dependencies [74de956]
- Updated dependencies [722b602]
- Updated dependencies [3430ec0]
- Updated dependencies [23a25c2]
- Updated dependencies [20d705f]
- Updated dependencies [87a4465]
- Updated dependencies [d6f5536]
- Updated dependencies [3163cd8]
- Updated dependencies [70e0de0]
- Updated dependencies [4fc96cf]
- Updated dependencies [e8b0597]
- Updated dependencies [2c51977]
- Updated dependencies [58ddff8]
- Updated dependencies [618b187]
- Updated dependencies [bab7bb6]
- Updated dependencies [baf3c45]
- Updated dependencies [3f3bf1a]
- Updated dependencies [b4e303d]
- Updated dependencies [f0c0d36]
- Updated dependencies [86cf9cb]
- Updated dependencies [86cf9cb]
- Updated dependencies [fc94c15]
- Updated dependencies [2c88007]
  - octane@0.16.4
  - @octanejs/cli@0.3.0
