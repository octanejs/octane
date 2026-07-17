/**
 * Built (vite SSR bundle, octane compiled in, react/react-dom external) entry
 * the harness drives inside jsdom. Mounts one React 19 root that owns N host
 * elements, then attaches one hosted Octane root (with a minimal
 * RendererRegionOwnerBridge owner) inside each host — the Phase 0 island
 * architecture, without contexts or suspensions, so the counts isolate the
 * per-island structural cost.
 */
import * as React from 'react';
import { flushSync as reactFlushSync } from 'react-dom';
import { createRoot as createReactRoot } from 'react-dom/client';
import { createRoot as createOctaneRoot, delegateEvents, type Root } from 'octane';
import { ClickIsland, EmptyIsland, IslandEnvelope } from './islands.tsrx';

// A realistic app-wide delegated-event registry: compiled modules call
// delegateEvents() at load for every event type they bind. The current runtime
// attaches EVERY known type to EVERY root (§8.1) — the baseline this suite pins.
delegateEvents(['click', 'input', 'change', 'keydown', 'submit']);

const RENDERER_REGION_OWNER = Symbol.for('octane.renderer-region.owner');

export type Scenario = 'empty' | 'one-click' | 'all-click';

export interface IslandPage {
	hosts: HTMLElement[];
	bridgeBindings: number;
	octaneRoots: number;
	unmount(): void;
}

function makeOwner(counters: { bindings: number }) {
	const disposers = new Set<() => void>();
	return {
		owner: {
			active: true,
			readContext<T>(context: { defaultValue: T }): T {
				return context.defaultValue;
			},
			routeError(): boolean {
				return false;
			},
			routeSuspense(): boolean {
				return false;
			},
			registerDispose(dispose: () => void): () => void {
				counters.bindings++;
				disposers.add(dispose);
				return () => disposers.delete(dispose);
			},
		},
		dispose(): void {
			for (const dispose of [...disposers]) dispose();
			disposers.clear();
		},
	};
}

export function mountIslandPage(count: number, scenario: Scenario): IslandPage {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const reactRoot = createReactRoot(container);
	const h = React.createElement;
	reactFlushSync(() => {
		reactRoot.render(
			h(
				'main',
				null,
				Array.from({ length: count }, (_, index) =>
					h('div', { key: index, 'data-octane-compat': '' }),
				),
			),
		);
	});
	const hosts = [...container.querySelectorAll('[data-octane-compat]')] as HTMLElement[];

	const counters = { bindings: 0 };
	const owners: Array<{ dispose(): void }> = [];
	const roots: Root[] = [];
	const noop = () => {};
	for (let index = 0; index < hosts.length; index++) {
		const clicky = scenario === 'all-click' || (scenario === 'one-click' && index === 0);
		const { owner, dispose } = makeOwner(counters);
		owners.push({ dispose });
		const props: Record<string, unknown> = {
			body: clicky ? ClickIsland : EmptyIsland,
			bodyProps: clicky ? { index, onPing: noop } : { index },
		};
		Object.defineProperty(props, RENDERER_REGION_OWNER, { value: owner, enumerable: false });
		const root = createOctaneRoot(hosts[index]);
		root.render(IslandEnvelope as never, props);
		roots.push(root);
	}

	return {
		hosts,
		get bridgeBindings() {
			return counters.bindings;
		},
		octaneRoots: roots.length,
		unmount() {
			for (const { dispose } of owners) dispose();
			reactFlushSync(() => reactRoot.unmount());
			container.remove();
		},
	};
}

/** Register one MORE delegated type while N roots are live (back-attach cost). */
export function registerLateEventType(type: string): void {
	delegateEvents([type]);
}
