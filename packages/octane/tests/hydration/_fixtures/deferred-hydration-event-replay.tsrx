import { Hydrate, type HydrateWhen } from 'octane';

type ReplayFixtureProps = { when: HydrateWhen; onHydrated?: () => void };

export function DeferredHydrationEventReplay(props: ReplayFixtureProps) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<section id="hydration-replay-parent">
			<a id="hydration-replay-target" href="#hydration-replay-default">{'Replay interaction'}</a>
			<span id="hydration-replay-related">{'Related target'}</span>
		</section>
	</Hydrate>
}

export function DeferredHydrationPressLifecycle(props: ReplayFixtureProps) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<div id="press-lifecycle">
			<button id="press-hold">{'Hold'}</button>
			<button id="press-pan">{'Pan'}</button>
		</div>
	</Hydrate>
}
