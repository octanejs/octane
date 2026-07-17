/**
 * `octane/react/server` — the hosted SERVER implementation of `OctaneCompat`
 * (react-hosted-octane-compat-plan.md §9.1–§9.2). Use it wherever React runs
 * on the server (Fizz streaming or `renderToString`); the client entry
 * (`octane/react`) hydrates its output.
 *
 * Per island, one synchronous hosted Octane attempt runs INSIDE the React
 * component render against a session that persists across that island's Fizz
 * retries (keyed on the Fizz-stable transported props identity):
 *
 * - React context reads inside the island call `React.use(context)` directly —
 *   no Fiber, registry, or subscription machinery exists on the server (§6.4).
 * - An unhandled island suspension is delegated to `React.use(stratum)`, where
 *   the stratum is an identity-stable, status-stamped aggregate recorded into
 *   the session — Fizz's positional replay state can therefore never loop on a
 *   fresh Octane pass, parallel-use strata cost one replay each, and settled
 *   strata unwrap synchronously (Phase 0 evidence, §9.1).
 * - Unhandled island errors throw out of the component into Fizz's nearest
 *   boundary/error handling; React error boundaries do not catch server errors.
 * - Scoped island CSS is emitted as React 19 style resources (stable
 *   per-hash `href`, `precedence="octane"`), so Fizz hoists and deduplicates
 *   across islands; hoisted `<title>/<meta>/<link>` output is REJECTED in v1
 *   with a targeted diagnostic (§9.2).
 * - The island HTML is written through `dangerouslySetInnerHTML` on the host
 *   element with `suppressHydrationWarning`; the client's stable opaque
 *   sentinel keeps React from ever touching the descendants (§9.3).
 */
import * as React from 'react';
import { createElement as createOctaneServerElement } from '../server/index.js';
import {
	createHostedServerSession,
	renderHostedAttempt,
	type HostedServerSession,
} from '../runtime.server.js';
import { validateIslandChild, type OctaneCompatProps, type TransportedChild } from './shared.js';

export type { OctaneCompatProps, OctaneReactComponent, OctaneRenderedNode } from './shared.js';

/**
 * Server envelope: marker-parity twin of the client root envelope — the
 * transported child renders as one value-position element (keyed identically),
 * so client hydration adopts the exact server structure. No owner bridge
 * exists on the server; foreign context reads flow through the §6.4 hook.
 */
function hostedServerEnvelope(props: {
	body: unknown;
	bodyProps: unknown;
	bodyKey: string | null;
}): unknown {
	const config =
		props.bodyKey === null
			? props.bodyProps
			: { ...(props.bodyProps as object), key: props.bodyKey };
	return createOctaneServerElement(props.body as never, config as never);
}

/**
 * Fizz replays a suspended task with the IDENTICAL props object, so the
 * transported child's props are request-local, replay-stable session keys
 * (Phase 0, §9.1) — no module-global request state, no AsyncLocalStorage.
 */
const SESSIONS = new WeakMap<object, HostedServerSession>();

function sessionFor(child: TransportedChild): HostedServerSession {
	const key = child.props;
	let session = SESSIONS.get(key);
	if (session === undefined) {
		session = createHostedServerSession();
		SESSIONS.set(key, session);
	}
	return session;
}

export function OctaneCompat(props: OctaneCompatProps): React.ReactNode {
	const child = validateIslandChild(props.children);
	// The island-stable identifier prefix; the client wrapper derives the same
	// value at the same tree position, so Octane ids hydrate byte-identically.
	const identifierPrefix = React.useId();
	const session = sessionFor(child);

	// Replay committed strata IN ORDER: identity-stable and status-stamped, so
	// settled ones unwrap synchronously and use()-call positions stay aligned
	// across Fizz replays (§9.1 — order determinism is hard correctness).
	for (const stratum of session.strata) React.use(stratum as PromiseLike<void>);

	const attempt = renderHostedAttempt(
		session,
		hostedServerEnvelope as never,
		{ body: child.type, bodyProps: child.props, bodyKey: child.key },
		{
			identifierPrefix,
			// §6.4: the hosted context reader IS React's — nearest provider,
			// defaults, and Fizz semantics come along for free.
			readForeignContext: (context) => React.use(context as React.Context<unknown>),
		},
	);
	if (attempt.status === 'suspended') {
		// Delegate the wait to Fizz; the replay re-enters with the session.
		React.use(attempt.stratum as Promise<void>);
	}
	if (attempt.status !== 'complete') {
		// Unreachable: use(pending) throws. Narrow for TypeScript.
		throw new Error('octane/react/server: hosted attempt did not complete.');
	}
	if (attempt.head.length > 0) {
		// §9.2 v1 policy: hoisted head output cannot land under a body host.
		throw new Error(
			'<OctaneCompat> islands cannot hoist <title>/<meta>/<link> to the document head ' +
				'during React SSR yet; render head resources from the React tree instead.',
		);
	}

	const children: React.ReactNode[] = [];
	for (const [hash, css] of attempt.cssEntries) {
		// React 19 style resources: Fizz hoists and dedupes by href across
		// islands. React serializes the href as `data-href="octane-<hash>"`
		// (and drops any other attribute), which octane hydration's style
		// detection recognizes — no re-injection client-side.
		children.push(
			React.createElement(
				'style',
				{ key: `css-${hash}`, href: `octane-${hash}`, precedence: 'octane' },
				css,
			),
		);
	}
	children.push(
		React.createElement('div', {
			key: 'host',
			'data-octane-compat': '',
			suppressHydrationWarning: true,
			dangerouslySetInnerHTML: { __html: attempt.html },
		}),
	);
	return React.createElement(React.Fragment, null, ...children);
}
