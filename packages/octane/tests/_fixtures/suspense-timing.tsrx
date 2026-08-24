import {
	Activity,
	createContext,
	createElement,
	Suspense as TimingSuspense,
	memo,
	startTransition,
	use,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	useTransition,
} from 'octane';
import type { ComponentBody } from 'octane';

export interface TimingProps {
	promise: Promise<string>;
	label: string;
	onLayout?: (value: string) => void;
	onRef?: (node: HTMLSpanElement | null) => void;
	renderValue?: (value: string) => string;
}

function TimedContent(props: TimingProps) @{
	const result = use(props.promise);
	const value = props.renderValue?.(result) ?? result;
	useLayoutEffect(() => {
		props.onLayout?.(value);
	}, [value, props.onLayout]);
	<span data-value={props.label} ref={props.onRef}>{value as string}</span>
}

export interface DescriptorRetryContentProps extends TimingProps {
	readyValue?: string;
	onPassive?: (value: string) => void;
}

export function DescriptorRetryContent(props: DescriptorRetryContentProps) @{
	const [count, setCount] = useState(0);
	const value = props.readyValue ?? use(props.promise);
	useLayoutEffect(() => {
		props.onLayout?.(value);
	}, [value, props.onLayout]);
	useEffect(() => {
		props.onPassive?.(value);
	}, [value, props.onPassive]);
	<button data-value={props.label} ref={props.onRef} onClick={() => setCount(count + 1)}>
		{value + ':' + count}
	</button>
}

export function DescriptorRetryBoundary(props: TimingProps) {
	return createElement(TimingSuspense, {
		fallback: createElement('span', { 'data-fallback': props.label }, 'loading'),
		children: createElement('main', null, createElement(DescriptorRetryContent, props)),
	});
}

export function TimedBoundary(props: TimingProps) @{
	<TimingSuspense fallback={<span data-fallback={props.label}>{props.label + ' loading'}</span>}>
		<TimedContent
			promise={props.promise}
			label={props.label}
			onLayout={props.onLayout}
			onRef={props.onRef}
			renderValue={props.renderValue}
		/>
	</TimingSuspense>
}

export function CatchingTimedBoundary(props: TimingProps) @{
	<>
		@try {
			<TimedBoundary
				promise={props.promise}
				label={props.label}
				onLayout={props.onLayout}
				onRef={props.onRef}
				renderValue={props.renderValue}
			/>
		} @catch (error: unknown, _reset: () => void) {
			<span data-error={props.label}>{String((error as Error).message)}</span>
		}
	</>
}

export function UncaughtTimedBoundary(props: TimingProps) @{
	<main>
		<p>{'root shell'}</p>
		<TimedBoundary promise={props.promise} label={props.label} />
	</main>
}

export interface TimingPairProps {
	first: Promise<string>;
	second: Promise<string>;
	nextSecond?: Promise<string>;
	onLayout?: (value: string) => void;
}

function ReplaceableBoundary(props: TimingProps & { next?: Promise<string> }) @{
	const [promise, setPromise] = useState(props.promise);
	<section>
		<button onClick={() => setPromise(props.next!)}>{'replace ' + props.label}</button>
		<TimedBoundary promise={promise} label={props.label} onLayout={props.onLayout} />
	</section>
}

export function TimedPair(props: TimingPairProps) @{
	<main>
		<TimedBoundary promise={props.first} label="first" onLayout={props.onLayout} />
		<ReplaceableBoundary
			promise={props.second}
			next={props.nextSecond}
			label="second"
			onLayout={props.onLayout}
		/>
	</main>
}

export interface NestedTimingProps {
	first: Promise<string>;
	loadSecond: (first: string) => Promise<string>;
	onLayout?: (value: string) => void;
}

function NestedContent(props: NestedTimingProps) @{
	const first = use(props.first);
	const second = props.loadSecond(first);
	<section>
		<span data-value="first">{first as string}</span>
		<TimedBoundary promise={second} label="second" onLayout={props.onLayout} />
	</section>
}

export function TimedNested(props: NestedTimingProps) @{
	<TimingSuspense fallback={<span data-fallback="outer">{'outer loading'}</span>}>
		<NestedContent first={props.first} loadSecond={props.loadSecond} onLayout={props.onLayout} />
	</TimingSuspense>
}

export interface RawTimingProps {
	read: () => string;
	label: string;
	onLayout?: (value: string) => void;
}

