import { Hydrate, use, useEffect, useId } from 'octane';

function DeferredReviews(props) @{
	const id = useId();
	props.onRender?.();
	useEffect(() => {
		props.onEffect?.('mount');
		return () => props.onEffect?.('cleanup');
	}, []);
	<section id="reviews" data-runtime-id={id}>
		<label for="review-draft">{'Draft review'}</label>
		<input id="review-draft" defaultValue="server draft" />
		<button
			id="review-action"
			ref={props.onRef}
			onClick={() => props.onDeferredClick?.(id)}
		>{'Submit review'}</button>
	</section>
}

function EagerSibling(props) @{
	const id = useId();
	<button
		id="eager-action"
		data-runtime-id={id}
		onClick={() => props.onEagerClick?.(id)}
	>{'Eager action'}</button>
}

export function DeferredHydration(props) @{
	const beforeId = useId();
	<main>
		<span id="before-boundary" data-runtime-id={beforeId}>{'Before'}</span>
		<Hydrate
			when={props.when}
			prefetch={props.prefetch}
			split={false}
			fallback={<span id="deferred-fallback">{'Loading reviews'}</span>}
			onHydrated={props.onHydrated}
		>
			<DeferredReviews
				onRender={props.onRender}
				onEffect={props.onEffect}
				onRef={props.onRef}
				onDeferredClick={props.onDeferredClick}
			/>
		</Hydrate>
		<EagerSibling onEagerClick={props.onEagerClick} />
	</main>
}

function ClientOnlySuspendingChild(props) @{
	const value = use(props.promise);
	<button id="client-only-content" onClick={() => props.onClick?.(value)}>{value as string}</button>
}

export function ClientOnlyHydrate(props) @{
	<section id="client-only-host">
		@if (props.show) {
			<Hydrate
				when={props.when}
				split={false}
				fallback={<span id="client-only-fallback">{'Loading client content'}</span>}
				onHydrated={props.onHydrated}
			>
				<ClientOnlySuspendingChild promise={props.promise} onClick={props.onClick} />
			</Hydrate>
		}
	</section>
}

function DeferredSeed(props) @{
	const value = use(props.promise);
	const id = useId();
	<button
		id="deferred-seed"
		data-runtime-id={id}
		onClick={() => props.onClick?.(value, id)}
	>{value as string}</button>
}

function EagerSeed(props) @{
	const value = use(props.promise);
	const id = useId();
	<button
		id="eager-seed"
		data-runtime-id={id}
		onClick={() => props.onClick?.(value, id, props.beforeId)}
	>{value as string}</button>
}

export function DeferredSeedHydration(props) @{
	const beforeId = useId();
	<section id="seed-order">
		<span id="seed-before" data-runtime-id={beforeId}>{'Before seeds'}</span>
		<Hydrate when={props.when} split={false}>
			<DeferredSeed promise={props.deferredPromise} onClick={props.onDeferredClick} />
		</Hydrate>
		<EagerSeed promise={props.eagerPromise} beforeId={beforeId} onClick={props.onEagerClick} />
	</section>
}

export function NestedInteractionHydration(props) @{
	<Hydrate when={props.outerWhen} split={false} onHydrated={props.onOuterHydrated}>
		<section id="interaction-parent">
			<Hydrate when={props.innerWhen} split={false} onHydrated={props.onInnerHydrated}>
				<button id="interaction-target" onClick={props.onTargetClick}>{'Open reviews'}</button>
			</Hydrate>
		</section>
	</Hydrate>
}
