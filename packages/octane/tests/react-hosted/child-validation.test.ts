/**
 * Phase 0 spike — §3: development validation of the transported child element
 * and the child `ref` decision.
 *
 * The compat site consumes exactly one compiled Octane component element as a
 * `{ type, props, key }` transport. Static typing cannot reject an ordinary
 * React component at that site (every JSX expression types as
 * `ReactElement<any, any>` — see typetests/react-hosted-jsx.test-d.tsx), so
 * these runtime diagnostics are the actual §3 rejection contract.
 *
 * Child ref decision (open question 12): React 19 delivers `ref` inside
 * element props and never invokes the child element, so the spike passes it
 * through as an ordinary Octane ref prop — it must never be claimed by React.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import {
	h,
	octaneChild,
	mountReactHost,
	OctaneCompatSpike,
	SpikeErrorBoundary,
} from './_react-host.js';
import { BadgeIsland, RefIsland } from './_fixtures/islands.tsrx';

let quietConsoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	// React 19 dev logs every boundary-caught render error; the rejection cases
	// below throw deliberately.
	quietConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => quietConsoleError.mockRestore());

async function mountExpectingRejection(children: React.ReactNode): Promise<string> {
	let caught: unknown = null;
	const mounted = await mountReactHost(
		h(
			SpikeErrorBoundary,
			{
				fallback: (error: unknown) => {
					caught = error;
					return h('p', { className: 'rejected' }, 'rejected');
				},
			} as any,
			h(OctaneCompatSpike, null, children),
		),
	);
	expect(mounted.container.querySelector('.rejected')).not.toBeNull();
	await mounted.unmount();
	return (caught as Error).message;
}

describe('react-hosted island — §3 child validation', () => {
	it('rejects a host element child', async () => {
		const message = await mountExpectingRejection(h('div', null, 'raw dom'));
		expect(message).toMatch(/cannot host the DOM element <div>/);
	});

	it('rejects a Fragment child', async () => {
		const message = await mountExpectingRejection(h(React.Fragment, null, h('span', null, 'frag')));
		expect(message).toMatch(/Fragments or exotic React elements/);
	});

	it('rejects multiple children', async () => {
		const message = await mountExpectingRejection([
			octaneChild(BadgeIsland, { label: 'a' }, 'a'),
			octaneChild(BadgeIsland, { label: 'b' }, 'b'),
		]);
		expect(message).toMatch(/exactly one Octane component element/);
	});

	it('rejects a plain renderable child', async () => {
		const message = await mountExpectingRejection('just text');
		expect(message).toMatch(/not a plain renderable/);
	});

	it('rejects an ordinary (unbranded) React component before Octane invokes it', async () => {
		let reactComponentRendered = false;
		function OrdinaryReact() {
			reactComponentRendered = true;
			return h('p', null, 'react');
		}
		const message = await mountExpectingRejection(h(OrdinaryReact));
		expect(message).toMatch(/ordinary React component/);
		expect(reactComponentRendered).toBe(false);
	});

	it('passes the child ref through as an ordinary Octane ref prop, never claimed by React', async () => {
		const refTargets: (Element | null)[] = [];
		const mounted = await mountReactHost(
			h(
				OctaneCompatSpike,
				null,
				octaneChild(RefIsland, {
					ref: (element: Element | null) => refTargets.push(element),
				}),
			),
		);
		// The ref attached to the OCTANE-owned element inside the island — not to
		// the React-owned host and not swallowed by React's ref plumbing.
		expect(refTargets).toHaveLength(1);
		expect((refTargets[0] as Element).className).toBe('ref-island');
		expect(refTargets[0]).toBe(mounted.host().querySelector('.ref-island'));

		await mounted.unmount();
		expect(refTargets).toEqual([expect.any(Element), null]);
	});
});
