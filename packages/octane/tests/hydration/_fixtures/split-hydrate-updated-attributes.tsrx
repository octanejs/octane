import {
	act,
	createContext,
	createPortal,
	flushSync,
	hydrateRoot,
	Hydrate,
	useLayoutEffect,
	useContext,
	useId,
	useMemo,
	useState,
	type HydrationPrefetchFunction,
	type HydrateProps,
} from 'octane';

type Props = {
	when: HydrateProps['when'];
	innerWhen?: HydrateProps['when'];
	portalTarget?: HTMLElement;
	stylesheetIdentity?: string;
	contextValue?: string;
	opacity?: number;
	suppressHydrationWarning?: boolean;
	prefetch?: HydrationPrefetchFunction;
	identity: string | null;
	hidden: boolean;
	onHydrated?: () => void;
	onEffect?: (phase: 'mount' | 'cleanup', identity: string | null, hidden: boolean) => void;
	onRef?: (node: HTMLButtonElement | null) => void;
	onClick?: (identity: string | null) => void;
};

const DiagnosticContext = createContext('outside');

function Controls(props: Props) @{
	const id = useId();
	const contextValue = useContext(DiagnosticContext);
	const [count, setCount] = useState(0);
	const [initialIdentity] = useState(() => props.identity);
	const initialVisibility = useMemo(() => (props.hidden ? 'hidden' : 'visible'), []);
	useLayoutEffect(() => {
		props.onEffect?.('mount', props.identity, props.hidden);
		return () => props.onEffect?.('cleanup', props.identity, props.hidden);
	}, []);
	<section
		id="updated-capture-controls"
		class={props.identity ? 'identified' : null}
		style={{ opacity: props.opacity ?? (props.hidden ? 0.5 : 1) }}
		suppressHydrationWarning={props.suppressHydrationWarning}
		data-runtime-id={id}
		data-context={contextValue}
		data-probe-id={props.identity}
		data-initial-id={initialIdentity}
		data-initial-visibility={initialVisibility}
	>
		<input id="updated-capture-draft" defaultValue="server draft" />
		<button
			id="updated-capture-action"
			hidden={props.hidden}
			ref={(node) => {
				props.onRef?.(node);
			}}
			onClick={() => {
				props.onClick?.(props.identity);
				setCount(count + 1);
			}}
		>
			{'action:' + count}
		</button>
	</section>
}

// Capture primitive values explicitly: changing them is an intentional mounted
// parent update, not an opaque object mutation or a different initial client tree.
export function UpdatedAttributesBoundary({
	when,
	prefetch,
	identity,
	hidden,
	opacity,
	suppressHydrationWarning,
	onHydrated,
	onEffect,
	onRef,
	onClick,
}: Props) @{
	<Hydrate when={when} prefetch={prefetch} onHydrated={onHydrated}>
		<Controls
			when={when}
			identity={identity}
			hidden={hidden}
			opacity={opacity}
			suppressHydrationWarning={suppressHydrationWarning}
			onEffect={onEffect}
			onRef={onRef}
			onClick={onClick}
		/>
	</Hydrate>
}

export function UnsplitUpdatedAttributesBoundary(props: Props) @{
	<Hydrate split={false} when={props.when} prefetch={props.prefetch} onHydrated={props.onHydrated}>
		<Controls {...props} />
	</Hydrate>
}

export function NestedUpdatedAttributesBoundary({
	when,
	innerWhen = when,
	identity,
	hidden,
	onHydrated,
	onEffect,
	onRef,
	onClick,
}: Props) @{
	<Hydrate when={when}>
		<Hydrate when={innerWhen} onHydrated={onHydrated}>
			<Controls
				when={innerWhen}
				identity={identity}
				hidden={hidden}
				onEffect={onEffect}
				onRef={onRef}
				onClick={onClick}
			/>
		</Hydrate>
	</Hydrate>
}

function PortalControl(props: Props) @{
	<button
		id="updated-capture-portal-action"
		data-probe-id={props.identity}
		onClick={() => props.onClick?.(props.identity)}
	>
		{'portal:' + props.identity}
	</button>
}