function RawTimedContent(props: RawTimingProps) @{
	const value = props.read();
	useLayoutEffect(() => {
		props.onLayout?.(value);
	}, [value, props.onLayout]);
	<span data-value={props.label}>{value as string}</span>
}

export function RawTimedBoundary(props: RawTimingProps) @{
	<>
		@try {
			<TimingSuspense
				fallback={<span data-fallback={props.label}>{props.label + ' loading'}</span>}
			>
				<RawTimedContent read={props.read} label={props.label} onLayout={props.onLayout} />
			</TimingSuspense>
		} @catch (error: unknown, _reset: () => void) {
			<span data-error={props.label}>{String((error as Error).message)}</span>
		}
	</>
}

export interface InitialStateTimingProps extends TimingProps {
	initial: string;
}

export function InitialStateRootSuspension(props: InitialStateTimingProps) @{
	const [initial] = useState(props.initial);
	const initialRef = useRef(props.initial);
	const initialMemo = useMemo(() => props.initial, []);
	const [initialReducer] = useReducer((state: string) => state, props.initial);
	const value = use(props.promise);
	<span
		data-value={props.label}
		data-initial-ref={initialRef.current}
		data-initial-memo={initialMemo}
		data-initial-reducer={initialReducer}
	>
		{initial + ':' + value}
	</span>
}

export function InitialStateTimedBoundary(props: InitialStateTimingProps) @{
	<TimingSuspense fallback={<span data-fallback={props.label}>{props.label + ' loading'}</span>}>
		<InitialStateRootSuspension
			promise={props.promise}
			label={props.label}
			initial={props.initial}
		/>
	</TimingSuspense>
}

function InteractiveTimedFallback(props: { label: string }) @{
	const [count, setCount] = useState(0);
	<section>
		<button data-fallback={props.label} onClick={() => setCount(count + 1)}>
			{'loading:' + count}
		</button>
		<input aria-label="fallback draft" defaultValue="" />
	</section>
}

export function StatefulFallbackTimedBoundary(props: InitialStateTimingProps) @{
	<TimingSuspense fallback={<InteractiveTimedFallback label={props.label} />}>
		<InitialStateRootSuspension
			promise={props.promise}
			label={props.label}
			initial={props.initial}
		/>
	</TimingSuspense>
}

export interface ActivityTimingProps extends TimingProps {
	mode: 'visible' | 'hidden';
}

export function ActivityTimedBoundary(props: ActivityTimingProps) @{
	<Activity mode={props.mode}>
		<TimedBoundary promise={props.promise} label={props.label} />
	</Activity>
}

export function NestedActivityTimedBoundary(props: ActivityTimingProps) @{
	<Activity mode={props.mode}>
		<Activity mode="hidden">
			<TimedBoundary promise={props.promise} label={props.label} />
		</Activity>
	</Activity>
}

export interface FallbackResource {
	promise: Promise<string>;
	read: () => string;
}

export interface SuspendingFallbackProps {
	primary: FallbackResource;
	fallback: FallbackResource;
	readMode: 'raw' | 'use';
	primaryError?: Error;
	replacement?: string;
	boundary?: ComponentBody<{
		children: unknown;
		fallback: (error: unknown) => unknown;
	}>;
	onFallbackLayout?: (value: string) => void;
}

function FallbackPrimary(props: SuspendingFallbackProps) @{
	const value =
		props.readMode === 'use' ? use(props.primary.promise) : props.primary.read();
	<span data-value="fallback-primary">{value as string}</span>
}

function SuspendingFallback(props: SuspendingFallbackProps) @{
	const [count, setCount] = useState(0);
	const value =
		props.readMode === 'use' ? use(props.fallback.promise) : props.fallback.read();
	useLayoutEffect(() => {
		props.onFallbackLayout?.(value);
	}, [value, props.onFallbackLayout]);
	<button data-value="suspending-fallback" onClick={() => setCount(count + 1)}>
		{value + ':' + count}
	</button>
}

export function PendingFallbackBoundary(props: SuspendingFallbackProps) @{
	<TimingSuspense fallback={<span data-fallback="outer">outer loading</span>}>
		<>
			@try {
				<FallbackPrimary {...props} />
			} @pending {
				<SuspendingFallback {...props} />
			} @catch (error: unknown, _reset: () => void) {
				<span data-error="inner">{String((error as Error).message)}</span>
			}
		</>
	</TimingSuspense>
}

function FallbackPrimaryError(props: SuspendingFallbackProps) {
	throw props.primaryError;
}

