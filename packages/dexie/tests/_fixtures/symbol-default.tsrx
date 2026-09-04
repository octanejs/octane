import { useLiveQuery, useObservable } from '@octanejs/dexie';
import type { InteropableObservable } from '@octanejs/dexie';

type ObservableProps = {
	observable: InteropableObservable<string>;
	defaultResult: symbol;
};

export function ObservableSymbolDefault({ observable, defaultResult }: ObservableProps) @{
	const value = useObservable(observable, defaultResult);
	<output>{String(value)}</output>
}

export function FactorySymbolDefault({ observable, defaultResult }: ObservableProps) @{
	const value = useObservable(() => observable, [observable], defaultResult);
	<output>{String(value)}</output>
}

export function LiveQuerySymbolDefault({
	querier,
	defaultResult,
}: {
	querier: () => Promise<string>;
	defaultResult: symbol;
}) @{
	const value = useLiveQuery(querier, [querier], defaultResult);
	<output>{String(value)}</output>
}

const LEFT = Symbol('left');
const RIGHT = Symbol('right');

function readObservable(
	observable: InteropableObservable<string>,
	defaultResult: symbol,
	slot: symbol,
) {
	return useObservable(() => observable, [], defaultResult, slot);
}

export function ExplicitObservableDefaults({
	first,
	second,
}: {
	first: InteropableObservable<string>;
	second: InteropableObservable<string>;
}) @{
	const left = readObservable(first, LEFT, LEFT);
	const right = readObservable(second, RIGHT, RIGHT);
	<div>
		<output id="left">{String(left)}</output>
		<output id="right">{String(right)}</output>
	</div>
}
