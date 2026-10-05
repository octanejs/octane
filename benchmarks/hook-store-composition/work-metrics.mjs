// Precise call coverage sees only function names in the unminified production
// bundle, so each metric must name the runtime helper that performs that work
// today. `work-metrics.test.mjs` keeps the composed-slot probe on the helper the
// client runtime's composed `resolveSlot` branch actually calls.
export const COMPOSED_SLOT_HELPER = 'resolveHookPath';

export const WORK_METRICS = [
	'useCallback',
	'useMemo',
	'resolveHookArgs',
	'resolveSlot',
	COMPOSED_SLOT_HELPER,
	'withSlot',
];
