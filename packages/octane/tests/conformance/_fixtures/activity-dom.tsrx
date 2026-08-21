import {
	Activity,
	bindRendererRegionOwner,
	createContext,
	createElement,
	createPortal,
	memo,
	use,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from 'octane';
import { useRepeatedSharedInsertions } from './activity-dom-insertion-helpers.js';

export type ActivityMode = 'visible' | 'hidden';
export type InputReference = { current: HTMLInputElement | null };
export type ButtonReference = (element: HTMLButtonElement | null) => void | (() => void);
type Log = (entry: string) => void;

interface RefProps {
	mode: ActivityMode;
	objectRef: InputReference;
	callbackRef: ButtonReference | null;
	log: Log;
}

function RefChild(props: RefProps) @{
	useLayoutEffect(() => {
		props.log('layout mount:' + (props.objectRef.current?.id ?? 'null'));
		return () => {
			props.log('layout cleanup:' + (props.objectRef.current?.id ?? 'null'));
		};
	}, []);
	<>
		<input id="activity-ref-input" defaultValue="draft" ref={props.objectRef} />
		<button id="activity-ref-button" type="button" ref={props.callbackRef}>{'button'}</button>
	</>
}

export function ActivityRefHost(props: RefProps) @{
	<main>
		<Activity mode={props.mode}>
			<RefChild {...props} />
		</Activity>
	</main>
}

function DescriptorRefChild(props: RefProps) @{
	useLayoutEffect(() => {
		props.log('layout mount:' + (props.objectRef.current?.id ?? 'null'));
		return () => {
			props.log('layout cleanup:' + (props.objectRef.current?.id ?? 'null'));
		};
	}, []);
	<>
		{createElement('input', {
			id: 'activity-ref-input',
			defaultValue: 'draft',
			ref: props.objectRef,
		})}
		{createElement(
			'button',
			{
				id: 'activity-ref-button',
				type: 'button',
				ref: props.callbackRef,
			},
			'button',
		)}
	</>
}

export function ActivityDescriptorRefHost(props: RefProps) @{
	<main>
		<Activity mode={props.mode}>
			<DescriptorRefChild {...props} />
		</Activity>
	</main>
}

export function NestedActivityRefHost(props: RefProps & { inner: ActivityMode }) @{
	<main>
		<Activity mode={props.mode}>
			<Activity mode={props.inner}>
				<RefChild {...props} />
			</Activity>
		</Activity>
	</main>
}

interface Values {
	display: string | undefined;
	color: string;
	text: string;
}

export function ActivityValuesHost(props: Values & { mode: ActivityMode }) @{
	<main id="activity-values">
		<Activity mode={props.mode}>
			<section
				id="activity-values-styled"
				style={{ display: props.display, color: props.color }}
			>{'styled'}</section>
			{props.text as string}
		</Activity>
	</main>
}

function PortalItem(props: { id: string; display: string; log: Log }) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.log('layout mount:' + props.id);
		return () => props.log('layout cleanup:' + props.id);
	}, []);
	useEffect(() => {
		props.log('passive mount:' + props.id);
		return () => props.log('passive cleanup:' + props.id);
	}, []);
	<button
		id={'activity-portal-' + props.id}
		type="button"
		style={{ display: props.display }}
		onClick={() => setCount((value) => value + 1)}
	>
		{props.id + ':' + count}
	</button>
}

interface PortalProps {
	mode: ActivityMode;
	target: Element;
	secondTarget?: Element;
	showPortal: boolean;
	items: readonly string[];
	display: string;
	log: Log;
}

function PortalContents(props: PortalProps) @{
	<>
		@for (const id of props.items; key id) {
			<PortalItem id={id} display={props.display} log={props.log} />
		}
		@if (props.secondTarget) {
			<aside id="activity-portal-nested-host">{createPortal(
				<PortalItem id="nested" display={props.display} log={props.log} />,
				props.secondTarget,
			)}</aside>
		}
	</>
}

export function ActivityPortalHost(props: PortalProps) @{
	<main>
		<Activity mode={props.mode}>
			<section id="activity-portal-inline">
				@if (props.showPortal) {
					<div>{createPortal(<PortalContents {...props} />, props.target)}</div>
				}
			</section>
		</Activity>
	</main>
}

