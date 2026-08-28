import {
	Activity,
	ErrorBoundary,
	memo,
	Suspense,
	useEffect,
	useLayoutEffect,
	useRef,
} from 'octane';
import { createScope, query } from 'octane/signals';
import { formatCounter$ } from './signals-native-readers';

export function createCounter$(scopeKey = 'native-counter', initial = 0) {
	const scope = createScope({ scopeKey });
	const count$ = scope.signal$('count', initial);
	const doubled$ = scope.derived$('doubled', () => scope.get(count$) * 2);
	return { scope, count$, doubled$, readCount$: () => scope.get(count$) };
}

export type CounterFixture = ReturnType<typeof createCounter$>;

export function SignalReader(props: CounterFixture) @{
	<p class="signal-value">{String(props.scope.get(props.count$))}</p>
}

export function DerivedReader(props: CounterFixture) @{
	<p class="signal-value">{String(props.scope.get(props.doubled$))}</p>
}

export function ImportedReader(props: CounterFixture) @{
	<p class="signal-value">{formatCounter$(props) as string}</p>
}

const MemoReader = memo(SignalReader);

export function MemoParent(props: CounterFixture & { label: string }) @{
	<section>
		<span class="label">{props.label}</span>
		<MemoReader {...props} />
	</section>
}

export function NativeRows(props: CounterFixture & { rows: readonly number[] }) @{
	<section>
		<span class="survivor">{'keep'}</span>
		@for (const id of props.rows; key id) {
			<p data-row={id}>{String(props.scope.get(props.count$))}</p>
		}
	</section>
}

export function SampledEffects(props: CounterFixture & { log: (entry: string) => void }) @{
	const value = props.scope.get(props.count$);
	const output = useRef<HTMLOutputElement | null>(null);
	useLayoutEffect(() => {
		props.log('layout:' + value + ':' + output.current?.textContent);
		return () => props.log('layout-cleanup:' + value);
	}, [value, props.log]);
	useEffect(() => {
		props.log('passive:' + value + ':' + output.current?.textContent);
		return () => props.log('passive-cleanup:' + value);
	}, [value, props.log]);
	<output ref={output}>{String(value)}</output>
}

export function ThrowingReader(props: CounterFixture) @{
	props.scope.get(props.count$);
	throw new Error('native fixture failure');
	<p>{'unreachable'}</p>
}

export function RenderWriter(props: CounterFixture) @{
	props.scope.set(props.count$, 123);
	<p class="signal-value">{String(props.scope.get(props.count$))}</p>
}

export function EventWrites(props: CounterFixture & { log: (entry: string) => void }) @{
	<section
		onClickCapture={() => {
			props.scope.set(props.count$, 1);
			props.log('capture:' + props.scope.get(props.count$));
		}}
		onClick={() => {
			props.scope.set(props.count$, 3);
			props.log('parent:' + props.scope.get(props.count$));
		}}
	>
		<button
			onClick={() => {
				props.scope.set(props.count$, 2);
				props.log('child:' + props.scope.get(props.count$));
			}}
		>{String(props.scope.get(props.count$))}</button>
	</section>
}

export function createResource$(scopeKey: string, load: (key: string) => Promise<string>) {
	const scope = createScope({ scopeKey });
	const key$ = scope.signal$('key', 'a');
	const count$ = scope.signal$('count', 0);
	const request = query('native-fixture', load);
	const value$ = scope.asyncSignal$('value', () => request(scope.get(key$)));
	return { scope, key$, count$, value$ };
}

type ResourceFixture = ReturnType<typeof createResource$>;

export function NativeAsyncValue(props: ResourceFixture) @{
	<p class="async-value">{props.scope.get(props.value$) as string}</p>
}

export function NativeAsyncBoundary(props: ResourceFixture) @{
	<section>
		@try {
			<NativeAsyncValue {...props} />
		} @pending {
			<p class="pending">{'loading'}</p>
		} @catch (error) {
			<p class="error">{String(error)}</p>
		}
	</section>
}

