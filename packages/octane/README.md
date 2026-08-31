# What is octane?

[![status: alpha](https://img.shields.io/badge/status-alpha-orange)](https://www.npmjs.com/package/octane)
[![npm version](https://img.shields.io/npm/v/octane?logo=npm)](https://www.npmjs.com/package/octane)
[![npm downloads](https://img.shields.io/npm/dm/octane?logo=npm&label=downloads)](https://www.npmjs.com/package/octane)

Octane is a fast, JavaScript UI framework, and the successor to
[Inferno](https://github.com/infernojs/inferno). It gives you the React API you
already know, a compiler that keeps the runtime small and fast, no rules of
hooks, and no hand-maintained dependency arrays in the common case. Omit a hook's
dependency list and the compiler derives it from the closure; explicit arrays
retain React semantics, while `null` means every render. Built-in hook calls
retain this inference inside compiler-processed custom hooks, including those in
plain `.ts`/`.js` modules. Inferring a dependency argument at a call to a custom
wrapper is narrower: the wrapper must be locally declared in a fully compiled
`.tsrx`/`.tsx` module and transparently forward its callback and final dependency
parameter to a supported hook. This package ships both the runtime and compiler,
with the compiler exposed at `octane/compiler`.

Custom Node build pipelines can opt into project-aware string-child inference
through `octane/compiler/typescript`. See the
[type-aware text compilation guide](https://github.com/octanejs/octane/blob/main/docs/compiler-text-inference.md).

Vite builds can fold proven immutable CSS-module class strings into templates.
See the [CSS-module constants guide](https://github.com/octanejs/octane/blob/main/docs/compiler-css-module-constants.md)
for the provider contract and stylesheet-loading guarantees.

Custom native integrations can opt into the experimental
[Valdi writer compiler](https://github.com/octanejs/octane/blob/main/docs/valdi-compiler.md).
It requires an application-provided adapter; Octane does not bundle a Valdi
runtime or native build integration.

Direct Node or Bun server scripts can preload `octane/compiler/register` to
compile imported Octane components without going through Vite. See the
[SSR guide](https://github.com/octanejs/octane/blob/main/docs/ssr.md#run-an-ssg-script-directly).

Applications that stream or update their own server-rendered DOM can import
`attachBehaviorRoot` from `octane/behavior`. Behavior-only roots attach native
interactions and disposable behavior without creating a component root or
taking ownership of the existing markup. See the
[external ownership guide](https://github.com/octanejs/octane/blob/main/docs/deferred-hydration.md#behavior-only-roots-and-external-ownership).

For the full story, see the
[main README](https://github.com/octanejs/octane#readme).

## React interoperability

`octane/react` exports both hosting directions: `ReactCompat` runs real React
components inside Octane, and `OctaneCompat` runs compiled Octane components
inside React 19. `ReactCompat` needs matching React and React DOM versions,
19.2 or newer in the React 19 series.

```tsrx
// App.tsrx — compiled by Octane.
import { ReactCompat } from 'octane/react';
import { Counter } from './Counter.react';

export function App() @{
	<ReactCompat><Counter start={3} /></ReactCompat>
}
```

`Counter.react.tsx` stays an ordinary React module, using hooks from `react` and
React's JSX transform with `/** @jsxImportSource react */`. Native `.tsrx`
components stay with Octane. In a mixed build, use `requireDirective: true` with
both compilers and mark Octane-owned `.tsx` and hook helper modules with
`/** @jsxImportSource octane */`. Do not alias React to Octane.

React retains its own state, events, refs, and component types, including class,
`memo`, `lazy`, and `forwardRef` components. Use
`bridgeReactContext(OctaneContext, ReactContext)` and `ReactCompat`'s `contexts`
prop to map native context into React. Within `OctaneCompat`, Octane's `use` or
`useContext` can read a real React context directly.

Both server implementations are exported from `octane/react/server`. Octane's
server compiler selects that entry automatically; React-owned server entries
that bypass it must select it explicitly. Each renderer commits its own work:
Octane transitions and `flushSync()` do not synchronously commit a
React root. The [React interoperability guide](https://octanejs.dev/docs/react-compat)
and [full ReactCompat reference](https://github.com/octanejs/octane/blob/main/docs/react-compat.md)
cover setup, pending updates, SSR buffering, hydration, and nesting limits.

## Browser compatibility

See the [browser support guide](https://octanejs.dev/docs/browser-support) for
recommended targets, required browser APIs, and optional fallbacks.

Configure your application's build target for the browser engines you support.
The Rsbuild integration's `modules` target includes Chromium 87 and Samsung
Internet 14; Samsung Internet can also be selected directly with targets such as
`samsung24`. Samsung Internet versions do not match their Chromium engine
versions, and Android System WebView is updated independently from the browser.

Build targets transpile JavaScript syntax; they do not polyfill application Web
APIs. Features such as native `inert` may require a polyfill on older supported
browsers. Validate text entry with the keyboards, languages, and browser or
WebView versions your application supports.

Octane is alpha software. It is ready to try, but not yet ready for production.

## License

MIT
