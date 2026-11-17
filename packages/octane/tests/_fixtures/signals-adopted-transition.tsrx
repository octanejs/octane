import { useLayoutEffect } from 'octane';
import { query$, type Resource, type SignalHandle, type WritableSignal } from 'octane/signals';

function RouteView(props: { location$: SignalHandle<string>; value$: SignalHandle<string> }) @{
	<section>
		<b>{props.location$.get() as string}</b>
		<output>{props.value$.get() as string}</output>
	</section>
}

/** A route whose loader data is an explicit resource over a location signal. */
export function ExplicitRoute(props: {
	location$: WritableSignal<string>;
	resource$: Resource<string>;
	/** Runs in the hydrating layout phase, while the adoption frame is still held. */
	onLayout?: () => void;
}) @{
	useLayoutEffect(() => props.onLayout?.(), []);
	<main>
		@try {
			<RouteView location$={props.location$} value$={props.resource$} />
		} @pending {
			<i class="pending">{'waiting'}</i>
		} @catch (error) {
			<i class="caught">{(error as Error).message}</i>
		}
	</main>
}

/** A route whose loader data is an owner-optional query selected by a location signal. */
export function OwnedRoute(props: {
	location$: WritableSignal<string>;
	load: (key: string, context: { signal: AbortSignal }) => Promise<string> | AsyncIterable<string>;
	kind?: 'stream';
}) @{
	const value$ = query$(
		() => props.location$.get(),
		props.load,
		props.kind ? { kind: props.kind } : undefined,
	);
	<main>
		@try {
			<RouteView location$={props.location$} value$={value$} />
		} @pending {
			<i class="pending">{'waiting'}</i>
		} @catch (error) {
			<i class="caught">{(error as Error).message}</i>
		}
	</main>
}
