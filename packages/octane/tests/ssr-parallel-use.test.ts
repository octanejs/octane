import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';

// SSR mirror of the parallel-`use()` pipeline (docs/suspense-parallel-use-
// plan.md Phase 5). The compiler runs the same memoize (Pass A) + hoist/batch
// (Pass B) transforms on server bodies, emitting `_$puMemo`/`_$puBatch`:
// independent creations REGISTER with the render loop before the first
// suspend (one network round per body stratum, not one per use()), re-runs
// reuse the SAME thenable instances (no duplicate fetches), and batch-
// registered thenables resolve at their unwraps by IDENTITY. True data
// dependencies stay sequential; seed order stays use()-call order.

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const drain = () => new Promise((r) => setTimeout(r, 0));

describe('SSR parallel use() — the server mirror', () => {
	const INDEPENDENT = `
		export function Page(p) @{
			<main>
				@try {
					const a = use(p.make('a'));
					const b = use(p.make('b'));
					const c = use(p.make('c'));
					<div class="ok">{a + '|' + b + '|' + c}</div>
				} @pending {
					<i>w</i>
				}
			</main>
		}
	`;

	it('starts every independent same-body fetch before ANY resolves — one round', async () => {
		const mod = evalServer(INDEPENDENT, 'ind.tsrx');
		const started: string[] = [];
		const defs = new Map<string, ReturnType<typeof deferred<string>>>();
		const make = (name: string) => {
			started.push(name);
			const d = deferred<string>();
			defs.set(name, d);
			return d.promise;
		};
		const done = prerender(mod.Page, { make });
		await drain();
		// The batch registered ALL THREE creations in the first pass — before a
		// single value resolved. Serial SSR would only have seen 'a' here.
		expect(started).toEqual(['a', 'b', 'c']);
		defs.get('a')!.resolve('A');
		defs.get('b')!.resolve('B');
		defs.get('c')!.resolve('C');
		const out = await done;
		expect(out.html).toContain('<div class="ok">A|B|C</div>');
		expect(out.html).not.toContain('<i>w</i>');
		// Cross-pass creation identity: each fetch fired exactly once across the
		// suspend pass + the final canonical pass.
		expect(started).toEqual(['a', 'b', 'c']);
	});

	it('keeps TRUE data dependencies sequential (b needs a) while batching within a stratum', async () => {
		const mod = evalServer(
			`export function Page(p) @{
				<main>
					@try {
						const a = use(p.make('a', 0));
						const b = use(p.make('b', a));
						<div class="ok">{'' + b}</div>
					} @pending { <i>w</i> }
				</main>
			}`,
			'dep.tsrx',
		);
		const started: string[] = [];
		const defs = new Map<string, ReturnType<typeof deferred<number>>>();
		const make = (name: string, prev: number) => {
			started.push(name + ':' + prev);
			const d = deferred<number>();
			defs.set(name, d);
			return d.promise;
		};
		const done = prerender(mod.Page, { make });
		await drain();
		// b's creation READS a's resolved value — it must not have started.
		expect(started).toEqual(['a:0']);
		defs.get('a')!.resolve(7);
		await drain();
		expect(started).toEqual(['a:0', 'b:7']);
		defs.get('b')!.resolve(70);
		const out = await done;
		expect(out.html).toContain('<div class="ok">70</div>');
	});

	it('seeds resolved values in use()-CALL order (hydration contract)', async () => {
		const mod = evalServer(INDEPENDENT, 'seed.tsrx');
		const out = await prerender(mod.Page, {
			make: (name: string) => Promise.resolve(name.toUpperCase()),
		});
		// The seed script serializes SERIAL — pushed at unwrap time in render
		// order. A|B|C must appear in that order inside the seed payload.
		const seed = out.html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		expect(seed).not.toBeNull();
		const payload = seed![1];
		const ia = payload.indexOf('"A"');
		const ib = payload.indexOf('"B"');
		const ic = payload.indexOf('"C"');
		expect(ia).toBeGreaterThanOrEqual(0);
		expect(ib).toBeGreaterThan(ia);
		expect(ic).toBeGreaterThan(ib);
	});

	it('routes a batch-registered rejection to @catch', async () => {
		const mod = evalServer(
			`export function Page(p) @{
				<main>
					@try {
						const a = use(p.make('a'));
						const b = use(p.make('b'));
						<div class="ok">{a + b}</div>
					} @pending { <i>w</i> } @catch (e) {
						<div class="err">{'caught: ' + e.message}</div>
					}
				</main>
			}`,
			'rej.tsrx',
		);
		const out = await prerender(mod.Page, {
			make: (name: string) =>
				name === 'b' ? Promise.reject(new Error('boom-' + name)) : Promise.resolve(name),
		});
		expect(out.html).toContain('caught: boom-b');
		expect(out.html).not.toContain('class="ok"');
	});

	it('renderToString (single pass, no await) still shows @pending for a batched suspend', () => {
		const mod = evalServer(INDEPENDENT, 'sync.tsrx');
		const started: string[] = [];
		const out = RT.renderToString(mod.Page, {
			make: (name: string) => {
				started.push(name);
				return new Promise(() => {});
			},
		});
		// One synchronous pass: the batch registered all three and suspended once.
		expect(started).toEqual(['a', 'b', 'c']);
		expect(out.html).toContain('<i>w</i>');
	});

	// ── Warm walk: nested INDEPENDENT components collapse to one round ──
	const NESTED = `
		export function Level(p) @{
			const v = use(p.make('L' + p.level));
			<div class="lvl">
				{'' + v}
				@if (p.level < p.depth) {
					<Level level={p.level + 1} depth={p.depth} make={p.make} />
				}
			</div>
		}
		export function Root(p) @{
			<main>
				@try {
					<Level level={1} depth={p.depth} make={p.make} />
				} @pending { <i>w</i> }
			</main>
		}
	`;

	it('warm walk: a depth-4 chain of INDEPENDENT fetches starts them all in pass 1', async () => {
		const mod = evalServer(NESTED, 'nested.tsrx');
		const started: string[] = [];
		const defs = new Map<string, ReturnType<typeof deferred<string>>>();
		const make = (name: string) => {
			started.push(name);
			const d = deferred<string>();
			defs.set(name, d);
			return d.promise;
		};
		const done = prerender(mod.Root, { depth: 4, make });
		await drain();
		// Level 1's batch suspends and its warm thunk recurses Level.__warm down
		// the chain — every level's fetch is in flight before ANY resolves.
		// Serial SSR discovers one level per round (started would be ['L1']).
		expect(started).toEqual(['L1', 'L2', 'L3', 'L4']);
		for (let i = 1; i <= 4; i++) defs.get('L' + i)!.resolve('v' + i);
		const out = await done;
		for (let i = 1; i <= 4; i++) expect(out.html).toContain('v' + i);
		expect(out.html).not.toContain('<i>w</i>');
		// Adoption identity: each level's creation fired exactly once — the real
		// render adopted the warmed promise instead of re-fetching.
		expect(started).toEqual(['L1', 'L2', 'L3', 'L4']);
	});

	it('warm walk: child props that read SUSPENDED data cut the warm edge', async () => {
		const mod = evalServer(
			`export function Kid(p) @{
				const k = use(p.make('k:' + p.tag));
				<b>{'' + k}</b>
			}
			export function Root(p) @{
				<main>
					@try {
						const a = use(p.make('a'));
						<section>
							{'' + a}
							<Kid tag={a} make={p.make} />
						</section>
					} @pending { <i>w</i> }
				</main>
			}`,
			'cut.tsrx',
		);
		const started: string[] = [];
		const defs = new Map<string, ReturnType<typeof deferred<string>>>();
		const make = (name: string) => {
			started.push(name);
			const d = deferred<string>();
			defs.set(name, d);
			return d.promise;
		};
		const done = prerender(mod.Root, { make });
		await drain();
		// Kid's `tag` prop reads a's RESOLVED value — a true data dependency; the
		// warm edge must be cut, so Kid's fetch has not started.
		expect(started).toEqual(['a']);
		defs.get('a')!.resolve('A');
		await drain();
		expect(started).toEqual(['a', 'k:A']);
		defs.get('k:A')!.resolve('K');
		const out = await done;
		expect(out.html).toContain('K');
	});

	it('warm walk: seeds still serialize in use()-call order', async () => {
		const mod = evalServer(NESTED, 'nestedseed.tsrx');
		const out = await prerender(mod.Root, {
			depth: 3,
			make: (name: string) => Promise.resolve(name.toUpperCase()),
		});
		const seed = out.html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
		expect(seed).not.toBeNull();
		const payload = seed![1];
		const i1 = payload.indexOf('"L1"');
		const i2 = payload.indexOf('"L2"');
		const i3 = payload.indexOf('"L3"');
		expect(i1).toBeGreaterThanOrEqual(0);
		expect(i2).toBeGreaterThan(i1);
		expect(i3).toBeGreaterThan(i2);
	});
});
