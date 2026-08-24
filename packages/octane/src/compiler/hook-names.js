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
