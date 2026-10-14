# Strong dependencies

Status: proposal. Nothing here is implemented except the report in step 1.
Numbers are measured at `f7b41dcccb`.

A Strong application can only promise what its own modules do. The components
it renders from `@octanejs/*` and other Octane packages compile in whatever mode
each package chose, and today that is never Strong. This plan makes a package's
Strong mode something the package declares and the application can require,
and sizes the work to get the bindings there.

## Where things stand

- `compiler.strong` reaches application-owned modules only.
  `_hasApplicationStrongPolicy` in `packages/octane/src/compiler/bundler.js`
  keeps installed, linked, and workspace packages in their own mode, even when
  they sit inside the project root. A dependency module is Strong only through
  its own `"use strong"`.
- No binding package has `"use strong"` anywhere in `src/`. The only Strong
  source in the repository is `octane-evals`.
- `octane analyze --strong-dependencies` (the PR that adds this document) lists,
  by package, the Octane modules that Strong modules import, directly or through
  re-exports, which compile without Strong mode. It also lists the
  `octane/react` (ReactCompat) boundaries they reach. It is a report and never
  fails a run.

A requirement switched on today would leave a Strong application with no usable
bindings. The order is therefore: report (done), then a package declaration
and an opt-in requirement with an allow-list, then convert the bindings, and
flip the default once the core bindings are Strong.

## 1. Package declaration

A package declares Strong mode in the `octane` block its manifest already uses
for `hookSlots` and `vite`:

```json
{
	"name": "@octanejs/radix",
	"peerDependencies": { "octane": "^0.13.0" },
	"octane": { "strong": true, "hookSlots": { "manual": ["src"] } }
}
```

`"strong": true` is that package's own `compiler.strong`. Every module of the
package that Octane compiles is compiled Strong. Directives cannot opt a module
out, as with `compiler.strong` in an application.

The consuming application compiles the package's source, as it already does for
every Octane package. With the declaration, it compiles that source under
Strong. A false claim is therefore a build error in the consumer, with the
ordinary Strong diagnostic at the offending line, and is never trusted as
metadata. A package finds out first by running `octane analyze` on itself, which
compiles every module Strong once the flag is set.

Implementation sketch:

- `_nearestOctanePackageRule` already parses `pkg.octane`. Add
  `strong: pkg.octane?.strong === true` to the rule it caches. The manifest is
  already in the rule's watch metadata, so an edit invalidates it.
- `transform` computes `strong` as the application policy or the owning
  package's `rule.strong`. `strongModuleStatus` gains a `package` reason beside
  `directive` and `config`, so `octane analyze` and its coverage baseline stay
  on the compiler's answer.
- Hand-slotted modules (`hookSlots.manual`) can already be Strong through a
  directive, and that case is tested, so the declaration composes with them.

Only `true` is proposed. During a migration, modules opt in one at a time with
`"use strong"`, and the flag records the end state. The one case for a
directory list like `hookSlots.manual` is a package that keeps a non-Strong
compatibility entry for element-based APIs (see section 3). Add that form when a
binding needs it.

## 2. Application requirement

The requirement is opt-in, in `octane.config.ts`:

```ts
export default {
	compiler: {
		strong: true,
		strongDependencies: {
			require: true,
			allow: ['@octanejs/recharts', 'octane/react'],
		},
	},
};
```

With `require: true`, an import in a Strong module is a build error
(`OCTANE_STRONG_DEPENDENCY`, reported at the specifier) when it resolves into
another package that Octane compiles, and that package neither declares
`"strong": true` nor is named in `allow`. The message names the package and
both fixes.

- **Packages, not modules.** A declared package is Strong throughout, so the
  check needs only the package that the import resolves to. It never follows
  re-exports. The bundler adapters already resolve each import of a compiled
  module for the void-export proofs, so the check runs where resolution
  happens.
- **Requires `compiler.strong: true`.** If only some application modules were
  Strong, a non-Strong application barrel could re-export a non-Strong package
  into a Strong module unchecked. With every application module Strong, every
  re-export statement in the application is itself checked. The config
  rejects `require` without `compiler.strong`.
- **Workspace packages count as packages.** A monorepo's own packages are
  dependencies like any other and need the declaration or an `allow` entry,
  matching how `compiler.strong` already treats them.
- **Plain JavaScript packages are out of scope.** A package that is not an
  Octane package, by the same manifest rule that decides `usesOctane` today, is
  not checked. Strong already treats a call into imported code as the caller's
  own assertion.
- **ReactCompat is never Strong.** `octane/react` hosts real React components,
  which no Octane rule reaches. A Strong application module that imports it
  needs `"octane/react"` in `allow`, so every React island is a reviewed line in
  the config. A package that declares Strong may not import `octane/react` at
  all. That keeps the declaration meaning "no React inside", so an application
  cannot reach React through a Strong package without seeing it.

