import { afterEach, describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import type { AnyRouter } from '@tanstack/router-core';
import { RouterClient } from '@octanejs/tanstack-router/ssr/client';
import { mount, nextPaint } from '../_helpers';
import { createDeferred, makeRouterClientRouter } from '../_fixtures/router-client.tsrx';
// @ts-expect-error the shared fixture plugin compiles the router graph for the server
import * as server from '../_fixtures/router-client.tsrx?octane-ssr';

// Well inside the 300ms window that throttles a Suspense boundary's retry-only
// reveal, so a boundary around the hydration promise would still be hidden.
async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

// The payload router-core's hydrate() reads: the root rendered on the server and
// the ssr:false child is still pending, so hydrate() runs its loader on the client.
function setDehydratedPayload(router: AnyRouter) {
	const [rootMatch, clientMatch] = router.matchRoutes(router.stores.location.get());
	(window as any).$_TSR = {
		router: {
			manifest: undefined,
			lastMatchId: clientMatch.id,
			matches: [
				{ i: rootMatch.id, u: Date.now(), s: 'success', ssr: true },
				{ i: clientMatch.id, u: Date.now(), s: 'pending', ssr: false },
			],
		},
		buffer: [],
	};
}

function isHidden(el: Element, container: Element) {
	for (
		let node: Element | null = el;
		node !== null && node !== container;
		node = node.parentElement
	) {
		if ((node as HTMLElement).style.display === 'none') return true;
	}
	return false;
}

function visible(container: Element, selector: string) {
	return Array.from(container.querySelectorAll(selector)).filter((el) => !isHidden(el, container));
}

afterEach(() => {
	delete (window as any).$_TSR;
});

// Per react-router's ssr/RouterClient.tsx: RouterClient suspends on hydrate()
// through <Await> with no fallback, so no Suspense boundary sits above the
// router. Hydration keeps the server DOM, and the first client commit shows the
// root layout with the pending child's boundary inside it.
describe('@octanejs/tanstack-router — RouterClient', () => {
	it('shows the root layout with the pending child once hydrate() settles', async () => {
		const loader = createDeferred<string>();
		const router = makeRouterClientRouter({ loader });
		setDehydratedPayload(router);

		const r = mount(RouterClient as any, { router });
		await flush();

		expect(router.state.matches.map((m) => m.status)).toEqual(['success', 'pending']);
		expect(visible(r.container, '.root')).toHaveLength(1);
		expect(visible(r.container, '.pending')).toHaveLength(1);

		loader.resolve('client data');
		await flush();

		expect(visible(r.container, '.client').map((el) => el.textContent)).toEqual(['client data']);
		expect(r.container.querySelectorAll('.pending')).toHaveLength(0);
		r.unmount();
	});

	it('adopts the server-rendered root layout while the ssr:false child is pending', async () => {
		const serverRouter = server.makeRouterClientRouter({ isServer: true });
		await serverRouter.load();
		const { html } = renderToString(server.RouterServer, { router: serverRouter });

		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const serverLayout = container.querySelector('.root');
		expect(serverLayout?.querySelector('.pending')).not.toBeNull();

		const loader = createDeferred<string>();
		const router = makeRouterClientRouter({ loader });
		setDehydratedPayload(router);
		const errors: unknown[] = [];
		const root = hydrateRoot(
			container,
			RouterClient as any,
			{ router },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		try {
			// The server DOM stays up while hydrate() is pending.
			expect(container.querySelector('.root')).toBe(serverLayout);
			await flush();

			expect(errors).toEqual([]);
			expect(container.querySelector('.root')).toBe(serverLayout);
			expect(isHidden(serverLayout!, container)).toBe(false);
			expect(visible(container, '.pending')).toHaveLength(1);

			loader.resolve('client data');
			await flush();

			expect(container.querySelector('.root')).toBe(serverLayout);
			expect(visible(container, '.client').map((el) => el.textContent)).toEqual(['client data']);
			expect(container.querySelectorAll('.pending')).toHaveLength(0);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
