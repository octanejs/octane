import {
	Activity,
	Suspense as TimingSuspense,
	memo,
	use,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
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

function InitialStateContent(props: InitialStateTimingProps) @{
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
		<InitialStateContent promise={props.promise} label={props.label} initial={props.initial} />
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
		<InitialStateContent promise={props.promise} label={props.label} initial={props.initial} />
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
