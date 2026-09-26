import {
	createElement,
	createPortal,
	ErrorBoundary,
	HYDRATION_RANGE_BOUNDARY,
	Suspense,
	useState,
	type ComponentBody,
	type OctaneNode,
} from 'octane';

interface ChildProps {
	children?: OctaneNode;
	key?: string;
}

interface Deferred {
	ready: boolean;
	promise: Promise<void>;
	failed?: boolean;
}

interface PortalProps extends ChildProps {
	target: Element;
	deferred?: Deferred;
}

interface ListProps {
	portalTarget: Element;
	order?: ('head' | 'body' | 'after')[];
	deferred?: Deferred;
	failOwner?: boolean;
	failAfterOwner?: boolean;
	pair?: boolean;
}

interface ArrayProps {
	portalTarget: Element;
	order?: ('head' | 'body' | 'after' | 'portal')[];
	deferred?: Deferred;
	directOwner?: boolean;
}

interface NestedListProps {
	portalTarget: Element;
	inner?: ('a' | 'body' | 'b')[];
	outer?: ('h' | 'middle' | 't')[];
}

interface FailingListProps extends ListProps {
	fallbackDeferred?: Deferred;
}

function HydrationOwner(props: ChildProps) {
	return props.children;
}

HydrationOwner[HYDRATION_RANGE_BOUNDARY] = 'owner';

function BoundaryHost(props: ChildProps) {
	return createElement(HydrationOwner, {}, props.children);
}

function Passthrough(props: ChildProps) @{
	<>
		{props.children}
	</>
}

function PortalBridge(props: PortalProps) {
	return createPortal(props.children, props.target);
}

function DeferredPortal(props: PortalProps) {
	// The conditional component selection supplies a deferred value here.
	if (props.deferred!.failed) throw new Error('portal failed');
	if (!props.deferred!.ready) throw props.deferred!.promise;
	return createPortal(props.children, props.target);
}

function ThrowingContent() {
	throw new Error('owner failed');
}

function DeferredFailure(props: { deferred: Deferred }) {
	if (!props.deferred.ready) throw props.deferred.promise;
	return createElement('p', { id: 'range-boundary-error' }, 'failed');
}

function Interactive() @{
	const [count, setCount] = useState(0);
	<button
		id="range-boundary-counter"
		onClick={() => setCount(count + 1)}
	>{`count ${count}`}</button>
}

function InteractivePair() @{
	<>
		<Interactive />
		<p id="range-boundary-extra">extra</p>
	</>
}

export function ServerSelection() @{
	<BoundaryHost>
		<Interactive />
	</BoundaryHost>
}

export function ServerListSelection() {
	return createElement(Interactive);
}

export function ServerPartialOwner() {
	return createElement(Passthrough, {}, createElement(Interactive));
}

export function ServerPairSelection() {
	return createElement(InteractivePair);
}

export function BoundaryClient(props: { portalTarget: Element; enabled: boolean }) @{
	<Passthrough>
		<PortalBridge target={props.portalTarget}>
			<span id="range-boundary-portal">portal</span>
		</PortalBridge>
		@try {
			@if (props.enabled) {
				<BoundaryHost>
					<Interactive />
				</BoundaryHost>
			}
		} @catch (error) {
			<p>{String(error)}</p>
		}
	</Passthrough>
}

BoundaryClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

// A document shell can return an array containing both a head portal and the
// selected body owner. Only the owner's content exists in the hydration root.
export function BoundaryListClient(props: ListProps) {
	const children = {
		head: createElement(
			PortalBridge,
			{ key: 'head', target: props.portalTarget },
			createElement('span', { id: 'range-boundary-portal' }, 'portal'),
		),
		body: createElement(
			BoundaryHost,
			{ key: 'body' },
			props.failAfterOwner
				? createElement(Passthrough, {}, createElement(Interactive), createElement(ThrowingContent))
				: createElement(
						props.failOwner
							? ThrowingContent
							: props.pair
								? InteractivePair
								: Interactive,
					),
		),
		after: createElement(
			props.deferred ? DeferredPortal : PortalBridge,
			{ key: 'after', target: props.portalTarget, deferred: props.deferred },
			createElement('span', { id: 'range-boundary-portal-after' }, 'after'),
		),
	};
	return createElement(
		Passthrough,
		{},
		...(props.order ?? ['head', 'body', 'after']).map((key) => children[key]),
	);
}

BoundaryListClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

