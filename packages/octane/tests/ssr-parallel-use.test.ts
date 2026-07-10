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

	it('parallelUse: false opts the server out (serial registration)', async () => {
		let { code } = compile(INDEPENDENT, 'opt.tsrx', { mode: 'server', parallelUse: false });
		expect(code).not.toContain('puMemo');
		expect(code).not.toContain('puBatch');
	});
});
