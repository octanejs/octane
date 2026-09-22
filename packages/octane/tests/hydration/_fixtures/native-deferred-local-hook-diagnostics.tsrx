import { useSignal$ } from 'octane/signals/client';
import { Hydrate, useEffect, useLayoutEffect } from 'octane';
import { createScope, type WritableSignal } from 'octane/signals';
import type { HydrateProps } from 'octane';

type Model = { hidden$: WritableSignal<boolean>; inspect: () => unknown; dispose: () => void };
type Props = {
	localInitial?: boolean | (() => boolean);
	onLocal?: (value: WritableSignal<boolean>) => void;
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
function Control({
	localInitial,
	onLocal,
	identity,
	hidden,
	model,
	onRender,
	onRef,
	onEffect,
}: Props) @{
	const projectedHidden =
		model ? model.hidden$.get() : hidden;
	onRender?.();
	const local$ = useSignal$(localInitial ?? false);
	onLocal?.(local$);
	useLayoutEffect(() => {
		onEffect?.('layout-mount');
		return () => onEffect?.('layout-cleanup');
	});
	useEffect(() => {
		onEffect?.('passive-mount');
		return () => onEffect?.('passive-cleanup');
	});
	<button
		ref={onRef}
		id="synthetic-control"
		hidden={projectedHidden}
		data-identity={identity}
		onClick={() => local$.set((value) => !value)}
	>
		Action<span id="synthetic-local-status" hidden={!local$.get()}>Status</span>
	</button>
}
export function Boundary({
	localInitial,
	onLocal,
	when,
	identity,
	hidden,
	model,
	onRender,
	onRef,
	onEffect,
}: Props) @{
	<Hydrate split={false} when={when}>
		<Control
			localInitial={localInitial}
			onLocal={onLocal}
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
	localInitial,
	onLocal,
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
			localInitial={localInitial}
			onLocal={onLocal}
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
