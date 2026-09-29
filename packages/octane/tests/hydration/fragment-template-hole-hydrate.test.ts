import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture';

// A multi-root (fragment) template has no server wrapper, so hydration adopts
// its roots straight from the cursor. When the server rendered something else
// in that position (the hole's text, or another component's roots), the
// fragment must not adopt it. It reports the mismatch once and builds on the
// client.

const SOURCE = readFileSync(
	join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/fragment-template-hole.tsrx'),
	'utf8',
);

type Props = { kind: string; v: string };

const modules = new Map<string, CompiledFixtureModule>();
function load(mode: 'client' | 'server', dev: boolean): CompiledFixtureModule {
	const key = `${mode}:${dev}`;
	let module = modules.get(key);
	if (module === undefined) {
		module = loadCompiledFixtureSource(SOURCE, {
			id: 'fragment-template-hole.tsrx',
			mode,
			compileOptions: { dev },
		});
		modules.set(key, module);
	}
	return module;
}

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function renderServer(dev: boolean, props: Props): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	container.innerHTML = ServerRT.renderToString(load('server', dev).Sib, props).html;
	return container;
}

async function hydrate(container: HTMLElement, dev: boolean, props: Props) {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const Sib = load('client', dev).Sib;
	const root = hydrateRoot(container, Sib, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	flushSync(() => {});
	// onRecoverableError is queued in a microtask; a macrotask boundary drains it.
	await new Promise((resolve) => setTimeout(resolve, 0));
	return {
		recoverable,
		reports: () => errors.mock.calls.map((call) => String(call[0])),
		render: (next: Props) => flushSync(() => root.render(Sib, next)),
		unmount: () => root.unmount(),
	};
}

// The rendered markup without hydration and range markers.
const markup = (container: HTMLElement) => container.innerHTML.replace(/<!--.*?-->/g, '');

const pair = (v: string) => `<section><p class="x">${v}</p><i>${v}</i><b>${v}</b></section>`;

for (const dev of [true, false]) {
	describe(`hydrateRoot: fragment template in a renderable hole (dev compile: ${dev})`, () => {
		// `other` is a different fragment component, so the server left two
		// unclaimed roots in the hole's range instead of one text node.
		it.each([
			{ server: 'text', client: 'pair' },
			{ server: 'text', client: 'chain-pair' },
			{ server: 'other', client: 'pair' },
		])(
			'server $server, client $client: reports once and renders the client markup',
			async ({ server, client }) => {
				const container = renderServer(dev, { kind: server, v: 'A' });
				const serverB = container.querySelector('b')!;

				const result = await hydrate(container, dev, { kind: client, v: 'A' });
				try {
					expect(result.recoverable).toHaveLength(1);
					expect(String(result.recoverable[0])).toContain(
						'the server-rendered node did not match the client render',
					);
					const reports = result.reports();
					if (dev) {
						expect(reports).toHaveLength(1);
						expect(reports[0]).toContain('Octane hydration mismatch at');
						expect(reports[0]).toContain('the client expected a fragment starting with <p>');
					} else {
						expect(reports).toEqual([]);
					}
					// The server's hole content is gone; the sibling is still adopted.
					expect(markup(container)).toBe(pair('A'));
					expect(container.querySelector('b')).toBe(serverB);

					// The rebuilt range stays live in both directions.
					result.render({ kind: client, v: 'B' });
					expect(markup(container)).toBe(pair('B'));
					result.render({ kind: 'text', v: 'C' });
					expect(markup(container)).toBe('<section>C<b>C</b></section>');
					expect(container.querySelector('b')).toBe(serverB);
				} finally {
					result.unmount();
				}
			},
		);

		it.each(['pair', 'chain-pair'])(
			'server and client %s: adopts the server nodes silently',
			async (kind) => {
				const container = renderServer(dev, { kind, v: 'A' });
				const serverP = container.querySelector('p')!;
				const serverI = container.querySelector('i')!;
				const serverB = container.querySelector('b')!;

				const result = await hydrate(container, dev, { kind, v: 'A' });
				try {
					expect(result.recoverable).toEqual([]);
					expect(result.reports()).toEqual([]);
					expect(markup(container)).toBe(pair('A'));
					expect(container.querySelector('p')).toBe(serverP);
					expect(container.querySelector('i')).toBe(serverI);
					expect(container.querySelector('b')).toBe(serverB);

					result.render({ kind, v: 'B' });
					expect(markup(container)).toBe(pair('B'));
					expect(container.querySelector('p')).toBe(serverP);
					expect(container.querySelector('i')).toBe(serverI);
				} finally {
					result.unmount();
				}
			},
		);
	});
}

// The production runtime checks a lazy template's first root against its
// source, without parsing it. Stubbing NODE_ENV around hydrateRoot exercises
// that build-time-stripped branch.
describe('hydrateRoot: fragment template in a renderable hole (production runtime)', () => {
	it.each([
		{ server: 'text', client: 'pair' },
		{ server: 'text', client: 'chain-pair' },
		{ server: 'other', client: 'pair' },
	])(
		'server $server, client $client: recovers silently with one report',
		async ({ server, client }) => {
			const container = renderServer(false, { kind: server, v: 'A' });
			const serverB = container.querySelector('b')!;
			vi.stubEnv('NODE_ENV', 'production');

			const result = await hydrate(container, false, { kind: client, v: 'A' });
			try {
				expect(result.recoverable).toHaveLength(1);
				expect(result.reports()).toEqual([]);
				expect(markup(container)).toBe(pair('A'));
				expect(container.querySelector('b')).toBe(serverB);
			} finally {
				result.unmount();
			}
		},
	);

	it.each(['pair', 'chain-pair'])('server and client %s: adopts silently', async (kind) => {
		const container = renderServer(false, { kind, v: 'A' });
		const serverP = container.querySelector('p')!;
		const serverI = container.querySelector('i')!;
		vi.stubEnv('NODE_ENV', 'production');

		const result = await hydrate(container, false, { kind, v: 'A' });
		try {
			expect(result.recoverable).toEqual([]);
			expect(markup(container)).toBe(pair('A'));
			expect(container.querySelector('p')).toBe(serverP);
			expect(container.querySelector('i')).toBe(serverI);
		} finally {
			result.unmount();
		}
	});
});