function ErrorFallbackPrimary(props: SuspendingFallbackProps) @{
	@if (props.primaryError !== undefined) {
		<FallbackPrimaryError {...props} />
	} @else {
		<TimingSuspense fallback={<span data-fallback="primary">primary loading</span>}>
			<FallbackPrimary {...props} />
		</TimingSuspense>
	}
}

function ErrorFallbackContent(props: SuspendingFallbackProps) @{
	@if (props.boundary) {
		const Boundary = props.boundary;
		<Boundary fallback={(_error: unknown) => <SuspendingFallback {...props} />}>
			<ErrorFallbackPrimary {...props} />
		</Boundary>
	} @else {
		@try {
			<ErrorFallbackPrimary {...props} />
		} @catch (_error: unknown, _reset: () => void) {
			<SuspendingFallback {...props} />
		}
	}
}

export function ErrorFallbackBoundary(props: SuspendingFallbackProps) @{
	<TimingSuspense fallback={<span data-fallback="outer">outer loading</span>}>
		@if (props.replacement !== undefined) {
			<span data-value="fallback-replacement">{props.replacement as string}</span>
		} @else {
			<ErrorFallbackContent {...props} />
		}
	</TimingSuspense>
}

export function CatchingErrorFallbackBoundary(props: SuspendingFallbackProps) @{
	<>
		@try {
			<ErrorFallbackBoundary {...props} />
		} @catch (error: unknown, _reset: () => void) {
			<span data-error="outer">{String((error as Error).message)}</span>
		}
	</>
}

export interface FallbackSiblingProps {
	primary: Promise<string>;
	fallback: Promise<string>;
	sibling: Promise<string>;
}

function FallbackSiblingReader(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span data-value="fallback-sibling-reader">{value as string}</span>
}

function ReadyFallbackView(props: { value: string }) @{
	<span data-value="memoized-error-fallback">{props.value as string}</span>
}

const ReadyFallback = memo(ReadyFallbackView);

function MemoizedErrorFallback(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<ReadyFallback value={value} />
}

export function MemoizedFallbackSibling(props: FallbackSiblingProps) @{
	@try {
		<main>
			@try {
				@try {
					<FallbackSiblingReader promise={props.primary} />
				} @pending {
					<span data-fallback="primary">inner loading</span>
				}
			} @catch (_error: unknown, _reset: () => void) {
				<MemoizedErrorFallback promise={props.fallback} />
			}
			<span>|</span>
			<FallbackSiblingReader promise={props.sibling} />
		</main>
	} @pending {
		<span data-fallback="outer">outer loading</span>
	}
}

export interface RootSuspensionProps extends TimingProps {
	read?: () => string;
	items?: string[];
	shellError?: unknown;
	onLifecycle?: (event: string) => void;
	onShellRef?: (node: HTMLElement | null) => void;
	onEvent?: (event: string) => void;
}

function ignoreRootEvent(_event: string) {}

const RootSuspensionContext = createContext<string | undefined>(undefined);

function RootSuspensionShell(props: RootSuspensionProps) @{
	if ('shellError' in props) throw props.shellError;
	const [count, setCount] = useState(0);
	const label = useContext(RootSuspensionContext) ?? props.label;
	const record = props.onEvent ?? ignoreRootEvent;
	const eventLabel = 'bundle:' + label;
	useLayoutEffect(() => {
		props.onLifecycle?.('layout shell:' + label);
		return () => props.onLifecycle?.('layout cleanup shell:' + label);
	}, [label, props.onLifecycle]);
	useEffect(() => {
		props.onLifecycle?.('passive shell:' + label);
		return () => props.onLifecycle?.('passive cleanup shell:' + label);
	}, [label, props.onLifecycle]);
	<header data-shell={label} ref={props.onShellRef}>
		<input aria-label="root value" value={label} readOnly />
		<button data-count onClick={() => setCount(count + 1)}>{label + ':' + count}</button>
		<button
			data-event
			onClickCapture={() => props.onEvent?.('capture:' + label)}
			onClick={() => props.onEvent?.('bubble:' + label)}
		>inspect</button>
		<button data-event-bundle onClick={() => record(eventLabel)}>inspect bundled</button>
	</header>
}

function RootSuspensionItem(props: {
	value: string;
	label: string;
	onLifecycle?: (event: string) => void;
	onEvent?: (event: string) => void;
}) @{
	useLayoutEffect(() => {
		props.onLifecycle?.('layout item:' + props.value);
		return () => props.onLifecycle?.('layout cleanup item:' + props.value);
	}, [props.value, props.onLifecycle]);
	<li data-item={props.value}>
		<span data-row-label>{props.value + ':' + props.label}</span>
		<input aria-label={'row ' + props.value} defaultValue={props.value} />
		<button
			data-row-event
			onClick={() => props.onEvent?.('row:' + props.value + ':' + props.label)}
		>inspect row</button>
	</li>
}

