import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';
import { hydrateRoot, flushSync } from '../src/index.js';
// CLIENT-compiled side of the hydration fixture (normal .tsrx import path).
import { SeedPage } from './_fixtures/ssr-prop-flow-hydrate.tsrx';

// Per-request promises CREATED in an ancestor's render and passed down through
// child JSX props to descendant use() sites (the React-trained "uncached
// promise" shape). Streaming SSR re-runs the ancestor on every wave pass; the
// creations must be cached cross-pass (or the runtime must fall back to
// string-key replay) or every pass recreates the promises, no boundary ever
// completes, and the render burns MAX_SUSPENSE_PASSES before erroring.

function evalModule(code: string, file: string): Record<string, any> {
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	// Keep declarations as declarations (a function-expression rewrite would
	// unbind the name for sibling components that reference it) and attach the
	// exports at the end.
	const exported: string[] = [];
	code = code.replace(
		/export\s+(async\s+)?function\s+(\w+)/g,
		(_m: string, asyncKeyword: string | undefined, name: string) => {
			exported.push(name);
			return `${asyncKeyword ?? ''}function ${name}`;
		},
	);
	code = code.replace(/export const (\w+) =/g, (_m: string, name: string) => {
		exported.push(name);
		return `const ${name} =`;
	});
	const footer = exported.map((name) => `__exports.${name} = ${name};`).join('\n');
	const fn = new Function(
		'__rt',
		'__exports',
		code + `\n${footer}\nreturn __exports;\n//# sourceURL=${file}`,
	);
	return fn(RT, {});
}

function evalServer(source: string, file: string): Record<string, any> {
	return evalModule(compile(source, file, { mode: 'server' }).code, file);
}

function collect(component: any, props?: any) {
	const chunks: string[] = [];
	const errors: unknown[] = [];
	let end!: () => void;
	const ended = new Promise<string>((resolve) => {
		end = () => resolve(chunks.join(''));
	});
	RT.renderToPipeableStream(component, props, {
		onError(error: unknown) {
			errors.push(error);
		},
	}).pipe({
		write(chunk: string | Uint8Array) {
			chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
			return true;
		},
		end,
	});
	return { ended, errors, chunks };
}

// Card/List are shared by every Page shape below: the grandchild unwraps a
// promise it never created (`use(props.promise)`).
const CARD_AND_LIST = `
	export function Card(props) @{
		<div class="card">
			@try {
				const v = use(props.promise);
				<span class="ok">{v as string}</span>
			} @pending {
				<i>loading</i>
			}
		</div>
	}
	export function List(props) @{
		<section>
			@for (const c of props.cards; key c.id) {
				<Card promise={c.promise} />
			}
		</section>
	}
`;

// Creation INLINE in child-prop position — the compiler caches it cross-pass
// (server Pass A prop extension), so the promises keep their identity and the
// upstream work runs exactly once per request.
const INLINE_PROP_FLOW =
	CARD_AND_LIST +
	`
	export function Page(p) @{
		<main><List cards={p.makeCards()} /></main>
	}
`;

// Creation assigned to a LOCAL first — outside the compiler's inline-only
// analysis, so the promises really are recreated every pass. The runtime's
// livelock guard must still complete the render via string-key replay.
const LOCAL_PROP_FLOW =
	CARD_AND_LIST +
	`
	export function Page(p) @{
		const cards = p.makeCards();
		<main><List cards={cards} /></main>
	}
`;

function timedCardsFactory() {
	const state = { creations: 0 };
	const makeCards = () => {
		state.creations++;
		return [0, 1, 2].map((i) => ({
			id: i,
			promise: new Promise<string>((resolve) => setTimeout(() => resolve('card-' + i), 2)),
		}));
	};
	return { state, makeCards };
}

