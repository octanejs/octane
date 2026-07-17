import { Hydrate, useEffect, useLayoutEffect, useState } from 'octane';

function SplitReviews(props) @{
	useEffect(() => {
		props.onEffect?.(props.label);
	}, []);
	<button
		id="split-review-action"
		data-captured-label={props.label}
		onClick={() => props.onClick?.(props.label)}
	>
		{props.label as string}
	</button>
}

function LastSplitReviews() @{
	<span id="last-split-review">Last split review</span>
}

export function SplitHydration(props) @{
	const capturedLabel = 'captured:' + props.label;
	<main id="split-hydration-host">
		<Hydrate when={props.when} prefetch={props.prefetch} onHydrated={props.onHydrated}>
			<SplitReviews
				label={capturedLabel}
				onEffect={props.onEffect}
				onClick={props.onDeferredClick}
			/>
		</Hydrate>
		<button id="split-eager-action" onClick={props.onEagerClick}>{'Eager'}</button>
	</main>
}

export function LastSplitHydration(props) @{
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		setReady(true);
		props.onEagerEffect?.();
	}, []);
	<main id="last-split-host" data-ready={ready ? 'yes' : 'no'}>
		<button id="last-split-eager" onClick={props.onEagerClick}>Eager</button>
		<Hydrate when={props.when}>
			<LastSplitReviews />
		</Hydrate>
	</main>
}

function SplitClientOnlyContent(props) @{
	<button id="split-client-only-content" onClick={props.onClick}>{'Split client content'}</button>
}

export function ClientOnlySplitHydration(props) @{
	<main id="split-client-only-host">
		@if (props.show) {
			<Hydrate
				when={props.when}
				fallback={<p id="split-client-only-fallback">{'Loading split content'}</p>}
				onHydrated={props.onHydrated}
			>
				<SplitClientOnlyContent onClick={props.onClick} />
			</Hydrate>
		}
	</main>
}

export function RepeatedSplitHydration(props) @{
	<section id="repeated-split-host">
		@for (const item of props.items; key item.id) {
			<Hydrate when={props.when} onHydrated={() => props.onHydrated?.(item.id)}>
				<button
					class="repeated-split-action"
					data-item-id={item.id}
					onClick={() => props.onClick?.(item.id)}
				>
					{item.label as string}
				</button>
			</Hydrate>
		}
	</section>
}