`octane analyze --strong-dependencies` previews the requirement. The packages it
lists, less `allow`, are exactly what `require` would reject, and its
ReactCompat list shows the boundaries that `allow` must name. Once `require` is
on, `octane analyze` reports the same findings with the same code.

## 3. Interaction with the element-descriptor bans

PR #2055 adds `OCTANE_STRONG_ELEMENT_API`. It rejects `createElement`,
`cloneElement`, `isValidElement`, `Children`, and `descriptorChildren` from
`octane` and `octane/server`, and `jsx`, `jsxs`, `jsxDEV`, and `Fragment` from
the JSX runtime entries, in Strong `.ts`, `.js`, and `.tsrx` modules. `.tsx` and
`.jsx` are exempt there because their JSX lowers to descriptors. A separate
proposal removes that exemption by banning `.tsx` and `.jsx` from Strong
entirely.

Together, the two rules mean a Strong module can neither make nor inspect an
element descriptor. Its markup is `.tsrx` templates. It receives a caller's
children as an opaque renderable that it can place but not walk, test, or
rewrite. A package that declares Strong takes on the same rules, so the
bindings sort into three groups:

- **None.** The package uses no element API and has no `.tsx`. It still has to
  pass Strong's other rules (render purity, effects, state), which this
  estimate does not measure.
- **Convert.** The package makes descriptors with `createElement` or uses
  `.tsx`. Both convert mechanically to `.tsrx` templates, and a `.ts` file that
  calls `createElement` is renamed to `.tsrx` so it can use template syntax.
- **Redesign.** The package's public API takes the caller's elements as data,
  through `cloneElement`, `isValidElement`, `Children`, or
  `descriptorChildren`. A template cannot express that, so the API itself
  changes.

The redesign patterns, and the Strong form of each:

| Pattern | Bindings | Strong form |
| --- | --- | --- |
| Merge props into the caller's element (`asChild`, `render={<a />}`) | radix `Slot`, base-ui `render`, aria `FocusRing`/`Pressable`, draggable, waypoint, wouter `<Link asChild>`, calendar `Flex` | A function form, `render={(props) => @{ <a {...props} /> }}`, which base-ui's `useRenderElement` already accepts, or a hook that returns props to spread |
| Clone children to inject transition state | transition-group (`Transition`, `SwitchTransition`, `ChildMapping`), select `animated` | A function child that receives the state, or a context the child reads |
| JSX as configuration, read by walking `children` | remix-router `<Routes>`, wouter `<Switch>`, aria collection builders, visx xychart, recharts children walk, i18next `<Trans>` | Data APIs (route objects, an `items` prop with a row render function), or children that register through context when they mount |
| Element-valued options (`tick={<Tick />}`) | recharts tick/label/dot/shape, streamdown overrides, html-react-parser `replace`, testing-library `render(ui)` | The function form only. recharts already accepts a function for each option, and testing-library can take a component and props, as `root.render(App, props)` does |
| Per-child portals | zag `Portal` | One portal around all children |
| Renderability guards only | sonner, drei, puck, base-ui-utils, content-loader, react-map-gl | A type-level split or `children != null`. These are small |

Radix's `asChild` is the case most applications meet. `Slot` clones its single
child with merged props and a composed ref (`packages/radix/src/Slot.ts`).
Under Strong it needs the function form. Element-based `asChild` either goes
away or moves to a non-Strong compatibility entry, which is the reason a
directory-level declaration may be needed later.

## 4. Migration estimate

The scan covered every `packages/*` binding: 110 packages, after excluding the
framework, compiler plugins, CLI, adapters, and evals. It counted shipped
`src/` only, without tests, fixtures, or `.d.ts`, and parsed each file with the
Octane compiler's own parser (`@tsrx/core` `parseModule`). Use sites are
identifier references to a banned import, excluding the import itself.

| Group | Packages | `.tsx` files | Files importing a banned API | `createElement` sites | Other element-API sites |
| --- | --: | --: | --: | --: | --: |
| Redesign | 24 | 206 | 200 | 990 | 221 |
| Convert | 28 | 2 | 97 | 282 | 0 |
| None | 58 | 0 | 0 | 0 | 0 |

Of the 24 redesign packages, 18 clone, rewrite, or walk the caller's elements.
The other 6 only ask whether a value is an element, or whether children were
passed.

- **`.tsx`:** 208 shipped files, 206 of them in aria and 2 in window. 184 of the
  208 contain no JSX node and use `createElement` directly, so for the `.tsx`
  ban alone they are renames. The other 24 hold 111 JSX nodes. The roughly 1,900
  further `.tsx` files under `packages/` are `upstream/` provenance copies,
  tests, and type tests. They are not shipped and the consumer never compiles
  them.
