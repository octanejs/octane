import { Hydrate, useLayoutEffect, useRef } from 'octane';
import type { HydrateWhen } from 'octane/hydration';
import type { Resource, Scope, WritableSignal } from 'octane/signals';

export interface NativeHydrationState {
	scope: Scope;
	value$: WritableSignal<string>;
	log?: (value: string) => void;
}

export function SignalHydration(props: NativeHydrationState) @{
	const value = props.scope.get(props.value$);
	const output = useRef<HTMLOutputElement | null>(null);
	useLayoutEffect(() => {
		props.log?.(value + ':' + output.current?.textContent + ':' + props.scope.get(props.value$));
	}, [value, props.log]);
	<section>
		<output ref={output}>{value}</output>
		<input defaultValue="server draft" />
	</section>
}

export function LatestHydration(props: { resource$: Resource<string>; fallback: string }) @{
	<output>{props.resource$.latest(props.fallback) as string}</output>
}

export function ChannelsHydration(props: NativeHydrationState) @{
	const value = props.scope.get(props.value$);
	const snapshot = props.value$.snapshot();
	const snapshotValue =
		snapshot.status === 'ready' ? snapshot.value : snapshot.status;
	<output>{value + '/' + snapshotValue}</output>
}

export function DuplicateOwnerHydration(props: {
	first: NativeHydrationState;
	second: NativeHydrationState;
}) @{
	<section>
		<SignalHydration scope={props.first.scope} value$={props.first.value$} />
		<SignalHydration scope={props.second.scope} value$={props.second.value$} />
	</section>
}

export function SnapshotHydration(props: { resource$: Resource<string> }) @{
	<output>{props.resource$.snapshot().status}</output>
}

function NativeResourceHydration(props: {
	resource$: Resource<string>;
	log?: (value: string) => void;
}) @{
	const value = props.resource$.get();
	useLayoutEffect(() => {
		props.log?.('resource:' + value);
	}, [value, props.log]);
	<output class="resource">{value}</output>
}

export function NativeBoundaryHydration(props: NativeHydrationState & {
	resource$: Resource<string>;
	resourceLog?: (value: string) => void;
}) @{
	<section>
		@try {
			<NativeResourceHydration resource$={props.resource$} log={props.resourceLog} />
		} @pending {
			<i class="pending">{'waiting'}</i>
		} @catch (_error) {
			<i class="caught">{'caught'}</i>
		}
		<SignalHydration scope={props.scope} value$={props.value$} log={props.log} />
	</section>
}

export function DeferredNativeHydration(props: NativeHydrationState & { when: HydrateWhen }) @{
	<section>
		<p class="outside">{'outside'}</p>
		<Hydrate when={props.when} split={false}>
			<SignalHydration scope={props.scope} value$={props.value$} log={props.log} />
		</Hydrate>
	</section>
}

export function ControlledSignalHydration(props: NativeHydrationState) @{
	const value = props.scope.get(props.value$);
	<input
		value={value}
		onInput={(event: Event) => {
			props.scope.set(props.value$, (event.currentTarget as HTMLInputElement).value);
		}}
	/>
}

export function DeferredControlledSignalHydration(props: NativeHydrationState & {
	when: HydrateWhen;
}) @{
	<Hydrate when={props.when} split={false}>
		<ControlledSignalHydration scope={props.scope} value$={props.value$} />
	</Hydrate>
}
