/**
 * Phase 0 spike — §9.3: the opaque-host hydration technique.
 *
 * Contract under test, against React 19 DEVELOPMENT and PRODUCTION builds:
 *   - the server writes the real Octane island HTML through
 *     `dangerouslySetInnerHTML` on the React-owned host;
 *   - the client always hydrates the host with one shared FROZEN sentinel
 *     `dangerouslySetInnerHTML` plus `suppressHydrationWarning`;
 *   - React hydration performs ZERO descendant inserts/removes/text writes and
 *     reports no mismatch, so Octane's `hydrateRoot()` can adopt the exact
 *     server node identities afterwards;
 *   - later React re-renders (stable sentinel) never clear the host.
 *
 * jsdom covers DOM-identity and mutation-record evidence; real-browser E2E
 * re-verifies paint/focus behavior in Phase 4 (§13).
 */
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';
import { flushSync as octaneFlushSync, hydrateRoot as octaneHydrateRoot } from '../../src/index.js';
import * as OctaneServerRuntime from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { HydrationIsland } from './_fixtures/hydration-island.tsrx';

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/react-hosted/_fixtures/hydration-island.tsrx',
);
const server = loadServerFixture(FIXTURE);

/**
 * The client-side opaque sentinel: shared, frozen, and identical across every
 * island and every render, so a later React render diffs `__html` as equal and
 * never writes.
 */
const OPAQUE_SENTINEL = Object.freeze({ __html: '<!--octane-compat-island-->' });

interface ReactPair {
	mode: 'development' | 'production';
	React: any;
	ReactDOMClient: any;
	ReactDOMServer: any;
	/** Drain scheduled React work (act in dev; scheduler macrotasks in prod). */
	flush(work?: () => void): Promise<void>;
}

async function loadDevPair(): Promise<ReactPair> {
	const React = await import('react');
	const ReactDOMClient = await import('react-dom/client');
	const ReactDOMServer = await import('react-dom/server');
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	return {
		mode: 'development',
		React,
		ReactDOMClient,
		ReactDOMServer,
		async flush(work) {
			await (React as any).act(async () => {
				work?.();
			});
		},
	};
}

const requireModule = createRequire(import.meta.url);

function purgeReactRequireCache(): void {
	for (const key of Object.keys(requireModule.cache)) {
		if (
			key.includes(`${sep}node_modules${sep}react${sep}`) ||
			key.includes(`${sep}node_modules${sep}react-dom${sep}`) ||
			key.includes(`${sep}node_modules${sep}scheduler${sep}`)
		) {
			delete requireModule.cache[key];
		}
	}
}

/**
 * Load a self-consistent PRODUCTION react/react-dom/scheduler triple. The CJS
 * entry stubs select by NODE_ENV at first require, so the cache is purged and
 * the env toggled around the load. The dev copies imported at the top of this
 * file live in the ESM loader map and are unaffected.
 */
async function loadProdPair(): Promise<ReactPair> {
	const previousEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	purgeReactRequireCache();
	try {
		const React = requireModule('react');
		const ReactDOMClient = requireModule('react-dom/client');
		const ReactDOMServer = requireModule('react-dom/server');
		expect(React.version).toMatch(/^19\./);
		// Production builds have no act(): drain the scheduler's macrotask queue.
		return {
			mode: 'production',
			React,
			ReactDOMClient,
			ReactDOMServer,
			async flush(work) {
				work?.();
				for (let turn = 0; turn < 20; turn++) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			},
		};
	} finally {
		process.env.NODE_ENV = previousEnv;
		// Leave no production entries behind for later CJS loads in this worker.
		purgeReactRequireCache();
	}
}

