import { useCallback, useMemo } from 'octane';
import { useManualPair } from './manual-hooks';
import { usePlainBox, usePlainCallback, usePlainExplicitPair } from './plain-hooks';

type Box = { value: number; tick: number };
type Callback = () => number;
type Observe = (box: Box, callback: Callback) => void;
type Props = { dep: number; tick: number; enabled: boolean; observe: Observe };

function publish(observe: Observe, box: Box, callback: Callback): number {
	observe(box, callback);
	return box.value;
}

export function Declaration({ dep, tick, observe }: Props) @{
	const box = useMemo(() => ({ value: dep, tick }), [dep]);
	const callback = useCallback(() => dep * 1000 + tick, [dep]);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

export function IdentifierDeps({ dep, tick, observe }: Props) @{
	const deps = [dep];
	const box = useMemo(() => ({ value: dep, tick }), deps);
	const callback = useCallback(() => dep * 1000 + tick, deps);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

function useReturnedBox(dep: number, tick: number): Box {
	return useMemo(() => ({ value: dep, tick }), [dep]);
}

function useReturnedCallback(dep: number, tick: number): Callback {
	return useCallback(() => dep * 1000 + tick, [dep]);
}

export function DirectReturn({ dep, tick, observe }: Props) @{
	const box = useReturnedBox(dep, tick);
	const callback = useReturnedCallback(dep, tick);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

export function NestedExpression({ dep, tick, observe }: Props) @{
	const value = publish(
		observe,
		useMemo(() => ({ value: dep, tick }), [dep]),
		useCallback(() => dep * 1000 + tick, [dep]),
	);
	<output>{tick + ':' + value}</output>
}

export function Destructured({ dep, tick, observe }: Props) @{
	const { box, callback } = useMemo(
		() => ({
			box: { value: dep, tick },
			callback: () => dep * 1000 + tick,
		}),
		[dep],
	);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

function usePair(dep: number, tick: number) {
	const box = useMemo(() => ({ value: dep, tick }), [dep]);
	const callback = useCallback(() => dep * 1000 + tick, [dep]);
	return { box, callback };
}

export function CustomHook({ dep, tick, observe }: Props) @{
	const first = usePair(dep, tick);
	const second = usePair(dep + 1, tick);
	observe(first.box, first.callback);
	observe(second.box, second.callback);
	<output>{tick + ':' + first.box.value + ',' + second.box.value}</output>
}

const EXPLICIT_MEMO = Symbol('hook-memo-bench:value');
const EXPLICIT_CALLBACK = Symbol('hook-memo-bench:callback');

export function ExplicitSlot({ dep, tick, observe }: Props) @{
	const box = useMemo(() => ({ value: dep, tick }), [dep], EXPLICIT_MEMO);
	const callback = useCallback(() => dep * 1000 + tick, [dep], EXPLICIT_CALLBACK);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

export function PlainHook({ dep, tick, observe }: Props) @{
	const box = usePlainBox(dep, tick);
	const callback = usePlainCallback(dep, tick);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

export function PlainExplicitSlot({ dep, tick, observe }: Props) @{
	const first = usePlainExplicitPair(dep, tick);
	const second = usePlainExplicitPair(dep + 1, tick);
	observe(first.box, first.callback);
	observe(second.box, second.callback);
	<output>{tick + ':' + first.box.value + ',' + second.box.value}</output>
}

export function ManualSlotHook({ dep, tick, observe }: Props) @{
	const first = useManualPair(dep, tick);
	const second = useManualPair(dep + 1, tick);
	observe(first.box, first.callback);
	observe(second.box, second.callback);
	<output>{tick + ':' + first.box.value + ',' + second.box.value}</output>
}

export function NullDeps({ dep, tick, observe }: Props) @{
	const box = useMemo(() => ({ value: dep, tick }), null);
	const callback = useCallback(() => dep * 1000 + tick, null);
	observe(box, callback);
	<output>{tick + ':' + box.value}</output>
}

export function Conditional({ dep, tick, enabled, observe }: Props) @{
	let value = 'off';
	if (enabled) {
		const box = useMemo(() => ({ value: dep, tick }), [dep]);
		const callback = useCallback(() => dep * 1000 + tick, [dep]);
		observe(box, callback);
		value = String(box.value);
	}
	<output>{tick + ':' + value}</output>
}
