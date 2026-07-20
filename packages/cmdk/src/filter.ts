// Framework-free default filter. Kept out of the .tsrx component module so the
// scorer/filter can be imported without pulling in the octane renderer (the
// unit tests run in a plain node environment).
import { commandScore } from './command-score';

/**
 * The default scoring filter used by `Command` when no custom `filter` is
 * provided. Mirrors cmdk's `defaultFilter`: a positive score means the value
 * matches the search; `0` means no match. `keywords` (aliases) are folded into
 * the scored string.
 */
export function defaultFilter(value: string, search: string, keywords?: string[]): number {
	return commandScore(value, search, keywords ?? []);
}
