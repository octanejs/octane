/**
 * Octane-owned re-export of the shared TSRX iterable helper.
 *
 * The volar `typeOnly` virtual TSX lowers `@for` blocks through
 * `map_iterable`; pointing the platform's `forOfIterableHelper` at THIS
 * subpath (instead of `@tsrx/core/runtime/iterable` directly) makes the
 * import — and its types — resolvable from every octane consumer, because
 * `@tsrx/core` is octane's own dependency, not the app's.
 */
export { map_iterable, type IterationValue } from '@tsrx/core/runtime/iterable';
