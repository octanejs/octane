import {
	ErrorBoundary,
	Hydrate,
	type HydrateProps,
	type HydrationPrefetchFunction,
	ViewTransition,
	use,
	useEffect,
	useLayoutEffect,
	useSyncExternalStore,
} from 'octane';

function ContractButton(props) @{
	<button id={props.id} onClick={props.onClick}>{props.label as string}</button>
}

export function EarlyInteractionHydration(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<ContractButton id="early-interaction" label="Interact" onClick={props.onClick} />
	</Hydrate>
}

export function ProceduralPrefetchHydration(props) @{
	<Hydrate when={props.when} split={false} prefetch={props.prefetch} onHydrated={props.onHydrated}>
		<ContractButton id="procedural-prefetch" label="Prefetched" />
	</Hydrate>
}

function ActivationSuspendingChild(props) @{
	if (props.suspend) use(props.promise);
	<button id="activation-content" onClick={props.onClick}>{'Server reviews'}</button>
}

export function ActivationSuspendingHydration(props) @{
	<>
		<span id="activation-shell">{props.shellLabel as string}</span>
		<Hydrate
			when={props.when}
			split={false}
			fallback={<span id="activation-fallback">{'Client fallback'}</span>}
			onHydrated={props.onHydrated}
		>
			<ActivationSuspendingChild
				suspend={props.suspend}
				promise={props.promise}
				onClick={props.onClick}
			/>
		</Hydrate>
	</>
}

function ActivationSuspendingEditor(props) @{
	if (props.suspend) use(props.promise);
	<input
		id="activation-editor"
		defaultValue="Server draft"
		onInput={props.onInput}
		onCompositionStart={props.onCompositionStart}
		onCompositionEnd={props.onCompositionEnd}
	/>
}

export function ActivationSuspendingEditorHydration(props) @{
	<Hydrate
		when={props.when}
		split={false}
		fallback={<span id="activation-editor-fallback">{'Loading editor'}</span>}
		onHydrated={props.onHydrated}
	>
		<ActivationSuspendingEditor
			suspend={props.suspend}
			promise={props.promise}
			onInput={props.onInput}
			onCompositionStart={props.onCompositionStart}
			onCompositionEnd={props.onCompositionEnd}
		/>
	</Hydrate>
}

function PartiallyAdoptedEditor(props) @{
	if (props.store) {
		useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot);
	}
	useLayoutEffect(() => {
		props.onLayout?.('mount');
		return () => props.onLayout?.('cleanup');
	}, []);
	useEffect(() => {
		props.onPassive?.('mount');
		return () => props.onPassive?.('cleanup');
	}, []);
	<input
		id="partial-editor"
		class={props.className}
		defaultValue="Partial server draft"
		ref={props.onRef}
		onInput={props.onInput}
	/>
}

function PartiallyAdoptedSuffix(props) @{
	if (props.suspend) use(props.promise);
	<button id="partial-suspended-suffix" onClick={props.onClick}>{'Resolved suffix'}</button>
}

export function PartiallyAdoptedSuspendingHydration(props) @{
	<>
		<span id="partial-outer-before">{'Outer before'}</span>
		<Hydrate
			when={props.when}
			split={false}
			fallback={<span id="partial-fallback">{'Loading partial boundary'}</span>}
			onHydrated={props.onHydrated}
		>
			<section id="partial-section" class={props.className}>
				<span id="partial-before">{'Before editor'}</span>
				<PartiallyAdoptedEditor
					className={props.className}
					store={props.store}
					onLayout={props.onLayout}
					onPassive={props.onPassive}
					onRef={props.onRef}
					onInput={props.onInput}
				/>
				@if (props.nestedWhen) {
					<Hydrate when={props.nestedWhen} split={false} onHydrated={props.onNestedHydrated}>
						<span id="partial-nested">{'Nested dormant content'}</span>
					</Hydrate>
				}
				<PartiallyAdoptedSuffix
					suspend={props.suspend}
					promise={props.promise}
					onClick={props.onClick}
				/>
				<span id="partial-after">{'After suffix'}</span>
			</section>
		</Hydrate>
		<span id="partial-outer-after">{'Outer after'}</span>
	</>
}

export function ErrorCatchingPartiallyAdoptedSuspendingHydration(props) @{
	<ErrorBoundary fallback={<span id="partial-error">{'Hydration failed'}</span>}>
		<PartiallyAdoptedSuspendingHydration
			when={props.when}
			nestedWhen={props.nestedWhen}
			suspend={props.suspend}
			promise={props.promise}
			className={props.className}
			store={props.store}
			onLayout={props.onLayout}
			onPassive={props.onPassive}
			onRef={props.onRef}
			onHydrated={props.onHydrated}
			onNestedHydrated={props.onNestedHydrated}
			onClick={props.onClick}
		/>
	</ErrorBoundary>
}

function TransitionHydrationSuffix(props: {
	suspend: boolean;
	promise: Promise<void>;
	label: string;
}) @{
	if (props.suspend) use(props.promise);
	<span id="transition-hydration-suffix">{props.label as string}</span>
}

export function TransitionHydration(props: {
	show: boolean;
	when: HydrateProps['when'];
	prefetch?: HydrationPrefetchFunction;
	suspend: boolean;
	promise: Promise<void>;
	label: string;
}) @{
	<ViewTransition>
		<main>
			@if (props.show) {
				<Hydrate when={props.when} prefetch={props.prefetch} split={false}>
					<button id="transition-hydration-child">{'Dormant server content'}</button>
				</Hydrate>
			}
			<TransitionHydrationSuffix
				suspend={props.suspend}
				promise={props.promise}
				label={props.label}
			/>
		</main>
	</ViewTransition>
}