function RootSuspensionReader(props: RootSuspensionProps) @{
	const value =
		props.read === undefined ? use(props.promise) : props.read();
	useLayoutEffect(() => {
		props.onLayout?.(value);
		props.onLifecycle?.('layout reader:' + value);
		return () => props.onLifecycle?.('layout cleanup reader:' + value);
	}, [value, props.onLayout, props.onLifecycle]);
	useEffect(() => {
		props.onLifecycle?.('passive reader:' + value);
		return () => props.onLifecycle?.('passive cleanup reader:' + value);
	}, [value, props.onLifecycle]);
	<span data-value="root-reader" ref={props.onRef}>{value as string}</span>
}

export function RootSuspensionScreen(props: RootSuspensionProps) @{
	<main data-screen={props.label}>
		<RootSuspensionShell {...props} />
		<ul>
			@for (const item of props.items ?? []; key item) {
				<RootSuspensionItem
					value={item}
					label={props.label}
					onLifecycle={props.onLifecycle}
					onEvent={props.onEvent}
				/>
			} @empty {
				<li data-empty>{'empty:' + props.label}</li>
			}
		</ul>
		<RootSuspensionReader {...props} />
		<footer data-tail>{props.label as string}</footer>
	</main>
}

export function AlternateRootSuspensionScreen(props: RootSuspensionProps) @{
	<article data-alternate>
		<RootSuspensionScreen {...props} />
	</article>
}

export function ContextRootSuspensionScreen(props: RootSuspensionProps) @{
	<RootSuspensionContext.Provider value={props.label}>
		<RootSuspensionScreen {...props} />
	</RootSuspensionContext.Provider>
}

export interface DefaultedRootSuspensionProps extends RootSuspensionProps {
	input: { defaultValue: string };
	select: { multiple: boolean; defaultValue: string | string[] };
}

export function DefaultedRootSuspensionScreen(props: DefaultedRootSuspensionProps) @{
	<main data-defaults={props.label}>
		<input data-default="pristine-input" defaultValue={props.label} />
		<input data-default="edited-input" defaultValue={props.label} />
		<textarea data-default="pristine-textarea" defaultValue={props.label} />
		<textarea data-default="edited-textarea" defaultValue={props.label} />
		<input data-default="spread-input" {...props.input} />
		<select data-default-select {...props.select}>
			<option value="first">first</option>
			<option value="second">second</option>
			<option value="third">third</option>
		</select>
		<RootSuspensionReader {...props} />
	</main>
}

export function CatchingRootSuspensionScreen(props: RootSuspensionProps) @{
	@try {
		<RootSuspensionScreen {...props} />
	} @catch (error: unknown, _reset: () => void) {
		<span data-error="root-reader">{String((error as Error).message)}</span>
	}
}

export interface StatefulRootSuspensionProps extends RootSuspensionProps {
	next: RootSuspensionProps;
	concurrent?: boolean;
}

function StatefulRootSuspensionContent(props: StatefulRootSuspensionProps) @{
	const [next, setNext] = useState<RootSuspensionProps | null>(null);
	<>
		<button
			data-update
			onClick={() => {
				if (props.concurrent) startTransition(() => setNext(props.next));
				else setNext(props.next);
			}}
		>load</button>
		<RootSuspensionScreen {...next ?? props} />
	</>
}

export function StatefulRootSuspensionScreen(props: StatefulRootSuspensionProps) @{
	<section>
		<span data-static>outer shell</span>
		<StatefulRootSuspensionContent {...props} />
	</section>
}

export interface TransitionRootSuspensionProps extends RootSuspensionProps {
	next: RootSuspensionProps;
	urgent: RootSuspensionProps;
}

export function TransitionRootSuspensionScreen(props: TransitionRootSuspensionProps) @{
	const [selection, setSelection] = useState<RootSuspensionProps>(props);
	const [pending, start] = useTransition();
	<section>
		<button data-transition onClick={() => start(() => setSelection(props.next))}>next</button>
		<button data-urgent onClick={() => setSelection(props.urgent)}>urgent</button>
		<span data-root-pending>
			{pending ? 'pending' : 'idle'}
		</span>
		<RootSuspensionScreen {...selection} />
	</section>
}

