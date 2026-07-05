// Ported from @base-ui/utils/empty: shared frozen empties + NOOP, compared by identity across the
// codebase (a stable reference lets effects/memos bail out). NOOP re-exports the existing shared
// one so there is a single identity.
export { NOOP } from './noop';

export const EMPTY_OBJECT = {} as Record<string, never>;
export const EMPTY_ARRAY = [] as never[];
