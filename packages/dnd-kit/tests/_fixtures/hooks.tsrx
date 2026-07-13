import { signal } from '@dnd-kit/state';
import {
	useComputed,
	useConstant,
	useDeepSignal,
	useImmediateEffect,
	useIsomorphicLayoutEffect,
	useLatest,
	useOnElementChange,
	useOnValueChange,
} from '@octanejs/dnd-kit/hooks';

export const sharedSignal = signal(1);

export function HooksFixture(props) @{
	const first = useConstant(() => {
		props.log('constant:first');
		return { value: 'first' };
	});
	const second = useConstant(() => {
		props.log('constant:second');
		return { value: 'second' };
	});
	const latest = useLatest(props.value);
	const computed = useComputed(
		() => sharedSignal.value * props.multiplier,
		[props.multiplier],
		props.synchronous,
	);
	const deep = useDeepSignal(sharedSignal);
	const maybeDeep = useDeepSignal(props.deepEnabled ? sharedSignal : null);

	useImmediateEffect(() => props.log(`immediate:${props.value}`), [props.value]);
	useIsomorphicLayoutEffect(() => props.log(`layout:${props.value}`), [props.value]);
	useOnValueChange(props.value, (value, previous) => props.log(`value:${previous}->${value}`));
	useOnElementChange(props.element, (element) => props.log(`element:${element?.id ?? 'none'}`));

	<button
		id="read-latest"
		onClick={() => props.captureLatest(latest.current)}
		data-first={first.value}
		data-second={second.value}
	>
		<span id="computed">
			{String(computed.value) as string}
		</span>
		<span id="deep">
			{String(deep.value) as string}
		</span>
		<span id="maybe-deep">
			{String(maybeDeep?.value ?? 'none') as string}
		</span>
	</button>
}