function DeferredText(props: { deferred?: Deferred }) {
	if (props.deferred !== undefined && !props.deferred.ready) throw props.deferred.promise;
	return 'tail';
}

function Children(props: ChildProps) {
	return props.children;
}

function Tail(props: { deferred?: Deferred }) {
	return createElement(
		'p',
		{ id: 'range-boundary-tail' },
		createElement(DeferredText, { deferred: props.deferred }),
	);
}

// A shell may return its logical siblings as a bare array rather than through
// a fragment's children hole, including client-only host content after the
// selected owner.
export function BoundaryArrayClient(props: ArrayProps) {
	const children = {
		head: createElement(
			PortalBridge,
			{ key: 'head', target: props.portalTarget },
			createElement('span', { id: 'range-boundary-portal' }, 'portal'),
		),
		body: createElement(
			props.directOwner ? HydrationOwner : BoundaryHost,
			{ key: 'body' },
			createElement(Interactive),
		),
		after: createElement(Tail, { key: 'after', deferred: props.deferred }),
		portal: createElement(
			Children,
			{ key: 'portal' },
			createPortal(
				createElement('span', { id: 'range-boundary-portal-after' }, 'after'),
				props.portalTarget,
			),
		),
	};
	return (props.order ?? ['head', 'body', 'after', 'portal']).map((key) => children[key]);
}

BoundaryArrayClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

export function BoundarySuspendingArrayClient(props: ArrayProps) {
	return createElement(
		Suspense as ComponentBody<BoundaryConfig>,
		{ fallback: null },
		createElement(BoundaryArrayClient, props),
	);
}

BoundarySuspendingArrayClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

export function BoundaryNestedListClient(props: NestedListProps) {
	const portal = (key: 'h' | 't' | 'a' | 'b') => createElement(
		PortalBridge,
		{ key, target: props.portalTarget },
		createElement('span', { id: `range-boundary-${key}` }, key),
	);
	const inner = {
		a: portal('a'),
		body: createElement(BoundaryHost, { key: 'body' }, createElement(Interactive)),
		b: portal('b'),
	};
	const outer = {
		h: portal('h'),
		middle: createElement(
			Passthrough,
			{ key: 'middle' },
			...(props.inner ?? ['a', 'body', 'b']).map((key) => inner[key]),
		),
		t: portal('t'),
	};
	return createElement(
		Passthrough,
		{},
		...(props.outer ?? ['h', 'middle', 't']).map((key) => outer[key]),
	);
}

BoundaryNestedListClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

// createElement supplies boundary children as trailing arguments rather than in
// its config object, so describe only the config accepted at these call sites.
type BoundaryConfig = { fallback?: OctaneNode; key?: string };

export function BoundarySuspendingListClient(props: ListProps) {
	return createElement(
		Suspense as ComponentBody<BoundaryConfig>,
		{ fallback: null },
		createElement(BoundaryListClient, props),
	);
}

BoundarySuspendingListClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

export function BoundaryPendingHeadClient(props: { portalTarget: Element; deferred: Deferred }) {
	return createElement(
		Passthrough,
		{},
		createElement(
			Suspense as ComponentBody<BoundaryConfig>,
			{
				key: 'head',
				fallback: createPortal(
					createElement('span', { id: 'range-boundary-head-pending' }, 'pending'),
					props.portalTarget,
				),
			},
			createElement(
				DeferredPortal,
				{ deferred: props.deferred, target: props.portalTarget },
				createElement('span', { id: 'range-boundary-portal' }, 'portal'),
			),
		),
		createElement(BoundaryHost, { key: 'body' }, createElement(Interactive)),
	);
}

BoundaryPendingHeadClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

export function BoundaryFailingListClient(props: FailingListProps) {
	return createElement(
		ErrorBoundary as ComponentBody<BoundaryConfig>,
		{
			fallback: props.fallbackDeferred
				? createElement(DeferredFailure, { deferred: props.fallbackDeferred })
				: createElement('p', { id: 'range-boundary-error' }, 'failed'),
		},
		createElement(BoundaryListClient, props),
	);
}

BoundaryFailingListClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';

export function BoundaryFailingSuspenseClient(props: FailingListProps) {
	return createElement(
		Suspense as ComponentBody<BoundaryConfig>,
		{ fallback: null },
		createElement(BoundaryFailingListClient, props),
	);
}

BoundaryFailingSuspenseClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
