/** @jsxImportSource octane */
import { useAliasedState } from './hook-alias';
export function usePair() {
	return [useAliasedState('first'), useAliasedState('second')];
}
