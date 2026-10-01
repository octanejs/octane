import { Hydrate, type HydrateProps, use } from 'octane';

type ReplayProps = { when: HydrateProps['when']; onHydrated?: () => void };
type NestedReplayProps = {
	outerWhen: HydrateProps['when'];
	innerWhen: HydrateProps['when'];
	onOuterHydrated?: () => void;
	onHydrated?: () => void;
};

export function DeferredHydrationEventReplay(props: ReplayProps) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<section id="hydration-replay-parent">
			<a id="hydration-replay-target" href="#hydration-replay-default">{'Replay interaction'}</a>
			<span id="hydration-replay-related">{'Related target'}</span>
		</section>
	</Hydrate>
}

export function NestedDeferredHydrationEventReplay(props: NestedReplayProps) @{
	<Hydrate when={props.outerWhen} split={false} onHydrated={props.onOuterHydrated}>
		<section id="hydration-replay-parent">
			<Hydrate when={props.innerWhen} split={false} onHydrated={props.onHydrated}>
				<a id="hydration-replay-target" href="#hydration-replay-default">{'Replay interaction'}</a>
				<span id="hydration-replay-related">{'Related target'}</span>
			</Hydrate>
		</section>
	</Hydrate>
}

export function DeferredHydrationPressLifecycle(props: ReplayProps) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<div id="press-lifecycle">
			<button id="press-hold">{'Hold'}</button>
			<button id="press-pan">{'Pan'}</button>
		</div>
	</Hydrate>
}

type AncestorActivationProps = {
	outerWhen: HydrateProps['when'];
	innerWhen: HydrateProps['when'];
	suspend: boolean;
	promise?: Promise<void>;
	onOuterHydrated?: () => void;
};

function SuspendingAncestorChild(props: { suspend: boolean; promise?: Promise<void> }) @{
	if (props.suspend) use(props.promise!);
	<span id="press-ancestor-content">{'Ancestor content'}</span>
}

export function AncestorActivationPressLifecycle(props: AncestorActivationProps) @{
	<Hydrate when={props.outerWhen} split={false} onHydrated={props.onOuterHydrated}>
		<SuspendingAncestorChild suspend={props.suspend} promise={props.promise} />
		<Hydrate when={props.innerWhen} split={false}>
			<button id="press-ancestor-hover">{'Hover'}</button>
		</Hydrate>
	</Hydrate>
}