export function NestedPortalActivityHost(props: {
	outer: ActivityMode;
	inner: ActivityMode;
	target: Element;
}) @{
	<main>
		<Activity mode={props.outer}>
			<section id="activity-portal-inline">{createPortal(
				<Activity mode={props.inner}>
					<button
						id="activity-portal-nested"
						type="button"
						style="display: inline-flex"
					>{'nested'}</button>
				</Activity>,
				props.target,
			)}</section>
		</Activity>
	</main>
}

function MaybeSuspend(props: { pending: boolean; promise: Promise<string> }) @{
	if (props.pending) use(props.promise);
	<span id="activity-portal-ready">{'ready'}</span>
}

function PortalSuspense(props: {
	promise: Promise<string>;
	expose: (setter: (pending: boolean) => void) => void;
}) @{
	const [pending, setPending] = useState(false);
	props.expose(setPending);
	<>
		@try {
			<>
				<strong id="activity-portal-primary" style="display: inline-flex">{'primary'}</strong>
				<MaybeSuspend pending={pending} promise={props.promise} />
			</>
		} @pending {
			<em id="activity-portal-pending">{'loading'}</em>
		}
	</>
}

export function ActivitySuspensePortalHost(props: {
	mode: ActivityMode;
	target: Element;
	promise: Promise<string>;
	expose: (setter: (pending: boolean) => void) => void;
}) @{
	<main>
		<Activity mode={props.mode}>
			<div>{createPortal(
				<PortalSuspense promise={props.promise} expose={props.expose} />,
				props.target,
			)}</div>
		</Activity>
	</main>
}

function AsyncActivityChild(props: { promise: Promise<string>; log: Log }) @{
	const value = use(props.promise);
	useEffect(() => {
		props.log('mount');
		return () => props.log('cleanup');
	}, []);
	<span id="activity-async-child">{value as string}</span>
}

export function ActivityAsyncHost(props: {
	mode: ActivityMode;
	promise: Promise<string>;
	log: Log;
}) @{
	<main>
		@try {
			<>
				<b id="activity-async-sibling">{'visible sibling'}</b>
				<Activity mode={props.mode}>
					<AsyncActivityChild promise={props.promise} log={props.log} />
				</Activity>
			</>
		} @pending {
			<em id="activity-async-fallback">{'loading'}</em>
		}
	</main>
}

export function ActivityGuardedRefHost(props: {
	mode: ActivityMode;
	first: ButtonReference;
	second: ButtonReference;
}) @{
	<main>
		@try {
			<Activity mode={props.mode}>
				<button id="activity-guarded-first" ref={props.first}>{'first'}</button>
				<button id="activity-guarded-second" ref={props.second}>{'second'}</button>
			</Activity>
		} @catch (error) {
			<strong id="activity-guarded-error">{error.message as string}</strong>
		}
	</main>
}

interface StatefulAsyncProps {
	mode: ActivityMode;
	show: boolean;
	promise: Promise<string>;
	expose: (setter: (value: number) => void) => void;
	log: Log;
}

function StatefulAsyncChild(props: StatefulAsyncProps) @{
	const [count, setCount] = useState(0);
	props.expose(setCount);
	const value =
		count === 1 ? use(props.promise) : 'ready';
	useLayoutEffect(() => {
		props.log('layout mount:' + count);
		return () => props.log('layout cleanup:' + count);
	}, [count]);
	useEffect(() => {
		props.log('passive mount:' + count);
		return () => props.log('passive cleanup:' + count);
	}, [count]);
	<>
		<input id="activity-stateful-input" defaultValue="draft" />
		<span id="activity-stateful-value">{value + ':' + count}</span>
	</>
}

export function ActivityStatefulAsyncHost(props: StatefulAsyncProps) @{
	<main>
		@try {
			<>
				<b id="activity-stateful-sibling">{'visible sibling'}</b>
				@if (props.show) {
					<Activity mode={props.mode}>
						<StatefulAsyncChild {...props} />
					</Activity>
				}
			</>
		} @pending {
			<em id="activity-stateful-pending">{'loading'}</em>
		} @catch (error) {
			<strong id="activity-stateful-error">{error.message as string}</strong>
		}
	</main>
}

function InsertionBeforeSuspend(props: { value: number; log: Log }) @{
	useInsertionEffect(() => {
		props.log('insertion mount:' + props.value);
		return () => props.log('insertion cleanup:' + props.value);
	}, [props.value]);
	<i id="activity-insertion-before">{props.value as number}</i>
}

const MemoInsertionBeforeSuspend = memo(InsertionBeforeSuspend);
type InsertionChildVariant = 'plain' | 'memo' | 'cached';

