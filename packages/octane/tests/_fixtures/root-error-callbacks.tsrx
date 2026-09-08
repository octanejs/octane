// Fixtures for the React 19 root error-callback options (onCaughtError /
// onUncaughtError on createRoot/hydrateRoot). Each host pairs a thrower with
// (or without) a boundary so the tests can drive both report channels through
// the render and passive-effect paths.
import {
	Activity,
	createElement,
	ErrorBoundary,
	HYDRATION_RANGE_BOUNDARY,
	Suspense as CaughtSuspense,
	use,
	useEffect,
	useLayoutEffect,
	useState,
} from 'octane';
import type { ComponentBody } from 'octane';

interface CaughtFallbackOptions {
	fallbackRef?: { current: HTMLSpanElement | null };
	onFallbackLayout?: () => void;
	fallbackError?: Error;
}

export interface ParentErrorProps extends CaughtFallbackOptions {
	error: Error | null;
}

function ParentDrivenThrower(props: ParentErrorProps) @{
	if (props.error !== null) throw props.error;
	<span>ok</span>
}

function caughtRenderText(error: unknown): string {
	return 'caught:' + (error as Error).message;
}

export function CaughtRenderFallback(props: { error: unknown } & CaughtFallbackOptions) @{
	if (props.fallbackError !== undefined) throw props.fallbackError;
	useLayoutEffect(() => props.onFallbackLayout?.(), [props.onFallbackLayout]);
	<span data-error-fallback ref={props.fallbackRef}>{caughtRenderText(props.error) as string}</span>
}

function renderCaughtFallback(error: unknown, props: CaughtFallbackOptions) {
	return createElement(CaughtRenderFallback, {
		error,
		fallbackRef: props.fallbackRef,
		onFallbackLayout: props.onFallbackLayout,
		fallbackError: props.fallbackError,
	});
}

export function LiteralCaughtParentError(props: ParentErrorProps) @{
	<ErrorBoundary fallback={(error: unknown) => renderCaughtFallback(error, props)}>
		<ParentDrivenThrower error={props.error} />
	</ErrorBoundary>
}

export function DescriptorCaughtParentError(props: ParentErrorProps) {
	return createElement(ErrorBoundary, {
		fallback: (error: unknown) => renderCaughtFallback(error, props),
		children: createElement(ParentDrivenThrower, { error: props.error }),
	});
}

export function InlineCaughtParentError(props: ParentErrorProps) @{
	@try {
		<ParentDrivenThrower error={props.error} />
	} @catch (error: unknown, _reset: () => void) {
		<CaughtRenderFallback
			error={error}
			fallbackRef={props.fallbackRef}
			onFallbackLayout={props.onFallbackLayout}
			fallbackError={props.fallbackError}
		/>
	}
}

export function PassthroughCaughtRoot(props: ParentErrorProps) @{
	<InlineCaughtParentError {...props} />
}

