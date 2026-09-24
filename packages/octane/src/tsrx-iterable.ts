/**
 * Octane-owned re-export of the shared TSRX iterable helpers.
 *
 * The volar `typeOnly` virtual TSX lowers `@for` blocks through
 * `map_iterable`, or `map_iterable_async` when the loop body awaits; pointing
 * the platform's `forOfIterableHelper` at THIS subpath (instead of
 * `@tsrx/core/runtime/iterable` directly) makes the import — and its types —
 * resolvable from every octane consumer, because `@tsrx/core` is octane's own
 * dependency, not the app's.
 */
export { map_iterable, map_iterable_async, type IterationValue } from '@tsrx/core/runtime/iterable';
