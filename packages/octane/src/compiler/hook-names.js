/** Slot-keyed builtins shared by the compiler backends. */
export const HOOK_NAMES = new Set([
	'useState',
	'useLinkedState',
	'useReducer',
	'useEffect',
	'useLayoutEffect',
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
// there, and a call with a spread takes its identity from the call path.
export const INITIAL_VALUE_HOOKS = new Set(['useState', 'useRef', 'useLazyRef']);

// Optional integration hooks are recognized by import provenance only. A $
// suffix does not add builtin semantics to unrelated functions or old bindings.
export const NATIVE_SIGNAL_HOOK_NAMES = new Set(['useSignal$']);
