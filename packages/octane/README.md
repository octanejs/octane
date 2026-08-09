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

Octane is alpha software. It is ready to try, but not yet ready for production.

## License

MIT
