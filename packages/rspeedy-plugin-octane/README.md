# `@octanejs/rspeedy-plugin` (private Phase 1 scaffold)

This private package wires Octane's universal compiler into the exact Rspeedy
toolchain proven by the Lynx Phase 0 audit. It stamps each entry with explicit
background or main-thread compile metadata and routes plain `octane` imports to
the same native-safe renderer entry as compiled `.lynx.tsrx` modules.

It does **not** yet assemble a `.lynx.bundle`, install a native PAPI receiver,
support CSS/assets/HMR, or claim execution on Lynx Web, Android, or iOS. Those
remain blocked by the public lifecycle/event-hook and engine gates recorded in
`packages/lynx/README.md`; production integration belongs to Milestone 5.

```js
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

export default defineConfig({
	source: { entry: './src/App.lynx.tsrx' },
	plugins: [pluginOctane({ thread: 'background' })],
});
```

Phase 1 requires exactly Rspeedy 0.16.0, Rsbuild 2.1.4, and Rspack 2.1.3 in one
physical package graph. The plugin rejects incompatible or duplicated cores
before registering compiler hooks.

The package tests build both compile layers with Rspeedy's ES2017 target,
verify its configured syntax lowering, and inspect the pre-concatenation module
graph for one DOM-free native universal core. The matching engine/built-in
evidence and remaining execution qualifications live in
`packages/lynx/audit/runtime-compatibility.json`.