export function ContextUpdatedAttributesBoundary(props: Props) @{
	const siblingId = useId();
	<DiagnosticContext value={props.contextValue ?? 'outside'}>
		<>
			<UpdatedAttributesBoundary {...props} />
			<p id="updated-context-sibling" data-runtime-id={siblingId}>Context sibling</p>
		</>
	</DiagnosticContext>
}

type ObservedCapturesProps = {
	when: HydrateProps['when'];
	observed: { readonly label: string };
	onRender?: (label: string) => void;
};

function ObservedChild({
	label,
	onRender,
}: {
	label: string;
	onRender?: (label: string) => void;
}) @{
	onRender?.(label);
	<p id="unsplit-observed-child">{label}</p>
}

export function UnsplitObservedCapturesBoundary({
	when,
	observed,
	onRender,
}: ObservedCapturesProps) @{
	<Hydrate when={when} split={false}>
		<ObservedChild label={observed.label} onRender={onRender} />
	</Hydrate>
}

export function startObservedCaptures(host: HTMLElement, props: ObservedCapturesProps) {
	const recoverable: unknown[] = [];
	const root = hydrateRoot(host, UnsplitObservedCapturesBoundary, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	return {
		recoverable,
		settle: () => act(() => {}),
		update: (next: ObservedCapturesProps) => act(
			() => root.render(UnsplitObservedCapturesBoundary, next),
		),
		unmount: () => flushSync(() => root.unmount()),
	};
}

type GuardedCapturesProps = {
	when: HydrateProps['when'];
	guarded: { show: boolean; readonly hiddenGetter: string };
};

export function UnsplitGuardedCapturesBoundary({ when, guarded }: GuardedCapturesProps) @{
	<Hydrate when={when} split={false}>
		@if (guarded.show) {
			<span id="unsplit-guarded-child" title={guarded.hiddenGetter}>Chosen</span>
		} @else {
			<span id="unsplit-guarded-child">Unchosen</span>
		}
	</Hydrate>
}

export function startGuardedCaptures(host: HTMLElement, props: GuardedCapturesProps) {
	const recoverable: unknown[] = [];
	const root = hydrateRoot(host, UnsplitGuardedCapturesBoundary, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	return {
		recoverable,
		settle: () => act(() => {}),
		update: (next: GuardedCapturesProps) => act(
			() => root.render(UnsplitGuardedCapturesBoundary, next),
		),
		unmount: () => flushSync(() => root.unmount()),
	};
}

export function ForeignEffectsUpdatedAttributesBoundary({
	when,
	identity,
	hidden,
	portalTarget,
	stylesheetIdentity,
	onEffect,
	onRef,
	onClick,
}: Props) @{
	<Hydrate when={when}>
		<>
			<style href={stylesheetIdentity!} precedence="default">
				.portal-control {
					color: teal;
				}
			</style>
			<span id="updated-capture-portal-anchor">{createPortal(PortalControl, portalTarget!, {
				when,
				identity,
				hidden,
				onClick,
			})}</span>
			<Controls
				when={when}
				identity={identity}
				hidden={hidden}
				onEffect={onEffect}
				onRef={onRef}
				onClick={onClick}
			/>
		</>
	</Hydrate>
}

export function start(
	host: HTMLElement,
	props: Props,
	split = true,
	nested = false,
	foreign = false,
	contextual = false,
) {
	const recoverable: unknown[] = [];
	const View =
		contextual
			? ContextUpdatedAttributesBoundary
			: foreign
				? ForeignEffectsUpdatedAttributesBoundary
				: nested
					? NestedUpdatedAttributesBoundary
					: split
						? UpdatedAttributesBoundary
						: UnsplitUpdatedAttributesBoundary;
	const root = hydrateRoot(host, View, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	return {
		recoverable,
		settle: () => act(() => {}),
		update: (next: Props) => act(() => root.render(View, next)),
		unmount: () => flushSync(() => root.unmount()),
	};
}
