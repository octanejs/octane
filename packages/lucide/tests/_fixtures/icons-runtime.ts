// Keep the behavioral fixture on the exact implementation modules it exercises.
// Root-barrel completeness and per-icon export wiring are covered separately by
// exports.test.ts; importing that ~2k-module barrel here makes an unbundled test
// pay for every unrelated icon. The React precompile writes a cache-local module
// with this same surface backed by lucide-react.
export { default as Camera } from '../../src/icons/camera.js';
export { default as CircleAlert } from '../../src/icons/circle-alert.js';
export { default as Search } from '../../src/icons/search.js';
export { default as Icon } from '../../src/Icon.js';
export { LucideProvider } from '../../src/context.js';