function InsertionAsyncChildren(props: {
	promise: Promise<string>;
	initial: number;
	variant: InsertionChildVariant;
	expose: (setter: (value: number) => void) => void;
	log: Log;
}) @{
	const [value, setValue] = useState(props.initial);
	props.expose(setValue);
	const cachedChild = useMemo(
		() => createElement(InsertionBeforeSuspend, { value, log: props.log }),
		[value, props.log],
	);
	<>
		@switch (props.variant) {
			@case 'memo': {
				<MemoInsertionBeforeSuspend value={value} log={props.log} />
			}
			@case 'cached': {
				{cachedChild}
			}
			@default: {
				<InsertionBeforeSuspend value={value} log={props.log} />
			}
		}
		<MaybeSuspend pending={value === 1} promise={props.promise} />
	</>
}

export function ActivityInsertionAsyncHost(props: {
	mode: ActivityMode;
	promise: Promise<string>;
	initial: number;
	variant: InsertionChildVariant;
	expose: (setter: (value: number) => void) => void;
	log: Log;
}) @{
	<main>
		@try {
			<>
				<b id="activity-insertion-sibling">{'visible sibling'}</b>
				<Activity mode={props.mode}>
					<InsertionAsyncChildren {...props} />
				</Activity>
			</>
		} @pending {
			<em id="activity-insertion-pending">{'loading'}</em>
		}
	</main>
}

function ConditionalInsertionBeforeSuspend(props: {
	value: number;
	enabled: boolean;
	log: Log;
}) @{
	if (props.enabled) {
		useInsertionEffect(() => {
			props.log('insertion mount:' + props.value);
			return () => props.log('insertion cleanup:' + props.value);
		}, [props.value]);
	}
	<i id="activity-insertion-before">{props.value as number}</i>
}

const MemoConditionalInsertionBeforeSuspend = memo(ConditionalInsertionBeforeSuspend);

export function ActivityInsertionRetryHost(props: {
	value: number;
	enabled: boolean;
	pending: boolean;
	promise: Promise<string>;
	log: Log;
}) @{
	<Activity mode="hidden">
		<MemoConditionalInsertionBeforeSuspend
			value={props.value}
			enabled={props.enabled}
			log={props.log}
		/>
		<MaybeSuspend pending={props.pending} promise={props.promise} />
	</Activity>
}

function RepeatedInsertionBeforeSuspend(props: { log: Log }) @{
	useRepeatedSharedInsertions(props.log);
	<i id="activity-insertion-repeated">{'repeated'}</i>
}

const MemoRepeatedInsertionBeforeSuspend = memo(RepeatedInsertionBeforeSuspend);

export function ActivityRepeatedInsertionHost(props: {
	pending: boolean;
	promise: Promise<string>;
	log: Log;
}) @{
	<Activity mode="hidden">
		<MemoRepeatedInsertionBeforeSuspend log={props.log} />
		<MaybeSuspend pending={props.pending} promise={props.promise} />
	</Activity>
}

const InsertionRetryPhaseContext = createContext(0);

function NestedInsertionRetryConsumer(props: { innerPromise: Promise<string>; log: Log }) @{
	const phase = use(InsertionRetryPhaseContext);
	<Activity mode={phase === 2 ? 'hidden' : 'visible'}>
		<MemoInsertionBeforeSuspend value={phase === 0 ? 0 : 1} log={props.log} />
		<MaybeSuspend pending={phase === 2} promise={props.innerPromise} />
	</Activity>
}

function NestedInsertionRetryShell(props: { innerPromise: Promise<string>; log: Log }) @{
	<NestedInsertionRetryConsumer {...props} />
}

const MemoNestedInsertionRetryShell = memo(NestedInsertionRetryShell);

export function ActivityNestedInsertionRetryHost(props: {
	phase: number;
	innerPromise: Promise<string>;
	outerPromise: Promise<string>;
	log: Log;
}) @{
	<InsertionRetryPhaseContext.Provider value={props.phase}>
		<Activity mode="hidden">
			<MemoNestedInsertionRetryShell innerPromise={props.innerPromise} log={props.log} />
			<MaybeSuspend pending={props.phase === 1} promise={props.outerPromise} />
		</Activity>
	</InsertionRetryPhaseContext.Provider>
}

export function ActivityRegionChild(props: { thenable: Promise<void> }) @{
	bindRendererRegionOwner(props);
	use(props.thenable);
	<span id="activity-region-ready">{'ready'}</span>
}