export function NativeHeldBoundary(props: ResourceFixture) @{
	<section>
		@try {
			<div class="panel">
				<p class="count">{String(props.scope.get(props.count$))}</p>
				<NativeAsyncValue {...props} />
			</div>
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</section>
}

function NativeHeldCount(props: Pick<ResourceFixture, 'scope' | 'count$'> & {
	log: (entry: string) => void;
}) @{
	const value = props.scope.get(props.count$);
	useLayoutEffect(() => {
		props.log('layout:' + value);
		return () => props.log('cleanup:' + value);
	}, [value]);
	<button
		class="count"
		ref={(node: HTMLButtonElement | null) => {
			props.log('ref:' + value + ':' + (node === null ? 'detach' : 'attach'));
		}}
	>{String(value)}</button>
}

export function NativeHeldSiblings(props: ResourceFixture & { log: (entry: string) => void }) @{
	<section>
		@try {
			<div class="panel">
				<NativeHeldCount {...props} />
				<NativeAsyncValue {...props} />
			</div>
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</section>
}

export function NativeHeldIsolation(props: ResourceFixture & {
	outside: CounterFixture;
	log: (entry: string) => void;
}) @{
	<main>
		<aside class="outside">
			<NativeHeldCount {...props.outside} log={(entry) => props.log('outside:' + entry)} />
		</aside>
		<NativeHeldSiblings {...props} />
	</main>
}

function NativeHeldAsyncLayer(props: ResourceFixture) @{
	const host = useRef<HTMLDivElement | null>(null);
	<div ref={host}>
		<NativeAsyncValue {...props} />
	</div>
}

export function NativeNestedHeldSiblings(props: ResourceFixture & {
	log: (entry: string) => void;
}) @{
	<section>
		@try {
			<div class="panel">
				@try {
					<NativeHeldCount {...props} />
				} @pending {
					<p class="inner-pending">{'inner loading'}</p>
				}
				<NativeHeldAsyncLayer {...props} />
			</div>
		} @pending {
			<p class="pending">{'loading'}</p>
		}
	</section>
}

export function NativeActivity(props: CounterFixture & { hidden: boolean }) @{
	<Activity mode={props.hidden ? 'hidden' : 'visible'}>
		<SignalReader {...props} />
	</Activity>
}

export function NativeErrorBoundary(props: ResourceFixture) @{
	@try {
		<NativeAsyncValue {...props} />
	} @pending {
		<p class="pending">{'loading'}</p>
	} @catch (_error, reset) {
		<button class="caught" onClick={reset}>{'reset boundary'}</button>
	}
}

function DeletionWriter(props: CounterFixture & { deleted?: () => void }) @{
	useLayoutEffect(
		() => () => {
			props.scope.set(props.count$, 1);
			props.deleted?.();
		},
		[],
	);
	<i class="deleted">{'delete me'}</i>
}

export function NativeDeletionRace(props: CounterFixture & {
	show: boolean;
	log: (entry: string) => void;
	deleted?: () => void;
}) @{
	const value = props.scope.get(props.count$);
	const output = useRef<HTMLOutputElement | null>(null);
	useLayoutEffect(() => {
		props.log(
			'commit:' + value + ':' + output.current?.textContent + ':live:' +
				props.scope.get(props.count$),
		);
	}, [value, props.show]);
	<section>
		@if (props.show) {
			<DeletionWriter {...props} />
		}
		<output ref={output}>{String(value)}</output>
	</section>
}

type NativeFallbackProps =
	ResourceFixture & {
		log: (entry: string) => void;
		hostRef?: (node: HTMLParagraphElement | null) => void;
	};

function NativeFallbackSample(props: NativeFallbackProps) @{
	const value = props.scope.get(props.count$);
	const output = useRef<HTMLOutputElement | null>(null);
	useLayoutEffect(() => {
		props.log(value + ':' + output.current?.textContent + ':' + props.scope.get(props.count$));
	}, [value, props.log]);
	<output class="sampled-fallback" ref={output}>{String(value)}</output>
}

function NativeBoundaryCleanupWriter(props: ResourceFixture) @{
	useLayoutEffect(() => () => props.scope.set(props.count$, 1), []);
	<i class="cleanup-writer">{'writer'}</i>
}

export function NativeDetachedErrorCleanup(props: NativeFallbackProps) @{
	<ErrorBoundary fallback={<NativeFallbackSample {...props} />}>
		<section>
			<NativeBoundaryCleanupWriter {...props} />
			<Suspense fallback={<i class="pending">{'waiting'}</i>}>
				<NativeAsyncValue {...props} />
			</Suspense>
		</section>
	</ErrorBoundary>
}

function NativePrimaryCleanup(props: NativeFallbackProps) @{
	const value = props.scope.get(props.value$);
	useLayoutEffect(() => () => props.scope.set(props.count$, 1), []);
	<p class="cleanup-primary" ref={props.hostRef}>{value}</p>
}

export function NativeTimedCleanup(props: NativeFallbackProps) @{
	@try {
		<NativePrimaryCleanup {...props} />
	} @pending {
		<NativeFallbackSample {...props} />
	} @catch (_error) {
		<p class="caught">{'caught'}</p>
	}
}

export function NativeSupersessionReader(props: CounterFixture & {
	label: string;
	phase: 'ref' | 'layout' | 'write';
	log: (entry: string) => void;
	replace: () => void;
}) @{
	const value = props.scope.get(props.count$);
	useLayoutEffect(() => {
		props.log('layout-first:' + props.label + ':' + value);
		if (props.phase === 'layout' && props.label === 'A') props.replace();
	}, [props.label, value]);
	useLayoutEffect(() => {
		props.log('layout-second:' + props.label + ':' + value);
	}, [props.label, value]);
	<section>
		<span
			ref={(node: HTMLSpanElement | null) => {
				if (node === null) return;
				props.log('ref-first:' + props.label + ':' + value);
				if (props.phase === 'ref' && props.label === 'A') props.replace();
				if (props.phase === 'write' && value === 1) props.scope.set(props.count$, 2);
			}}
		>
			{props.label + ':' + value}
		</span>
		<span
			ref={(node: HTMLSpanElement | null) => {
				if (node !== null) props.log('ref-second:' + props.label + ':' + value);
			}}
		>
			{props.label + ':' + value}
		</span>
	</section>
}

export function NativeStablePublication(props: CounterFixture & {
	label: string;
	stableRef: ((node: HTMLSpanElement | null) => void) | { current: HTMLSpanElement | null };
	log: (entry: string) => void;
	replace: () => void;
}) @{
	const value = props.scope.get(props.count$);
	useLayoutEffect(() => {
		props.log('setup:' + props.label);
		return () => props.log('cleanup:' + props.label);
	}, [123]);
	<section>
		<span
			ref={(node: HTMLSpanElement | null) => {
				if (node !== null && props.label === 'A') props.replace();
			}}
		>
			{props.label + ':' + value}
		</span>
		<span class="stable-ref" ref={props.stableRef}>{props.label + ':' + value}</span>
	</section>
}
