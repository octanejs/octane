import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { renderToStaticMarkup } from 'octane/server';
import {
	ServerActorView,
	ServerContextView,
	ServerLoggingView,
	ServerNoServerSnapshotView,
	ServerSelectorView,
	ServerWithServerSnapshotView,
	serverMachine,
	startLog,
} from '../_fixtures/server.tsrx';

describe('@octanejs/xstate SSR', () => {
	it('renders the initial actor snapshot through createActorContext without a DOM', () => {
		expect(typeof document).toBe('undefined');

		const { html, css } = renderToStaticMarkup(ServerContextView);

		expect(html).toBe('<span id="context">count=0 state=ready</span>');
		expect(css).toBe('');
	});

	it('renders useActor from the machine input on the server', () => {
		const { html } = renderToStaticMarkup(ServerActorView);

		expect(html).toBe('<span id="actor">count=3 state=ready</span>');
	});

	it('reads a running actor through useSelector on the server', () => {
		const actorRef = createActor(serverMachine, { input: { count: 5 } });
		actorRef.start();
		actorRef.send({ type: 'INC' });

		const { html } = renderToStaticMarkup(ServerSelectorView, { actorRef });

		expect(html).toBe('<span id="selector">count=6</span>');

		actorRef.stop();
	});

	it('does not start an actor as a side effect of server rendering', () => {
		// The machine's entry action is an observable side effect. Actors are
		// started from an effect, and effects never run during
		// renderToStaticMarkup, so rendering the provider must not fire it — while
		// still rendering the initial snapshot.
		startLog.length = 0;

		const { html } = renderToStaticMarkup(ServerLoggingView);

		expect(html).toBe('<span id="logging">state=ready</span>');
		expect(startLog).toEqual([]);
	});

	// OCTANE DIVERGENCE: React's server `useSyncExternalStore` throws "Missing
	// getServerSnapshot, which is required for server-rendered content" when the
	// third argument is absent. Octane treats it as optional and reads
	// `getSnapshot` instead. Unreachable from the binding — `useActor` and
	// `useSelector` both pass their bound `getSnapshot` as the server snapshot —
	// so it takes the hand-rolled actor-like object wired to the native hook.
	// @parity-case ordinary:xstate-server-snapshot-fallback
	it('renders from getSnapshot on the server when a hand-rolled actor supplies no getServerSnapshot', () => {
		const { html } = renderToStaticMarkup(ServerNoServerSnapshotView);

		expect(html).toBe('<span id="no-server-snapshot">count=7 state=ready</span>');
	});

	// The control: when a server snapshot IS supplied it still wins, so the
	// fallback above is a real fallback and not a value both readers agree on.
	// @parity-case ordinary:xstate-server-snapshot-preferred
	it('prefers getServerSnapshot over getSnapshot on the server when both are supplied', () => {
		const { html } = renderToStaticMarkup(ServerWithServerSnapshotView);

		expect(html).toBe('<span id="with-server-snapshot">count=42 state=from-server-snapshot</span>');
	});
});
