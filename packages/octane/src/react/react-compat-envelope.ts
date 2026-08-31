/** React-owned structure shared by client rendering and buffered React SSR. */
import * as React from 'react';

export interface ReactCompatObserver {
	pending(visibility: ReactCompatVisibility): void;
	ready(): void;
	error(error: unknown): void;
}

export interface ReactCompatContextValue {
	readonly context: React.Context<any>;
	readonly value: unknown;
}

export type ReactCompatVisibility = 'visible' | 'suspense' | 'activity';

class IslandErrorBoundary extends React.Component<
	{ observer: ReactCompatObserver | null; children?: React.ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error: unknown) {
		this.props.observer?.error(error);
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
}

export function isReactCompatErrorBoundary(value: unknown): boolean {
	return value instanceof IslandErrorBoundary;
}

// A host Suspense hide parks the React primary through React's own boundary,
// retaining its connected passive effects while hiding portals and refs too.
// It is not a resource and never settles; revealing removes the throwing gate.
const PARKED = new Promise<never>(() => {});

function VisibilityGate(props: { visibility: ReactCompatVisibility; children?: React.ReactNode }) {
	if (props.visibility === 'suspense') throw PARKED;
	return props.children;
}

function PendingProbe({
	observer,
	visibility,
}: {
	observer: ReactCompatObserver | null;
	visibility: ReactCompatVisibility;
}) {
	React.useLayoutEffect(() => {
		// A fallback may survive external parking followed by a real resource
		// suspension. Its committed visibility distinguishes those two causes.
		observer?.pending(visibility);
	}, [observer, visibility]);
	React.useInsertionEffect(() => {
		// A fallback's removal also witnesses completion while an outer React
		// Activity has disconnected layout effects. The controller defers this
		// signal to a microtask and ignores disposal/error/superseded observers.
		return () => observer?.ready();
	}, [observer]);
	return null;
}

function ContentProbe(props: { observer: ReactCompatObserver | null; children?: React.ReactNode }) {
	React.useInsertionEffect(() => {
		props.observer?.ready();
	}, [props.observer]);
	React.useLayoutEffect(() => {
		// React reconnects this effect when its Suspense primary is revealed,
		// including autonomous updates that never called the outer root.render.
		props.observer?.ready();
	}, [props.observer]);
	return props.children;
}

export function createReactCompatTree(
	child: React.ReactElement,
	contexts: readonly ReactCompatContextValue[],
	observer: ReactCompatObserver | null,
	visibility: ReactCompatVisibility = 'visible',
): React.ReactElement {
	if (React.Activity === undefined) {
		throw new Error(
			'<ReactCompat> requires React and React DOM 19.2 or newer in the React 19 series.',
		);
	}
	let content: React.ReactNode = child;
	for (let index = contexts.length - 1; index >= 0; index--) {
		const entry = contexts[index];
		content = React.createElement(entry.context, { value: entry.value }, content);
	}
	return React.createElement(
		// Keep the transport error callback connected while the island is hidden.
		// Otherwise a cleanup error can wait for reveal and be lost on deletion.
		IslandErrorBoundary,
		{ observer },
		React.createElement(
			React.Activity,
			{ mode: visibility === 'activity' ? 'hidden' : 'visible', children: undefined },
			React.createElement(
				React.Suspense,
				{ fallback: React.createElement(PendingProbe, { observer, visibility }) },
				React.createElement(
					VisibilityGate,
					{ visibility },
					React.createElement(ContentProbe, { observer }, content),
				),
			),
		),
	);
}
