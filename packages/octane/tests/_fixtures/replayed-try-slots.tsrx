import { ErrorBoundary, use, useState } from 'octane';

// A @try at the root of a fragment body whose render updates its own state
// while it evaluates an earlier slot's arguments, so that render replays before
// its slots settle. Strong mode rejects a render-phase update, so these compile
// without it.

/** Pass a value through, scheduling the caller's own update the first time. */
function useSettle(): (value: boolean) => boolean {
	const [settled, setSettled] = useState(false);
	return (value) => {
		if (!settled) setSettled(true);
		return value;
	};
}

// Calls a hook, so it renders through a full component slot.
function StatefulA(props: { a: boolean }) @{
	const [label] = useState('a');
	@if (props.a) {
		<span>{label as string}</span>
	}
}

function ComponentThenTry(props: { a: boolean }) @{
	const settle = useSettle();
	<>
		<StatefulA a={settle(props.a)} />
		@try {
			<span>{'t'}</span>
		} @catch (e) {
			<i>{'x'}</i>
		}
	</>
}

export function ReplayedComponentThenTry(props: { a: boolean }) @{
	<main>
		<ComponentThenTry a={props.a} />
	</main>
}

function IfThenTry(props: { a: boolean }) @{
	const settle = useSettle();
	<>
		@if (settle(props.a)) {
			<span>{'a'}</span>
		}
		@try {
			<span>{'t'}</span>
		} @catch (e) {
			<i>{'x'}</i>
		}
	</>
}

export function ReplayedIfThenTry(props: { a: boolean }) @{
	<main>
		<IfThenTry a={props.a} />
	</main>
}

function ComponentThenPendingTry(props: { a: boolean }) @{
	const settle = useSettle();
	<>
		<StatefulA a={settle(props.a)} />
		@try {
			<span>{'t'}</span>
		} @pending {
			<i>{'p'}</i>
		}
	</>
}

export function ReplayedComponentThenPendingTry(props: { a: boolean }) @{
	<main>
		<ComponentThenPendingTry a={props.a} />
	</main>
}

// The exact imported JSX ErrorBoundary lowers to the catch-only boundary.
function ComponentThenErrorBoundary(props: { a: boolean }) @{
	const settle = useSettle();
	<>
		<StatefulA a={settle(props.a)} />
		<ErrorBoundary fallback={<i>{'x'}</i>}>
			<span>{'t'}</span>
		</ErrorBoundary>
	</>
}

export function ReplayedComponentThenErrorBoundary(props: { a: boolean }) @{
	<main>
		<ComponentThenErrorBoundary a={props.a} />
	</main>
}

function Ready(props: { ready: boolean }) @{
	if (!props.ready) throw new Error('rendered with discarded state');
	<span>{'t'}</span>
}

// The discarded pass still sees `ready` as false. Only the replay may render
// the boundary's body, so its catch arm never shows.
function SettleThenTry(props: { a: boolean }) @{
	const [ready, setReady] = useState(false);
	const settle = (value: boolean) => {
		if (!ready) setReady(true);
		return value;
	};
	<>
		<StatefulA a={settle(props.a)} />
		@try {
			<Ready ready={ready} />
		} @catch (e) {
			<i>{'x'}</i>
		}
	</>
}

export function ReplayedStaleTry(props: { a: boolean }) @{
	<main>
		<SettleThenTry a={props.a} />
	</main>
}

function SettleThenErrorBoundary(props: { a: boolean }) @{
	const [ready, setReady] = useState(false);
	const settle = (value: boolean) => {
		if (!ready) setReady(true);
		return value;
	};
	<>
		<StatefulA a={settle(props.a)} />
		<ErrorBoundary fallback={<i>{'x'}</i>}>
			<Ready ready={ready} />
		</ErrorBoundary>
	</>
}

export function ReplayedStaleErrorBoundary(props: { a: boolean }) @{
	<main>
		<SettleThenErrorBoundary a={props.a} />
	</main>
}

const never = new Promise<never>(() => {});

function Gate(props: { ready: boolean }) @{
	if (!props.ready) use(never);
	<span>{'t'}</span>
}

// The discarded pass would suspend on data the replay never reads: neither
// this boundary's @pending arm nor the enclosing root may show for it.
function SettleThenPending(props: { a: boolean }) @{
	const [ready, setReady] = useState(false);
	const settle = (value: boolean) => {
		if (!ready) setReady(true);
		return value;
	};
	<>
		<StatefulA a={settle(props.a)} />
		@try {
			<Gate ready={ready} />
		} @pending {
			<i>{'p'}</i>
		}
	</>
}

export function ReplayedStalePending(props: { a: boolean }) @{
	<main>
		<SettleThenPending a={props.a} />
	</main>
}

function SettleThenCatchOnly(props: { a: boolean }) @{
	const [ready, setReady] = useState(false);
	const settle = (value: boolean) => {
		if (!ready) setReady(true);
		return value;
	};
	<>
		<StatefulA a={settle(props.a)} />
		@try {
			<Gate ready={ready} />
		} @catch (e) {
			<i>{'x'}</i>
		}
	</>
}

export function ReplayedStaleSuspension(props: { a: boolean }) @{
	<main>
		<SettleThenCatchOnly a={props.a} />
	</main>
}
