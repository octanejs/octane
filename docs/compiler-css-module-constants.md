# CSS-module constants

The Vite compiler can bake proven CSS-module strings into static `class` and
`className` attributes. This removes repeated class-binding code without changing
class composition, attribute escaping, spread ordering, or hydration behavior.
The optimization runs only in a one-shot build, not in the dev server or watch
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

## Stylesheet reachability

Folding the last live CSS import can cause a bundler to omit the stylesheet.
Marking every imported CSS module as side-effectful is not a substitute: that
can make an unused component's stylesheet load eagerly.

The Vite integration instead preserves an original class read in each
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
An in-flight provider load is conservatively skipped to avoid cycles, so a
concurrent first importer may retain its ordinary class bindings. Only complete,
proven class strings are folded. Dynamic property names, arbitrary function calls, and mixed
runtime expressions keep their normal behavior. Authored imports and source
origins are preserved.
