import { Hydrate } from 'octane';

export function DeferredHydrationEventReplay(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<section id="hydration-replay-parent">
			<a id="hydration-replay-target" href="#hydration-replay-default">{'Replay interaction'}</a>
			<span id="hydration-replay-related">{'Related target'}</span>
		</section>
	</Hydrate>
}