export interface StructuralRootSuspensionProps extends RootSuspensionProps {
	shape: | 'keyed component'
	| 'conditional branch'
	| 'dynamic component'
	| 'value component'
	| 'returned array'
	| 'empty value';
	alternate?: boolean;
}

function AlternateRootSuspensionShell(props: RootSuspensionProps) @{
	<aside data-alternate-shell>
		<RootSuspensionShell {...props} />
	</aside>
}

function ReturningRootSuspensionShell(props: StructuralRootSuspensionProps) {
	return props.alternate
		? [
				createElement(AlternateRootSuspensionShell, { ...props, key: 'array' }),
				createElement('span', { key: 'tail', 'data-array-tail': true }, props.label + ' array'),
			]
		: createElement(RootSuspensionShell, props);
}

export function StructuralRootSuspensionScreen(props: StructuralRootSuspensionProps) @{
	const Shell = props.alternate ? AlternateRootSuspensionShell : RootSuspensionShell;
	const value =
		props.shape === 'empty value'
			? props.alternate
				? createElement(RootSuspensionShell, props)
				: null
			: createElement(Shell, props);
	<main>
		@if (props.shape === 'keyed component') {
			<RootSuspensionShell key={props.label} {...props} />
		} @else if (props.shape === 'conditional branch') {
			@if (props.alternate) {
				<section data-alternate-shell>
					<RootSuspensionShell {...props} />
				</section>
			} @else {
				<RootSuspensionShell {...props} />
			}
		} @else if (props.shape === 'dynamic component') {
			<Shell {...props} />
		} @else if (props.shape === 'returned array') {
			<ReturningRootSuspensionShell {...props} />
		} @else {
			<>
				{value}
			</>
		}
		<RootSuspensionReader {...props} />
		<footer data-tail>stable sibling</footer>
	</main>
}

export interface IndependentRootSuspensionProps extends RootSuspensionProps {
	onShellUpdate: (update: (label: string) => void) => void;
	onReaderUpdate: (update: (next: RootSuspensionProps) => void) => void;
	onTailUpdate: (update: (label: string) => void) => void;
}

function IndependentlyQueuedShell(props: IndependentRootSuspensionProps) @{
	const [label, setLabel] = useState(props.label);
	useLayoutEffect(() => props.onShellUpdate(setLabel), [props.onShellUpdate, setLabel]);
	<RootSuspensionShell {...props} label={label} />
}

function IndependentlyQueuedReader(props: IndependentRootSuspensionProps) @{
	const [request, setRequest] = useState<RootSuspensionProps | null>(null);
	useLayoutEffect(() => props.onReaderUpdate(setRequest), [props.onReaderUpdate, setRequest]);
	<RootSuspensionReader {...request ?? props} />
}

function IndependentlyQueuedTail(props: IndependentRootSuspensionProps) @{
	const [label, setLabel] = useState(props.label);
	useLayoutEffect(() => props.onTailUpdate(setLabel), [props.onTailUpdate, setLabel]);
	useLayoutEffect(() => {
		props.onLifecycle?.('layout tail:' + label);
	}, [label, props.onLifecycle]);
	<footer data-queued-tail>{label as string}</footer>
}

function IndependentRootSuspensionSiblings(props: { request: IndependentRootSuspensionProps }) @{
	<main>
		<IndependentlyQueuedShell {...props.request} />
		<IndependentlyQueuedReader {...props.request} />
		<IndependentlyQueuedTail {...props.request} />
	</main>
}

export function IndependentRootSuspensionScreen(props: IndependentRootSuspensionProps) @{
	<section>
		<IndependentRootSuspensionSiblings request={props} />
	</section>
}

function RetiringRootSuspensionChild(props: RootSuspensionProps & { replaceOwner: () => void }) @{
	const [pending, setPending] = useState(false);
	if (pending) use(props.promise);
	<>
		<button
			data-retire
			onClick={() => {
				props.replaceOwner();
				setPending(true);
			}}
		>replace</button>
		<RootSuspensionShell {...props} />
	</>
}

export function RetiringRootSuspensionScreen(props: RootSuspensionProps) @{
	const [replaced, setReplaced] = useState(false);
	<main>
		@if (replaced) {
			<span data-ready-replacement>ready replacement</span>
		} @else {
			<section>
				<RetiringRootSuspensionChild {...props} replaceOwner={() => setReplaced(true)} />
			</section>
		}
		<footer>stable sibling</footer>
	</main>
}
