# CSS-module constants

Octane's bundler integrations can bake proven CSS-module strings into static `class` and
`className` attributes. This removes repeated class-binding code without changing
class composition, attribute escaping, spread ordering, or hydration behavior.
The optimization runs only in a one-shot production build, not in the dev server or watch
mode.

Vite's ordinary CSS-module output contains immutable named string exports. Those
can be used automatically:

```tsx
import { panel, label } from './panel.module.css';

export function Panel() @{
  <section class={panel}>
    <span class={label}>Ready</span>
  </section>
}
```

The ordinary **default export is a mutable object**. A different importer can
change `styles.panel`, so importing `styles` and reading it locally is not enough
to prove that property constant. Octane does not infer immutability from a CSS
filename, TypeScript `readonly`, a literal object initializer, or conventional
CSS-module usage.

## Immutable CSS providers

A CSS provider that guarantees immutable exports can opt in through the Vite
plugin's experimental `cssModuleConstants` option:

```ts
import { octane, type OctaneCssModuleConstants } from 'octane/compiler/vite';

const immutableCssMetadata = 'my-css-provider:immutable-constants';

export default {
  plugins: [
    myImmutableCssProvider(),
    octane({
      cssModuleConstants({ meta }) {
        // This metadata must come from a provider that owns the actual module.
        // The provider has already made its runtime export immutable.
        return meta[immutableCssMetadata] as OctaneCssModuleConstants | undefined;
      },
    }),
  ],
};
```

The returned value is `null`/`undefined`, or an object with either or both of:

- `named`: a record of exported names and their string values.
- `default`: a record of own, immutable string properties on the default export.

Returning `null` or `undefined` adds no provider facts. Built-in immutable named
exports can still be recognized.

For example, a provider may expose a final module equivalent to:

```js
export const panel = '_panel_abc';
export const label = '_label_abc';
export default Object.freeze({ panel, label });
```

Its metadata can contain
`{ named: { panel: '_panel_abc', label: '_label_abc' }, default: { panel: '_panel_abc', label: '_label_abc' } }`.
This permits the existing `import styles from './panel.module.css'` authoring
shape without asserting that arbitrary imported objects are immutable.

The callback is a correctness contract: every reported value must already be
initialized whenever the component can read it and must remain the same string
for the module's lifetime. The callback receives the exact resolved ID, final
transformed JavaScript, module metadata, and client/server target. Octane reads
the final ESM without evaluating it and checks the reported strings against its
literal exports. Malformed or stale assertions fail the build. Getters, spreads,
mutable bindings, unknown re-exports, and unrecognized computed values are not
accepted as literal-export evidence.

Keep the provider's client and server class-name configuration consistent. Facts
are collected separately for each build environment; Octane does not reuse a
client's class map for the server or vice versa.

## Rspack and Rsbuild

Rspack's class plugin offers the same constant-folding and stylesheet-preservation
contract as an opt-in feature:

```ts
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';

export default {
  mode: 'production',
  plugins: [new OctaneRspackPlugin({ cssModuleConstants: true })],
};
```

`true` accepts initialized named-string exports from a completely pure final
JavaScript CSS module. This includes the `var` aliases emitted by
`css-loader` and `CssExtractRspackPlugin` when named exports are enabled. A
callback can additionally authenticate immutable exports using the same
`OctaneCssModuleConstants` result type exported by `octane/compiler`:

```ts
new OctaneRspackPlugin({
  cssModuleConstants({ meta }) {
    return meta[immutableCssMetadata] as OctaneCssModuleConstants | undefined;
  },
});
```

The Rspack callback receives `id` (the full module identifier, including loader
chain and layer), `resource` (including its query), completed loader `code`,
provider `buildInfo` as `meta`, `environment`, `layer`, and module `type`. Octane
follows the actual issuer's ESM dependency, never a guessed resolution or an
executed application module. It checks the final source, rebuilds eligible
consumers once, and rejects a consumed proof if its source or resolved module
changes. The callback stays on the main thread; worker compilation receives
only serializable facts.

Enable it in Rsbuild with `pluginOctane({ cssModuleConstants: true })`. For
automatic named-string proofs, also enable Rsbuild's
`output.cssModules.namedExport` and use named or namespace CSS imports. Its
ordinary mutable default maps still require an immutable-provider contract.
The standalone Rspack loader cannot collect graph proofs.

This initial Rspack implementation supports JavaScript-emitting CSS providers.
Native Rspack `css/module` exposes its final class map too late for this pass and
is left unchanged. Development, HMR, and watch output is also unchanged. The
feature is disabled by default: a one-shot build performs an extra bounded
compile of eligible CSS consumers, and those consumers are not persisted in
Rspack's module cache because a provider may close over configuration outside
the cache key. Other modules retain their normal caching.
This is one bounded graph pass, not a fixed-point optimizer: a derived or cyclic
CSS provider that is itself scheduled for recompilation is conservatively left
unfolded.

## Stylesheet reachability

Folding the last live CSS import can cause a bundler to omit the stylesheet.
Marking every imported CSS module as side-effectful is not a substitute: that
can make an unused component's stylesheet load eagerly.

The integrations instead preserve an original class read in each
independently retained static host subtree and folds the remaining eligible
reads. Unused component exports can still be removed, and lazy components keep
their existing CSS-loading boundary. The integration does not change the CSS
provider's side-effect flags or execute a provider's application module.

Custom compiler hosts can supply
`resolveCssModuleConstant(request, imported, property)` directly. A named string
uses `property: null`; a namespace read uses `imported: '*'`; a default-map read
uses `imported: 'default'`. Hosts that rely on ordinary CSS import reachability
must also supply `preserveCssModuleReferences` with the affected authored module
requests. Omitting that option permits complete folding and is appropriate only
when the host independently owns stylesheet delivery and initialization.

Only direct authored `.module.css` requests (and the corresponding supported CSS
preprocessor extensions) participate in this initial integration. Extensionless
aliases, imports with attributes/assertions, and re-export barrels are left
alone. CSS facts also stay disabled when renderer boundaries are configured:
the initial stylesheet-preservation proof only covers DOM-owned host trees.
In Vite, an in-flight provider load is conservatively skipped to avoid cycles, so a
concurrent first importer may retain its ordinary class bindings. Only complete,
proven class strings are folded. Dynamic property names, arbitrary function calls, and mixed
runtime expressions keep their normal behavior. Authored imports and source
origins are preserved.
