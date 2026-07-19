// The hook variant of `scan()`. The one octane-specific detail is hook
// slots: the consumer's compiler appends the call-site slot Symbol as the
// LAST argument of every `use*` call, so `useScan()` receives it in options
// position and `useScan(options)` receives it appended — resolved from the
// tail exactly like every base hook, then forwarded to `useEffect` so this
// wrapper composes like a normal custom hook (see package.json's
// `octane.hookSlots.manual`).
import { useEffect } from 'octane';
import { session } from './default-session.js';
import type { Options } from './services/options.js';

export function useScan(options?: Partial<Options>): void;
export function useScan(...args: [options?: Partial<Options>, slot?: symbol]): void {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const head = args[0];
	const options =
		typeof head === 'object' && head !== null ? (head as Partial<Options>) : undefined;
	// Keyed on `options` (not `[]`) so later changes to the argument reach the
	// session, matching a direct `setOptions`/`scan()` call. `enabled: true` is
	// intentional and idempotent: like `scan()`, `useScan` is an active
	// "start scanning" call, so re-applying its options keeps scanning on.
	useEffect(
		() => {
			session.setOptions({ enabled: true, ...options });
		},
		[options],
		slot,
	);
}
