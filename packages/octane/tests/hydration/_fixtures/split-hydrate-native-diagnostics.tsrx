import { Hydrate, useEffect, useLayoutEffect } from 'octane';
import { createScope, type WritableSignal } from 'octane/signals';
import type { HydrateProps } from 'octane';

type Model = { hidden$: WritableSignal<boolean>; inspect: () => unknown; dispose: () => void };
type Props = {
	when: HydrateProps['when'];
	identity: string | null;
	hidden: boolean;
	model?: Model;
	onRender?: () => void;
	onRef?: (node: HTMLButtonElement | null) => void;
	onEffect?: (phase: string) => void;
};
export function createModel$(hidden: boolean): Model {
	const scope = createScope({ scopeKey: 'deferred-synthetic' });
	return {
		hidden$: scope.signal$('hidden', hidden),
		inspect: () => scope.inspect(),
		dispose: () => scope.dispose(),
	};
}
function Control({ identity, hidden, model, onRender, onRef, onEffect }: Props) @{
	const projectedHidden =
		model ? model.hidden$.get() : hidden;
	onRender?.();
	useLayoutEffect(() => {
		onEffect?.('layout-mount');
		return () => onEffect?.('layout-cleanup');
	});
	useEffect(() => {
		onEffect?.('passive-mount');
		return () => onEffect?.('passive-cleanup');
	});
	<button ref={onRef} id="synthetic-control" hidden={projectedHidden} data-identity={identity}>
		Action
	</button>
}
export function Boundary({ when, identity, hidden, model, onRender, onRef, onEffect }: Props) @{
	<Hydrate split={false} when={when}>
		<Control
			when={when}
			identity={identity}
			hidden={hidden}
			model={model}
			onRender={onRender}
			onRef={onRef}
			onEffect={onEffect}
		/>
	</Hydrate>
}

export function SplitBoundary({
	when,
	identity,
	hidden,
	model,
	onRender,
	onRef,
	onEffect,
}: Props) @{
	<Hydrate when={when}>
		<Control
			when={when}
			identity={identity}
			hidden={hidden}
			model={model}
			onRender={onRender}
			onRef={onRef}
			onEffect={onEffect}
		/>
	</Hydrate>
}