describe('streaming SSR — promises created in an ancestor, unwrapped via props', () => {
	it('resolves inline prop-flowed promises without recreating them each pass', async () => {
		const mod = evalServer(INLINE_PROP_FLOW, 'prop-flow-inline.tsrx');
		const { state, makeCards } = timedCardsFactory();
		const { ended, errors } = collect(mod.Page, { makeCards });
		const html = await ended;
		expect(errors).toEqual([]);
		expect(html).toContain('card-0');
		expect(html).toContain('card-1');
		expect(html).toContain('card-2');
		expect(state.creations).toBe(1);
	});

	it('prerender resolves inline prop-flowed promises with one creation', async () => {
		const mod = evalServer(INLINE_PROP_FLOW, 'prop-flow-inline.tsrx');
		const { state, makeCards } = timedCardsFactory();
		const out = await prerender(mod.Page, { makeCards });
		expect(out.html).toContain('card-0');
		expect(out.html).toContain('card-1');
		expect(out.html).toContain('card-2');
		expect(out.html).not.toContain('<i>loading</i>');
		expect(state.creations).toBe(1);
	});

	it('completes when the creation escapes analysis and IS recreated each pass', async () => {
		const mod = evalServer(LOCAL_PROP_FLOW, 'prop-flow-local.tsrx');
		const { makeCards } = timedCardsFactory();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { ended, errors } = collect(mod.Page, { makeCards });
			const html = await ended;
			// The guard degrades to per-site replay instead of burning
			// MAX_SUSPENSE_PASSES and serving only @pending fallbacks.
			expect(errors).toEqual([]);
			expect(html).toContain('card-0');
			expect(html).toContain('card-1');
			expect(html).toContain('card-2');
			const warned = errorSpy.mock.calls.some((args) =>
				String(args[0]).includes('re-created on every render pass'),
			);
			expect(warned).toBe(true);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('completes a recreated-promise shape with no @try — shell blocked on the root loop', async () => {
		// No boundary anywhere: the suspension escapes to the root, so the
		// pre-shell retry loop (not the boundary wave loop) must detect the
		// recreation and still produce a complete shell.
		const BARE = `
			export function BareCard(props) @{
				const v = use(props.promise);
				<div class="ok">{v as string}</div>
			}
			export function Page(p) @{
				const cards = p.makeCards();
				<main>
					@for (const c of cards; key c.id) {
						<BareCard promise={c.promise} />
					}
				</main>
			}
		`;
		const mod = evalServer(BARE, 'prop-flow-bare.tsrx');
		const { makeCards } = timedCardsFactory();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { ended, errors } = collect(mod.Page, { makeCards });
			const html = await ended;
			expect(errors).toEqual([]);
			expect(html).toContain('card-0');
			expect(html).toContain('card-1');
			expect(html).toContain('card-2');
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('does not flag a legitimate stable-identity waterfall of trivial use() references', async () => {
		// A pre-created linked chain unwrapped stratum by stratum: every
		// argument is a trivial reference (never memoized, so the creation
		// cache never grows) and every stratum registers fresh identities —
		// but each pass CONSUMES the previous wave's outcomes, which is what
		// separates a real waterfall from ancestor recreation. Batching must
		// stay on and the recreation warning must not fire.
		const CHAIN = `
			export function Chain(p) @{
				<main>
					@try {
						const a = use(p.head);
						const b = use(a.next);
						const c = use(b.next);
						const d = use(c.next);
						<div class="ok">{d.label as string}</div>
					} @pending {
						<i>w</i>
					}
				</main>
			}
		`;
		const mod = evalServer(CHAIN, 'prop-flow-chain.tsrx');
		const link = <T>(value: T): Promise<T> =>
			new Promise((resolve) => setTimeout(() => resolve(value), 2));
		const head = link({ next: link({ next: link({ next: link({ label: 'deep' }) }) }) });
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { ended, errors } = collect(mod.Chain, { head });
			const html = await ended;
			expect(errors).toEqual([]);
			expect(html).toContain('deep');
			const warned = errorSpy.mock.calls.some((args) =>
				String(args[0]).includes('re-created on every render pass'),
			);
			expect(warned).toBe(false);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('hydrates the memoized prop-flow shape — seeds adopt positionally despite server-only prop-memo slots', async () => {
		// The server compile allocates a prop-memo slot the client compile never
		// sees. That must be invisible across the boundary: seeds serialize in
		// use()-call order and the client consumes them by positional cursor,
		// never by slot identity. Server-render the fixture, hydrate the
		// CLIENT-compiled module over it, and require full adoption — no
		// re-suspend, no rebuild, no mismatch warning — plus live state after.
		const fixture = join(
			process.cwd(),
			'packages/octane/tests/_fixtures/ssr-prop-flow-hydrate.tsrx',
		);
		const server = evalServer(readFileSync(fixture, 'utf8'), 'ssr-prop-flow-hydrate.tsrx');
		const load = (id: string) => Promise.resolve('v-' + id);
		const { html } = await prerender(server.SeedPage, { load });
		expect(html).toContain('v-x:L:0');

		const container = document.createElement('div');
		document.body.appendChild(container);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			container.innerHTML = html;
			const button = container.querySelector('#card') as HTMLElement;
			const textNode = button.firstChild;
			const root = hydrateRoot(container, SeedPage as any, { load });
			flushSync(() => {});
			// Adopted, not rebuilt: same element and text node, seed consumed.
			expect(container.querySelector('#card')).toBe(button);
			expect(button.firstChild).toBe(textNode);
			expect(button.textContent).toBe('v-x:L:0');
			expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
			expect(errorSpy).not.toHaveBeenCalled();
			// Hooks are live post-hydration (state cells resolved on client slots).
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync(() => {});
			expect(button.textContent).toBe('v-x:L:1');
			root.unmount();
		} finally {
			errorSpy.mockRestore();
			container.remove();
		}
	});

	it('caches optional-call prop creations cross-pass like plain calls', async () => {
		// `p.makeCards?.()` parses as an OptionalCallExpression — it creates per
		// evaluation exactly like a plain call and must take the identity-cache
		// path (exactly-once creation, no recreation warning), not the degraded
		// livelock-guard fallback.
		const OPTIONAL_FLOW =
			CARD_AND_LIST +
			`
			export function Page(p) @{
				<main><List cards={p.makeCards?.()} /></main>
			}
		`;
		const mod = evalServer(OPTIONAL_FLOW, 'prop-flow-optional.tsrx');
		const { state, makeCards } = timedCardsFactory();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { ended, errors } = collect(mod.Page, { makeCards });
			const html = await ended;
			expect(errors).toEqual([]);
			expect(html).toContain('card-0');
			expect(html).toContain('card-1');
			expect(html).toContain('card-2');
			expect(state.creations).toBe(1);
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('degrades recreated sites even while a slow stable fetch is still pending', async () => {
		// Mixed tree: a stable (use-site memoized) fetch that stays in flight
		// beside prop-flowed promises recreated every pass. The recreated sites
		// manufacture fast no-boundary waves the whole time the stable fetch
		// pends; its carried-over registration must not clear the recreation
		// evidence each pass, or the render burns MAX_SUSPENSE_PASSES before
		// the stable work ever lands. The slow fetch is only resolved AFTER the
		// recreated cards' content reaches the wire — impossible unless the
		// guard tripped while the fetch was still pending.
		const MIXED =
			CARD_AND_LIST +
			`
			export function Slow(props) @{
				<div>
					@try {
						const v = use(props.fetchSlow());
						<b class="slow">{v as string}</b>
					} @pending {
						<i>s</i>
					}
				</div>
			}
			export function Page(p) @{
				const cards = p.makeCards();
				<main>
					<Slow fetchSlow={p.fetchSlow} />
					<List cards={cards} />
				</main>
			}
		`;
		const mod = evalServer(MIXED, 'prop-flow-mixed.tsrx');
		const { makeCards } = timedCardsFactory();
		let resolveSlow!: (v: string) => void;
		const slow = new Promise<string>((resolve) => {
			resolveSlow = resolve;
		});
		let fetches = 0;
		const fetchSlow = () => {
			fetches++;
			return slow;
		};
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { ended, errors, chunks } = collect(mod.Page, { makeCards, fetchSlow });
			// Release the stable fetch only once every recreated card is on the
			// wire — the guard must have degraded those sites by then.
			const deadline = Date.now() + 5000;
			while (!chunks.join('').includes('card-2')) {
				if (Date.now() > deadline) throw new Error('recreated cards never flushed');
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			resolveSlow('slow-data');
			const html = await ended;
			expect(errors).toEqual([]);
			expect(html).toContain('card-0');
			expect(html).toContain('card-1');
			expect(html).toContain('card-2');
			expect(html).toContain('slow-data');
			// The stable creation stayed memoized throughout the degradation.
			expect(fetches).toBe(1);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('never caches hook-shaped calls in prop position — plain or optional', () => {
		// A hook call's slot/occurrence bookkeeping must run on the body proper
		// every pass, so it can never sit behind a cross-pass cache hit. This is
		// an authoring-pattern contract the render output cannot distinguish, so
		// assert the narrowest compile-level property: no creation cache is
		// emitted for these attributes.
		const HOOKISH = `
			export function Kid(props) @{ <i>{props.v as string}</i> }
			export function Page(p) @{
				<main>
					<Kid v={useThing(p)} />
					<Kid v={p.store?.useSelector()} />
				</main>
			}
		`;
		const { code } = compile(HOOKISH, 'prop-hookish.tsrx', { mode: 'server' });
		expect(code).not.toContain('puMemo');
	});

	it('compiles and renders a module whose ONLY slot sites are prop memos', async () => {
		// The website/example-app CI break: routes are split across modules, so
		// a module can pass call-valued props while its consumers (use(), hooks)
		// live elsewhere. Its prop memos are then the module's only slot sites —
		// the emitted module must still import everything it references (the
		// tail-slot flush once ran after the import list was built, emitting
		// _$hookSlots without importing it; module init then threw and SSR
		// served only the error fallback).
		const ONLY_PROP_MEMO = `
			export function Kid(props) @{
				<i>{props.data as string}</i>
			}
			export function Page(p) @{
				<main><Kid data={p.load('x')} /></main>
			}
		`;
		const mod = evalServer(ONLY_PROP_MEMO, 'prop-memo-only.tsrx');
		const out = await prerender(mod.Page, { load: (id: string) => 'v-' + id });
		expect(out.html).toContain('<i>v-x</i>');
	});

	it('prerender completes the recreated-promise shape', async () => {
		const mod = evalServer(LOCAL_PROP_FLOW, 'prop-flow-local.tsrx');
		const { makeCards } = timedCardsFactory();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const out = await prerender(mod.Page, { makeCards });
			expect(out.html).toContain('card-0');
			expect(out.html).toContain('card-1');
			expect(out.html).toContain('card-2');
			expect(out.html).not.toContain('<i>loading</i>');
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('re-reads a stable mutable receiver during suspension instead of caching its snapshot', async () => {
		const mod = evalServer(
			`
			export function Data(p) @{
				<output>{p.data.label as string}</output>
			}
			export function Gate(p) @{
				const value = use(p.promise);
				<i>{value as string}</i>
			}
			export function Page(p) @{
				const data = p.receiver.read();
				<main><Data data={data} /><Gate promise={p.gate} /></main>
			}
			`,
			'prop-flow-live-receiver.tsrx',
		);
		const receiver = {
			label: 'before',
			read() {
				return { label: this.label };
			},
		};
		let resume!: (value: string) => void;
		const gate = new Promise<string>((resolve) => {
			resume = resolve;
		});
		const rendered = prerender(mod.Page, { receiver, gate });
		// The receiver and method keep their identities; only the live interior
		// changes. A canonical retry must take a fresh ordinary call snapshot.
		receiver.label = 'after';
		resume('ready');
		const { html } = await rendered;
		expect(html).toContain('<output>after</output>');
		expect(html).toContain('<i>ready</i>');
	});

	it('observes rejected replacement promises abandoned when recreation fallback begins', async () => {
		const mod = evalServer(LOCAL_PROP_FLOW, 'prop-flow-abandoned-rejection.tsrx');
		const reason = new Error('abandoned replacement');
		const unhandled: unknown[] = [];
		const onUnhandled = (error: unknown) => unhandled.push(error);
		let abandon!: () => void;
		const makeCards = () => [
			{
				id: 0,
				promise: new Promise<string>((resolve, reject) => {
					const timer = setTimeout(() => resolve('ready card'), 2);
					abandon = () => {
						clearTimeout(timer);
						reject(reason);
					};
				}),
			},
		];
		process.on('unhandledRejection', onUnhandled);
		// The development diagnostic synchronizes with the fallback transition;
		// assertions observe output and rejection handling, not retry counts.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((message) => {
			if (String(message).includes('re-created on every render pass')) abandon();
		});
		try {
			const { ended, errors } = collect(mod.Page, { makeCards });
			const html = await ended;
			expect(html).toContain('ready card');
			expect(errors).toEqual([]);
			expect(errorSpy).toHaveBeenCalled();
			// Rejection observation remains required even if the fallback no
			// longer waits for a batch that the next pass will replace.
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			errorSpy.mockRestore();
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('observes a directly thrown thenable abandoned beside recreated use() promises', async () => {
		const mod = evalServer(
			CARD_AND_LIST +
				`
				export function Reader(p) @{
					const label = p.read();
					<b>{label as string}</b>
				}
				export function Page(p) @{
					const cards = p.makeCards();
					<main>
						<List cards={cards} />
						@try { <Reader read={p.read} /> } @pending { <i>reading</i> }
					</main>
				}
				`,
			'prop-flow-abandoned-throw.tsrx',
		);
		const { makeCards } = timedCardsFactory();
		const reason = new Error('abandoned thrown replacement');
		const unhandled: unknown[] = [];
		const onUnhandled = (error: unknown) => unhandled.push(error);
		let ready = false;
		let rejectThrown!: (reason: unknown) => void;
		const read = () => {
			if (ready) return 'reader ready';
			throw new Promise<string>((_resolve, reject) => {
				rejectThrown = reject;
			});
		};
		process.on('unhandledRejection', onUnhandled);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((message) => {
			if (String(message).includes('re-created on every render pass')) {
				ready = true;
				rejectThrown(reason);
			}
		});
		try {
			const { ended, errors } = collect(mod.Page, { makeCards, read });
			const html = await ended;
			expect(html).toContain('reader ready');
			expect(html).toContain('card-2');
			expect(errors).toEqual([]);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			errorSpy.mockRestore();
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('observes speculative child work abandoned when recreation fallback begins', async () => {
		const mod = evalServer(
			CARD_AND_LIST +
				`
				export function Child(p) @{
					const label = use(p.load(p.id));
					<b>{label as string}</b>
				}
				export function Parent(p) @{
					const label = use(p.gate);
					<section><Child load={p.load} id={p.id} />{label as string}</section>
				}
				export function Page(p) @{
					const cards = p.makeCards();
					const id = p.nextId();
					<main>
						<List cards={cards} />
						@try {
							<Parent gate={p.gate} load={p.load} id={id} />
						} @pending { <i>parent pending</i> }
					</main>
				}
				`,
			'prop-flow-abandoned-warm.tsrx',
		);
		const { makeCards } = timedCardsFactory();
		const reason = new Error('abandoned speculative replacement');
		const unhandled: unknown[] = [];
		const onUnhandled = (error: unknown) => unhandled.push(error);
		let ready = false;
		let id = 0;
		let rejectWarm!: (reason: unknown) => void;
		let releaseParent!: (label: string) => void;
		const gate = new Promise<string>((resolve) => {
			releaseParent = resolve;
		});
		const load = (_id: number) =>
			ready
				? Promise.resolve('child ready')
				: new Promise<string>((_resolve, reject) => {
						rejectWarm = reject;
					});
		process.on('unhandledRejection', onUnhandled);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((message) => {
			if (String(message).includes('re-created on every render pass')) {
				// Parent has never unwrapped its gate, so the child's request was
				// started speculatively rather than by the child's ordinary body.
				ready = true;
				rejectWarm(reason);
				releaseParent('parent ready');
			}
		});
		try {
			const { ended, errors } = collect(mod.Page, { makeCards, gate, load, nextId: () => ++id });
			const html = await ended;
			expect(html).toContain('parent ready');
			expect(html).toContain('child ready');
			expect(html).toContain('card-2');
			expect(errors).toEqual([]);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			errorSpy.mockRestore();
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('aborts at recreation fallback without leaking replay state into the next request', async () => {
		const mod = evalServer(
			CARD_AND_LIST +
				`
				export function Page(p) @{
					const promise = p.load();
					<main><Card promise={promise} /></main>
				}
				`,
			'prop-flow-abort-retry.tsrx',
		);
		const controller = new AbortController();
		const reason = new Error('cancelled recreated request');
		let nextPromise: Promise<string> | null = null;
		const props = {
			load: () => nextPromise ?? Promise.resolve('abandoned request'),
		};
		const firstErrors: unknown[] = [];
		// Use the development diagnostic to abort exactly at the transition,
		// then verify the public stream/allReady lifecycle and next-request output.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation((message) => {
			if (String(message).includes('re-created on every render pass')) controller.abort(reason);
		});
		try {
			const first = await RT.renderToReadableStream(mod.Page, props, {
				signal: controller.signal,
				onError: (error) => firstErrors.push(error),
			});
			const firstBody = await new Response(first).text();
			await expect(first.allReady).rejects.toBe(reason);
			expect(firstBody).toContain('loading');
			expect(firstBody).not.toContain('abandoned request');
			expect(firstErrors).toEqual([reason]);

			nextPromise = Promise.resolve('next request');
			const nextErrors: unknown[] = [];
			const next = await RT.renderToReadableStream(mod.Page, props, {
				onError: (error) => nextErrors.push(error),
			});
			const nextBody = await new Response(next).text();
			await next.allReady;
			expect(nextBody).toContain('next request');
			expect(nextBody).not.toContain('abandoned request');
			expect(nextErrors).toEqual([]);
		} finally {
			errorSpy.mockRestore();
		}
	});
});
