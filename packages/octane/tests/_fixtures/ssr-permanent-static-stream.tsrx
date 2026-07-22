import { Hydrate, Suspense, use } from 'octane';
import { never } from 'octane/hydration';

function PermanentStaticStreamedValue(props) @{
	const value = use(props.promise);
	<span id="permanent-static-stream-value">{value as string}</span>
}

export function DeferredWithPermanentStaticStream(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<section id="deferred-permanent-static-shell">
			<Hydrate when={never()} split={false}>
				<Suspense
					fallback={<span id="permanent-static-stream-value">{'Loading static stream'}</span>}
				>
					<PermanentStaticStreamedValue promise={props.promise} />
				</Suspense>
			</Hydrate>
			<button
				id="deferred-permanent-static-action"
				onClick={props.onClick}
			>{'Activate outer'}</button>
		</section>
	</Hydrate>
}

function ThrowingPermanentStaticValue(props) @{
	throw props.error;
	<span id="permanent-static-unreachable">{'unreachable'}</span>
}

export function PermanentStaticSyncCaught(props) @{
	<main id="permanent-static-sync-shell">
		@try {
			<Hydrate when={never()} split={false}>
				<ThrowingPermanentStaticValue error={props.error} />
			</Hydrate>
		} @catch (error) {
			<p id="permanent-static-sync-catch">{error.message as string}</p>
		}
	</main>
}

export function PermanentStaticRejectedStream(props) @{
	<main id="permanent-static-rejected-shell">
		<Hydrate when={never()} split={false}>
			<Suspense fallback={<span id="permanent-static-rejected-fallback">{'Static fallback'}</span>}>
				<PermanentStaticStreamedValue promise={props.promise} />
			</Suspense>
		</Hydrate>
	</main>
}

export function PermanentStaticCaughtStream(props) @{
	<main id="permanent-static-caught-shell">
		<Hydrate when={never()} split={false}>
			@try {
				const value = use(props.promise);
				<span id="permanent-static-caught-value">{value as string}</span>
			} @pending {
				<span id="permanent-static-caught-fallback">{'Caught fallback'}</span>
			} @catch (error) {
				<span id="permanent-static-caught-error">{error.message as string}</span>
			}
		</Hydrate>
	</main>
}