- **Element APIs:** `createElement` 1,267 sites, `cloneElement` 68,
  `isValidElement` 98, `Children` 42 (`toArray` 12, `only` 11, `forEach` 11,
  `count` 4, `map` 4), `descriptorChildren` 4. Another 14 sites go through
  package-local re-export shims in aria, puck, and wouter. Together that is
  1,479 direct sites in 297 files across 52 packages. No binding imports `jsx`,
  `jsxs`, `jsxDEV`, or `Fragment` from a JSX runtime entry as a value.

Where the work is, by files that must change:

| Package | Group | Files | `.tsx` | `createElement` | Other element APIs |
| --- | --- | --: | --: | --: | --: |
| aria | redesign | 277 | 206 | 414 | 28 |
| radix | redesign | 46 | 0 | 489 | 20 |
| recharts | redesign | 24 | 0 | 4 | 52 |
| shadcn | convert | 22 | 0 | 122 | 0 |
| tanstack-router | convert | 12 | 0 | 22 | 0 |
| floating-ui | convert | 8 | 0 | 26 | 0 |
| visx | redesign | 8 | 0 | 14 | 8 |
| remix-router | redesign | 7 | 0 | 17 | 9 |
| select | redesign | 6 | 0 | 10 | 9 |
| tiptap | convert | 6 | 0 | 9 | 0 |
| transition-group | redesign | 5 | 0 | 1 | 24 |
| i18next | redesign | 5 | 0 | 13 | 9 |

The redesign packages are aria, radix, recharts, transition-group, i18next,
remix-router, select, streamdown, visx, draggable, html-react-parser, base-ui,
apollo-client (only its `MockedProvider` test helper), calendar,
testing-library, waypoint, wouter, and zag, plus the six guard-only packages
named above. The rest of the element-API work is in plain `.ts` files that
build descriptors by hand: 489 `createElement` sites in radix's 46 modules,
for example. Converting them is mechanical but large.

The 58 packages in the none group are the first candidates for the
declaration. Most are hook and store bindings (zustand, jotai, tanstack-query,
redux, motion, and so on). Before declaring, each needs one
`octane analyze --strong-preview` pass for Strong's other rules.

## 5. What it unlocks

- **Imported components render inside the caller's Block.** A component whose
  only hooks are the builtins in `STRONG_LITE_HOOKS` (`compile.js`) can run as
  a lite callee, keeping its cells in a lite Scope inside the caller's Block
  instead of owning a Block of its own. The compiler publishes those exports
  (`strongLiteComponentExports`) only from a module compiled Strong, and only a
  Strong importer may run them that way (`isStrongLiteImport`, and the
  `strongLite` list in `vite.js`'s void-export metadata). Both modules must be
  Strong, so no `@octanejs/*` component qualifies today. With the declaration,
  binding components that use only those hooks become lite callees in Strong
  applications. PR #2017 measured that path.
- **A guarantee with a boundary you can read.** Under `require`, Strong's render
  purity, state, and effect rules hold for every Octane module a Strong
  application renders. The exceptions are exactly the packages in `allow`, and
  every React island is listed there as `octane/react`.
- **A descriptor-free tree.** With every package Strong, a Strong application
  outside its `allow` list never creates an element descriptor. A runtime that
  drops descriptor reconciliation for such builds would need that guarantee.
  This plan does not propose that runtime.

## Rollout

1. Report: `octane analyze --strong-dependencies`. Done.
2. Package declaration: the `octane.strong` manifest flag, the `package` reason
   in `strongModuleStatus`, and analyze support. Declare the none-group
   packages that pass `--strong-preview`.
3. Requirement: `compiler.strongDependencies` with `require` and `allow`,
   `OCTANE_STRONG_DEPENDENCY`, and the `octane/react` rule for declared
   packages.
4. Convert the convert group, then redesign the core bindings, starting with
   radix `Slot` (function form) and aria's collection builders.
5. Flip the default. `create-octane` writes `require: true` for new Strong
   projects once the bindings it scaffolds are Strong. The default for every
   `compiler.strong` project changes in a later minor release.

## Open questions

- **Rule growth.** A consumer compiles a declared package with the consumer's
  installed octane, so a new Strong rule in a later octane can fail a published
  package that the application cannot edit. One answer: a rule added after a
  package's declared `peerDependencies.octane` floor reports as a warning in
  package-declared modules until the package raises its floor.
- **Compatibility entries.** Should a package be able to ship a non-Strong
  entry, such as `@octanejs/radix/compat` for element-based `asChild`, beside a
  Strong main entry? That needs the directory form of the declaration.