function collectMutations(target: Element): { records: MutationRecord[]; stop: () => void } {
	const records: MutationRecord[] = [];
	const observer = new MutationObserver((batch) => records.push(...batch));
	observer.observe(target, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
	return {
		records,
		stop: () => {
			records.push(...observer.takeRecords());
			observer.disconnect();
		},
	};
}

function describeRecords(records: MutationRecord[]): string[] {
	return records.map((record) => `${record.type}:${(record.target as Element).nodeName}`);
}

async function runOpaqueHydrationScenario(pair: ReactPair): Promise<void> {
	const { React, ReactDOMClient, ReactDOMServer } = pair;
	const h = React.createElement;

	// ── server pass: real Octane HTML inside the React page ────────────────
	const islandA = OctaneServerRuntime.renderToString(server.HydrationIsland, { name: 'A' });
	const islandB = OctaneServerRuntime.renderToString(server.HydrationIsland, { name: 'B' });
	function Page(props: { shell: string; islands?: { a: string; b: string } }) {
		const island = (html?: string, key?: string) =>
			h('div', {
				key,
				'data-octane-compat': '',
				suppressHydrationWarning: true,
				dangerouslySetInnerHTML: html !== undefined ? { __html: html } : OPAQUE_SENTINEL,
			});
		return h(
			'main',
			null,
			h('h1', { className: 'shell' }, `shell:${props.shell}`),
			island(props.islands?.a, 'a'),
			island(props.islands?.b, 'b'),
		);
	}
	const pageHtml = ReactDOMServer.renderToString(
		h(Page, { shell: 's0', islands: { a: islandA.html, b: islandB.html } }),
	);

	const container = document.createElement('div');
	container.innerHTML = pageHtml;
	document.body.appendChild(container);
	try {
		const hosts = container.querySelectorAll('[data-octane-compat]');
		expect(hosts).toHaveLength(2);
		const hostA = hosts[0] as HTMLElement;
		const hostB = hosts[1] as HTMLElement;
		expect(hostA.innerHTML).toBe(islandA.html);
		const serverTitleA = hostA.querySelector('.hy-title');
		const serverButtonA = hostA.querySelector('.hy-count');
		const serverHtmlA = hostA.innerHTML;

		// ── React hydration with the frozen sentinel ─────────────────────────
		const recoverable: unknown[] = [];
		const consoleErrors = vi.spyOn(console, 'error');
		const mutations = collectMutations(hostA);
		const mutationsB = collectMutations(hostB);
		let reactRoot: any;
		await pair.flush(() => {
			reactRoot = ReactDOMClient.hydrateRoot(container, h(Page, { shell: 's0' }), {
				onRecoverableError: (error: unknown) => recoverable.push(error),
			});
		});

		// React adopted the page without mismatch and WITHOUT touching a single
		// descendant of either opaque host: no inserts, removes, or text writes.
		expect(recoverable).toEqual([]);
		expect(consoleErrors).not.toHaveBeenCalled();
		consoleErrors.mockRestore();
		mutations.stop();
		mutationsB.stop();
		expect(describeRecords(mutations.records)).toEqual([]);
		expect(describeRecords(mutationsB.records)).toEqual([]);
		expect(hostA.innerHTML).toBe(serverHtmlA);
		expect(hostA.querySelector('.hy-title')).toBe(serverTitleA);

		// ── Octane adopts the intact server DOM (node identity preserved) ────
		const octaneRootA = octaneHydrateRoot(hostA, HydrationIsland, { name: 'A' });
		octaneFlushSync(() => {});
		expect(hostA.querySelector('.hy-title')).toBe(serverTitleA);
		expect(hostA.querySelector('.hy-count')).toBe(serverButtonA);
		expect(hostA.innerHTML).toBe(serverHtmlA);

		// Adopted events + state are live.
		await pair.flush(() => (serverButtonA as HTMLElement).click());
		expect((serverButtonA as HTMLElement).textContent).toBe('clicks:1');

		// ── later React renders keep the stable sentinel: hosts never clear ──
		const postHydrationMutations = collectMutations(hostA);
		await pair.flush(() => reactRoot.render(h(Page, { shell: 's1' })));
		expect(container.querySelector('.shell')?.textContent).toBe('shell:s1');
		postHydrationMutations.stop();
		expect(describeRecords(postHydrationMutations.records)).toEqual([]);
		// Octane-committed state survives the React re-render.
		expect(hostA.querySelector('.hy-count')?.textContent).toBe('clicks:1');
		expect(hostA.querySelector('.hy-count')).toBe(serverButtonA);

		octaneRootA.unmount();
		await pair.flush(() => reactRoot.unmount());
	} finally {
		container.remove();
	}
}

describe('react-hosted island — opaque-host hydration (§9.3)', () => {
	it('React 19 development hydration leaves opaque host descendants untouched and Octane adopts them', async () => {
		await runOpaqueHydrationScenario(await loadDevPair());
	});

	it('React 19 production hydration leaves opaque host descendants untouched and Octane adopts them', async () => {
		await runOpaqueHydrationScenario(await loadProdPair());
	});
});
