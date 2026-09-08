import { useCallback } from 'octane';
import type { BenchmarkModel, Callback } from './model';

function useCallbackLeaf(
	report: BenchmarkModel['reportCallback'],
	index: number,
	value: number,
	dependencies: number[],
): Callback {
	const callback: Callback = useCallback(
		() => report(index, value + index, callback),
		dependencies,
	);
	return callback;
}

// This module goes through the full TSRX compiler. Both custom-hook calls own
// call-site paths; the leaf retains its own compiler-assigned base-hook slot.
export function useNestedCallback(
	report: BenchmarkModel['reportCallback'],
	index: number,
	value: number,
	dependencies: number[],
): Callback {
	return useCallbackLeaf(report, index, value, dependencies);
}
