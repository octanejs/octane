/** @jsxImportSource octane */
import { useCallback, useMemo } from 'octane';

export function ReturnedJsx({
	dep,
	tick,
	observe,
}: {
	dep: number;
	tick: number;
	observe: (box: { value: number; tick: number }, callback: () => number) => void;
}) {
	const box = useMemo(() => ({ value: dep, tick }), [dep]);
	observe(
		box,
		useCallback(() => dep * 1000 + tick, [dep]),
	);
	return <output>{tick + ':' + box.value}</output>;
}
