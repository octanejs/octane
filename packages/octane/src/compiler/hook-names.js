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
	'useId',
	'useEffectEvent',
	'useImperativeHandle',
	'useDeferredValue',
	'useTransition',
	'useSyncExternalStore',
	// React 19 Actions bundle.
	'useActionState',
	'useFormStatus',
	'useOptimistic',
]);

// Optional integration hooks are recognized by import provenance only. A $
// suffix does not add builtin semantics to unrelated functions or old bindings.
export const NATIVE_SIGNAL_HOOK_NAMES = new Set(['useSignal$']);
