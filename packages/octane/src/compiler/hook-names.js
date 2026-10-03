/** Slot-keyed builtins shared by the compiler backends. */
export const HOOK_NAMES = new Set([
	'useState',
	'useLinkedState',
	'useReducer',
	'useEffect',
	'useLayoutEffect',
	'useLayoutSnapshot',
	'useInsertionEffect',
	'useMemo',
	'useCallback',
	'useRef',
	'useLazyRef',
	'useId',
	'useEffectEvent',
	'useImperativeHandle',
	'useDeferredValue',
	'useTransition',
	'useSyncExternalStore',
	// React 19 Actions bundle.
	'useActionState',
	'useFormState',
	'useFormStatus',
	'useOptimistic',
]);

// Builtins that return the same mutable `{ current }` object for the lifetime
// of their hook cell.
export const REF_HOOKS = new Set(['useRef', 'useLazyRef']);

// Builtins whose first argument is an initial value or initializer. A compiler
// slot never takes that position: an empty call keeps an explicit `undefined`
// there.
export const INITIAL_VALUE_HOOKS = new Set(['useState', 'useRef', 'useLazyRef']);

// Builtins whose trailing slot could land in an authored position when the call
// spreads its arguments (an initializer, or useLayoutSnapshot's optional
// options), so such a call takes its identity from the call path instead.
export const SPREAD_PATH_SLOT_HOOKS = new Set([...INITIAL_VALUE_HOOKS, 'useLayoutSnapshot']);

// Optional integration hooks are recognized by import provenance only. A $
// suffix does not add builtin semantics to unrelated functions or old bindings.
export const NATIVE_SIGNAL_HOOK_NAMES = new Set(['useSignal$']);
