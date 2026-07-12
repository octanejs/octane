# What is octane?

[![status: alpha](https://img.shields.io/badge/status-alpha-orange)](https://www.npmjs.com/package/octane)
[![npm version](https://img.shields.io/npm/v/octane?logo=npm)](https://www.npmjs.com/package/octane)
[![npm downloads](https://img.shields.io/npm/dm/octane?logo=npm&label=downloads)](https://www.npmjs.com/package/octane)

Octane is a fast, TypeScript-first UI framework, and the successor to
[Inferno](https://github.com/infernojs/inferno). It gives you the React API you
already know, a compiler that keeps the runtime small and fast, no rules of
hooks, and no hand-maintained dependency arrays in the common case. Omit a hook's
dependency list and the compiler derives it from the closure; explicit arrays
retain React semantics, while `null` means every render. This package ships both
the runtime and compiler, with the compiler exposed at `octane/compiler`.

For the full story, see the
[main README](https://github.com/octanejs/octane#readme).

Octane is alpha software. It is ready to try, but not yet ready for production.

## License

MIT
