// Browser consumers import this subpath directly, so it stays free of Node
// builtins. The Vite plugin lives behind `octane/compiler/vite` (and
// `@octanejs/vite-plugin`), which is where its `node:fs`/`node:path` graph
// belongs.
export { compile } from './compile.js';
export { VALDI_COMPILER_ABI_VERSION } from './compile-valdi.js';
export { analyzeNativeChangeDiagnostics as __analyzeNativeChangeDiagnostics } from './native-change-diagnostics.js';
export { compileToVolarMappings } from './volar.js';