PassthroughCaughtRoot[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

export function ParentDrivenCaughtHost(
	props: {
		boundary: ComponentBody<ParentErrorProps>;
		error: Error;
		initiallyThrow: boolean;
		tailError?: Error;
	} & CaughtFallbackOptions,
) @{
	const [bang, setBang] = useState(props.initiallyThrow);
	const Boundary = props.boundary;
	<main>
		<button data-trigger="boundary-error" onClick={() => setBang(true)}>trigger</button>
		<Boundary
			error={bang ? props.error : null}
			fallbackRef={props.fallbackRef}
			onFallbackLayout={props.onFallbackLayout}
			fallbackError={props.fallbackError}
		/>
		<CaughtHostTail failed={bang} error={props.tailError} />
	</main>
}

function CaughtHostTail(props: { failed: boolean; error?: Error }) @{
	if (props.failed && props.error !== undefined) throw props.error;
	<span>
		{props.failed ? 'tail:failed' : 'tail:ready'}
	</span>
}

export function LayoutResetCaughtHost(props: { error: Error } & CaughtFallbackOptions) @{
	const [failed, setFailed] = useState(true);
	<main>
		<ErrorBoundary
			fallback={(error: unknown, reset: () => void) => renderCaughtFallback(error, {
				fallbackRef: props.fallbackRef,
				onFallbackLayout: () => {
					props.onFallbackLayout?.();
					setFailed(false);
					reset();
				},
			})}
		>
			<ParentDrivenThrower error={failed ? props.error : null} />
		</ErrorBoundary>
		<CaughtHostTail failed={failed} />
	</main>
}

export interface HiddenCaughtActions {
	fail: () => void;
	wait: () => void;
}

interface HiddenCaughtProps extends CaughtFallbackOptions {
	api: HiddenCaughtActions;
	error: Error;
	initial: Promise<string>;
	pending: Promise<string>;
}

function IndependentlyCaughtOwner(props: HiddenCaughtProps) @{
	const [failed, setFailed] = useState(false);
	props.api.fail = () => setFailed(true);
	@try {
		<ParentDrivenThrower error={failed ? props.error : null} />
	} @catch (error: unknown, _reset: () => void) {
		<CaughtRenderFallback
			error={error}
			fallbackRef={props.fallbackRef}
			onFallbackLayout={props.onFallbackLayout}
		/>
	}
}

function IndependentlyPendingSibling(props: HiddenCaughtProps) @{
	const [promise, setPromise] = useState(props.initial);
	props.api.wait = () => setPromise(props.pending);
	const value = use(promise);
	<span>{value as string}</span>
}

export function HiddenInlineCaughtHost(props: HiddenCaughtProps) @{
	@try {
		<main>
			<IndependentlyCaughtOwner {...props} />
			<span>|</span>
			<IndependentlyPendingSibling {...props} />
		</main>
	} @pending {
		<span>outer loading</span>
	}
}

export interface ReparkCaughtActions {
	wait: () => void;
	replace: () => void;
}

interface SuspenseReparkCaughtProps extends CaughtFallbackOptions {
	api: ReparkCaughtActions;
	firstError: Error;
	secondError: Error;
	initial: Promise<string>;
	pending: Promise<string>;
}

function ReparkPendingSibling(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span>{'|' + value as string}</span>
}

export function SuspenseReparkCaughtHost(props: SuspenseReparkCaughtProps) @{
	const [second, setSecond] = useState(false);
	const [promise, setPromise] = useState(props.initial);
	props.api.wait = () => setPromise(props.pending);
	props.api.replace = () => setSecond(true);
	<CaughtSuspense fallback={<span>outer loading</span>}>
		<main>
			@if (second) {
				<DescriptorCaughtParentError
					error={props.secondError}
					fallbackRef={props.fallbackRef}
					onFallbackLayout={props.onFallbackLayout}
				/>
			} @else {
				<DescriptorCaughtParentError
					error={props.firstError}
					fallbackRef={props.fallbackRef}
					onFallbackLayout={props.onFallbackLayout}
				/>
			}
			<ReparkPendingSibling promise={promise} />
		</main>
	</CaughtSuspense>
}

interface InterruptedActivityCaughtProps extends ParentErrorProps {
	mode: 'hidden' | 'visible';
	promise: Promise<string> | null;
	siblingOutside: boolean;
}

function ActivityCaughtPendingSibling(props: { promise: Promise<string> | null }) @{
	const value =
		props.promise === null ? 'initial' : use(props.promise);
	<span>{'|' + value as string}</span>
}

function ActivityCaughtContents(props: InterruptedActivityCaughtProps) @{
	<section>
		<DescriptorCaughtParentError
			error={props.error}
			fallbackRef={props.fallbackRef}
			onFallbackLayout={props.onFallbackLayout}
		/>
		@if (!props.siblingOutside) {
			<ActivityCaughtPendingSibling promise={props.promise} />
		}
	</section>
}

export function InterruptedActivityCaughtHost(props: InterruptedActivityCaughtProps) @{
	<CaughtSuspense fallback={<span>outer loading</span>}>
		<main>
			<span>shell|</span>
			<Activity mode={props.mode}>
				<ActivityCaughtContents {...props} />
			</Activity>
			@if (props.siblingOutside) {
				<ActivityCaughtPendingSibling promise={props.promise} />
			}
		</main>
	</CaughtSuspense>
}

let bumpRender: (() => void) | null = null;
export function triggerRenderThrow(): void {
	bumpRender!();
}

function RenderThrower() @{
	const [bang, setBang] = useState(false);
	bumpRender = () => setBang(true);
	if (bang) {
		throw new Error('render-boom');
	}
	<span id="ok">ok</span>
}

export function CaughtHost() @{
	<ErrorBoundary fallback={(e: unknown) => 'caught:' + (e as Error).message}>
		<RenderThrower />
	</ErrorBoundary>
}

export function UncaughtHost() @{
	<main>
		<RenderThrower />
	</main>
}

// Throws during the FIRST render — exercises the synchronous initial-mount
// error path (the first root.render() mounts synchronously in Octane) and the
// hydration render path, both of which must honor onUncaughtError.
export function MountThrower() @{
	{
		throwOnMount() as string;
	}
}

function throwOnMount(): string {
	throw new Error('mount-boom');
}

// Teardown-phase throwers: a passive-effect cleanup and a callback-ref cleanup
// that throw during deletion. Deletion-phase errors route to the enclosing
// boundary when one exists; otherwise they are the uncaught teardown channel.
export function CleanupThrower() @{
	useEffect(() => {
		return () => {
			throw new Error('cleanup-boom');
		};
	}, []);
	<span id="ct">ct</span>
}

export function CleanupHost() @{
	<main>
		<CleanupThrower />
	</main>
}

let removeCleanupThrower: (() => void) | null = null;
export function triggerCleanupThrowerRemoval(): void {
	removeCleanupThrower!();
}

export function CaughtCleanupHost() @{
	const [on, setOn] = useState(true);
	removeCleanupThrower = () => setOn(false);
	<ErrorBoundary fallback="cleanup-caught">
		@if (on) {
			<CleanupThrower />
		} @else {
			<span id="off">off</span>
		}
	</ErrorBoundary>
}

function RefThrower() @{
	<span
		id="rt"
		ref={(_el) => {
			return () => {
				throw new Error('ref-boom');
			};
		}}
	/>
}

export function RefCleanupHost() @{
	<main>
		<RefThrower />
	</main>
}

// Interactive recovery probe: a recovered root must keep its container's event
// delegation, so a click on freshly rendered content still reaches handlers.
export function ClickCounter() @{
	const [n, setN] = useState(0);
	<button id="counter" onClick={() => setN(n + 1)}>{'n:' + n}</button>
}

let bumpEffect: (() => void) | null = null;
export function triggerEffectThrow(): void {
	bumpEffect!();
}

function EffectThrower() @{
	const [bang, setBang] = useState(false);
	bumpEffect = () => setBang(true);
	useEffect(() => {
		if (bang) {
			throw new Error('effect-boom');
		}
	}, [bang]);
	<span id="eok">eok</span>
}

export function CaughtEffectHost() @{
	<ErrorBoundary fallback="effect-caught">
		<EffectThrower />
	</ErrorBoundary>
}

export function UncaughtEffectHost() @{
	<main>
		<EffectThrower />
	</main>
}
