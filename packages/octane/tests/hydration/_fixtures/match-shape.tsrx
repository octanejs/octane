// Mirrors the octane-router `Match` composition: a chain of DYNAMIC component
// slots resolved in setup (Shell/Suspense/Catch/NotFound wrappers that are
// either a real boundary or a SafeFragment passthrough), a context provider,
// an `@try`-based catch boundary, and an `@if/@else` around the inner match
// content — re-rendered by a `useSyncExternalStore` reset key. The hydrated
// instance of this chain must survive its first post-hydration update without
// remounting (state, effects, and DOM identity preserved).
import {
	HYDRATION_RANGE_BOUNDARY,
	createContext,
	createElement,
	Suspense,
	useLayoutEffect,
	useState,
	useSyncExternalStore,
} from 'octane';
import type { OctaneNode } from 'octane';

export interface ResetStore {
	subscribe: (cb: () => void) => () => void;
	get: () => number;
}

const matchContext = createContext<string | undefined>(undefined);

function SafeFragment(props: any) @{
	<>
		{props.children}
	</>
}

function CatchBoundary(props: {
	getResetKey: () => number;
	children: OctaneNode;
	onCatch?: (error: Error) => void;
}) @{
	@try {
		<>
			{props.children}
		</>
	} @catch (error: unknown) {
		<div class="match-error">{String(error)}</div>
	}
}

function CatchNotFound(props: {
	fallback: (error: Error) => OctaneNode;
	children: OctaneNode;
}) @{
	@try {
		<>
			{props.children}
		</>
	} @catch (error: unknown) {
		<>
			{props.fallback(error as Error)}
		</>
	}
}

function MatchInner(props: { log: string[] }) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.log.push('mount:inner');
		return () => props.log.push('unmount:inner');
	}, []);
	<button class="inner-button" onClick={() => setCount(count + 1)}>
		{'inner:' + count}
	</button>
}

export function MatchShape(props: {
	store: ResetStore;
	log: string[];
	displayPending?: boolean;
	withBoundaries?: boolean;
}) @{
	const resetKey = useSyncExternalStore(
		(cb) => props.store.subscribe(cb),
		() => props.store.get(),
		() => props.store.get(),
	);

	// Boundary presence is decided in setup, exactly like Match resolves
	// SuspenseWrap/CatchWrap/NotFoundWrap from route options.
	const SuspenseWrap = props.withBoundaries ? Suspense : SafeFragment;
	const CatchWrap = props.withBoundaries ? CatchBoundary : SafeFragment;
	const NotFoundWrap = props.withBoundaries ? CatchNotFound : SafeFragment;
	const ShellComponent = SafeFragment;

	<ShellComponent>
		<matchContext.Provider value="match-id">
			<SuspenseWrap fallback={null}>
				<CatchWrap getResetKey={() => resetKey} onCatch={() => undefined}>
					<NotFoundWrap
						fallback={(error: Error) => {
							throw error;
						}}
					>
						@if (props.displayPending) {
							<p class="match-pending">pending</p>
						} @else {
							<MatchInner log={props.log} />
						}
					</NotFoundWrap>
				</CatchWrap>
			</SuspenseWrap>
		</matchContext.Provider>
	</ShellComponent>
}

// --- Start-shaped document shell -------------------------------------------
// Mirrors @octanejs/tanstack-start hydration: the client tree above the document
// body hydrates TRANSPARENTLY (the server shell markup lives outside the
// hydration container), and the owner-stamped passthrough inside the body
// adopts the first server range within `#__app`.

function HydrationRangeOwner(props: { children?: unknown }) {
	return props.children;
}
(HydrationRangeOwner as any)[HYDRATION_RANGE_BOUNDARY] = 'owner';

function Html(props: { isServer?: boolean; children?: unknown }) {
	const { children, isServer, ...attrs } = props as Record<string, unknown>;
	if (isServer) return createElement('html', attrs, children);
	return children;
}

function Body(props: { isServer?: boolean; children?: unknown }) {
	const { children, isServer, ...attrs } = props as Record<string, unknown>;
	if (isServer) {
		return createElement(
			'body',
			attrs,
			createElement('div', { id: '__app' }, createElement(HydrationRangeOwner, {}, children)),
		);
	}
	return createElement(HydrationRangeOwner, {}, children);
}

function RootShell(props: { isServer?: boolean; children?: unknown }) @{
	<Html isServer={props.isServer}>
		<Body isServer={props.isServer}>{props.children}</Body>
	</Html>
}

interface StartShapeProps {
	store: ResetStore;
	log: string[];
	isServer?: boolean;
	displayPending?: boolean;
	withBoundaries?: boolean;
}

// The Match analog: shell + provider + boundary chain around the inner
// content, re-rendered by the loadedAt-style reset key.
function StartMatch(props: StartShapeProps) @{
	const resetKey = useSyncExternalStore(
		(cb) => props.store.subscribe(cb),
		() => props.store.get(),
		() => props.store.get(),
	);

	const SuspenseWrap = props.withBoundaries ? Suspense : SafeFragment;
	const CatchWrap = props.withBoundaries ? CatchBoundary : SafeFragment;
	const NotFoundWrap = CatchNotFound;
	const ShellComponent = RootShell;

	<ShellComponent isServer={props.isServer}>
		<matchContext.Provider value="match-id">
			<SuspenseWrap fallback={null}>
				<CatchWrap getResetKey={() => resetKey} onCatch={() => undefined}>
					<NotFoundWrap
						fallback={(error: Error) => {
							throw error;
						}}
					>
						@if (props.displayPending) {
							<p class="match-pending">pending</p>
						} @else {
							<MatchInner log={props.log} />
						}
					</NotFoundWrap>
				</CatchWrap>
			</SuspenseWrap>
		</matchContext.Provider>
	</ShellComponent>
}

// MatchesInner analog: subscribes to the same reset key, wraps the match in
// the always-present global catch boundary.
function StartMatchesInner(props: StartShapeProps) @{
	const resetKey = useSyncExternalStore(
		(cb) => props.store.subscribe(cb),
		() => props.store.get(),
		() => props.store.get(),
	);
	const CatchWrap = CatchBoundary;

	<matchContext.Provider value="root-match-id">
		<CatchWrap getResetKey={() => resetKey} onCatch={() => undefined}>
			@if (true) {
				<StartMatch {...props} />
			}
		</CatchWrap>
	</matchContext.Provider>
}

// Matches analog: InnerWrap passthrough + the always-present root Suspense.
function StartMatches(props: StartShapeProps) @{
	const InnerWrap = SafeFragment;
	<InnerWrap>
		<Suspense fallback={null}>
			<StartMatchesInner {...props} />
		</Suspense>
	</InnerWrap>
}

export function StartShape(props: StartShapeProps) @{
	<StartMatches {...props} />
}
(StartShape as any)[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
