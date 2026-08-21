import {
	Activity,
	Suspense,
	use,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'octane';

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
	<Suspense fallback={<span data-fallback={props.label}>{props.label + ' loading'}</span>}>
		<TimedContent
			promise={props.promise}
			label={props.label}
			onLayout={props.onLayout}
			onRef={props.onRef}
			renderValue={props.renderValue}
		/>
	</Suspense>
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
	<Suspense fallback={<span data-fallback="outer">{'outer loading'}</span>}>
		<NestedContent first={props.first} loadSecond={props.loadSecond} onLayout={props.onLayout} />
	</Suspense>
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
			<Suspense fallback={<span data-fallback={props.label}>{props.label + ' loading'}</span>}>
				<RawTimedContent read={props.read} label={props.label} onLayout={props.onLayout} />
			</Suspense>
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
	<Suspense fallback={<span data-fallback={props.label}>{props.label + ' loading'}</span>}>
		<InitialStateContent promise={props.promise} label={props.label} initial={props.initial} />
	</Suspense>
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
	<Suspense fallback={<InteractiveTimedFallback label={props.label} />}>
		<InitialStateContent promise={props.promise} label={props.label} initial={props.initial} />
	</Suspense>
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
