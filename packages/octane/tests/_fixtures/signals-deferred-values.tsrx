import type { OctaneNode } from 'octane';
import type { SignalHandle } from 'octane/signals';

export function createDeferredView$(count$: SignalHandle<number>) {
	return <p class="deferred-value" title={String(count$.get())}>{String(count$.get())}</p>;
}

export function DeferredHost(props: { view: OctaneNode; label: string }) @{
	<section>
		<span class="label">{props.label}</span>
		{props.view}
	</section>
}

export const ArrowReader = (props: { count$: SignalHandle<number> }) => {
	const value = props.count$.get();
	return <p class="arrow-value">{String(value)}</p>;
};
