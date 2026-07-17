import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';
import { createOctaneCompiler } from '../src/compiler/bundler.js';

// SSR mirror of the parallel-`use()` pipeline (docs/suspense-parallel-use-
// plan.md Phase 5). The compiler runs the same memoize (Pass A) + hoist/batch
// (Pass B) transforms on server bodies, emitting `_$puMemo`/`_$puBatch`:
// independent creations REGISTER with the render loop before the first
// suspend (one network round per body stratum, not one per use()), re-runs
// reuse the SAME thenable instances (no duplicate fetches), and batch-
// registered thenables resolve at their unwraps by IDENTITY. True data
// dependencies stay sequential; seed order stays use()-call order.

function evalModule(
	code: string,
	file: string,
	modules: Record<string, Record<string, any>> = {},
): Record<string, any> {
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,
		(match: string, names: string, request: string) => {
			if (modules[request] === undefined) return match;
			return `const {${names.replace(/ as /g, ': ')}} = __modules[${JSON.stringify(request)}];`;
		},
	);
	code = code.replace(
		/export\s+(async\s+)?function\s+(\w+)/g,
		(_m: string, asyncKeyword: string | undefined, name: string) =>
			`__exports.${name} = ${asyncKeyword ?? ''}function ${name}`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function(
		'__rt',
		'__exports',
		'__modules',
		code + `\nreturn __exports;\n//# sourceURL=${file}`,
	);
	return fn(RT, {}, modules);
}

function evalServer(
	source: string,
	file: string,
	modules: Record<string, Record<string, any>> = {},
): Record<string, any> {
	return evalModule(compile(source, file, { mode: 'server' }).code, file, modules);
}

function evalPlainHookFixture(file: string): Record<string, any> {
	const source = readFileSync(file, 'utf8');
	const compiler = createOctaneCompiler({ root: process.cwd(), hmr: false, dev: false });
	const transformed = compiler.transform(source, file, { environment: 'server' });
	return evalModule(transformed?.code ?? source, file);
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

	it('starts independent reads together when they live in an imported plain-TS custom hook', async () => {
		const hookRequest = './_fixtures/ssr-parallel-use-custom-hook.ts';
		const hookFile = join(process.cwd(), 'packages/octane/tests', hookRequest);
		const mod = evalServer(
			`import { useSsrResourcePair } from '${hookRequest}';
			export function Page(p) @{
				<main>
					@try {
						const pair = useSsrResourcePair(p.load, p.version);
						<div class="ok">{pair.project + '|' + pair.viewer}</div>
					} @pending { <i>w</i> }
				</main>
			}`,
			'imported-hook.tsrx',
			{ [hookRequest]: evalPlainHookFixture(hookFile) },
		);
		const started: string[] = [];
		const defs = new Map<string, ReturnType<typeof deferred<string>>>();
		const load = (key: string) => {
			started.push(key);
			const d = deferred<string>();
			defs.set(key, d);
			return d.promise;
		};

		const done = prerender(mod.Page, { load, version: 1 });
		await drain();
		expect(started).toEqual(['project', 'viewer']);

		defs.get('project')!.resolve('PROJECT');
		defs.get('viewer')!.resolve('VIEWER');
		const out = await done;
		expect(out.html).toContain('<div class="ok">PROJECT|VIEWER</div>');
		expect(out.html).not.toContain('<i>w</i>');
		expect(started).toEqual(['project', 'viewer']);
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

	it('warms distinct adjacent async siblings and their children from a parent with no use()', async () => {
		const mod = evalServer(
			`function LeftLeaf(p) @{
				const value = use(p.load('left-leaf', p.version));
				<span class="left-leaf">{value as string}</span>
			}
			function LeftPanel(p) @{
				const value = use(p.load('left-panel', p.version));
				<section class="left-panel">
					<strong>{value as string}</strong>
					<LeftLeaf load={p.load} version={p.version} />
				</section>
			}
			function RightLeaf(p) @{
				const value = use(p.load('right-leaf', p.version));
				<span class="right-leaf">{value as string}</span>
			}
			function RightPanel(p) @{
				const value = use(p.load('right-panel', p.version));
				<section class="right-panel">
					<strong>{value as string}</strong>
					<RightLeaf load={p.load} version={p.version} />
				</section>
			}
			export function Page(p) @{
				<main>
					@try {
						<>
							<LeftPanel load={p.load} version={p.version} />
							<RightPanel load={p.load} version={p.version} />
						</>
					} @pending { <i>w</i> }
				</main>
			}`,
			'adjacent-children.tsrx',
		);
		const expected = ['left-panel', 'left-leaf', 'right-panel', 'right-leaf'];
		const values = new Map([
			['left-panel', 'LEFT PANEL'],
			['left-leaf', 'LEFT LEAF'],
			['right-panel', 'RIGHT PANEL'],
			['right-leaf', 'RIGHT LEAF'],
		]);
		const started: string[] = [];
		const defs = new Map<string, ReturnType<typeof deferred<string>>>();
		const load = (key: string) => {
			started.push(key);
			const d = deferred<string>();
			defs.set(key, d);
			return d.promise;
		};

		const done = prerender(mod.Page, { load, version: 1 });
		await drain();
		// All four calls have the same reactive inputs. Distinct rendered values
		// prove that warm adoption remains keyed by creation site as well as deps.
		expect(started).toHaveLength(expected.length);
		expect(new Set(started)).toEqual(new Set(expected));

		for (const key of expected) defs.get(key)!.resolve(values.get(key)!);
		const out = await done;
		for (const value of values.values()) expect(out.html).toContain(value);
		expect(out.html).not.toContain('<i>w</i>');
		// Final canonical rendering adopts each warmed thenable instead of firing
		// the consumer's resource creation a second time.
		expect([...started].sort()).toEqual([...expected].sort());
	});

	it('does not warm the final template after setup returns an alternate subtree', async () => {
		const mod = evalServer(
			`function Alternate(p) @{
				const value = use(p.load('alternate'));
				<span>{value as string}</span>
			}
			function Final(p) @{
				const value = use(p.load('final'));
				<b>{value as string}</b>
			}
			function Choice(p) @{
				if (p.alternate) return <Alternate load={p.load} />;
				<Final load={p.load} />
			}
			export function Page(p) @{
				<main>@try { <Choice alternate={true} load={p.load} /> } @pending { <i>w</i> }</main>
			}`,
			'early-return-warm.tsrx',
		);
		const started: string[] = [];
		const alternate = deferred<string>();
		const done = prerender(mod.Page, {
			load: (key: string) => {
				started.push(key);
				return key === 'alternate' ? alternate.promise : new Promise<string>(() => {});
			},
		});
		await drain();
		expect(started).toEqual(['alternate']);
		alternate.resolve('ALT');
		const out = await done;
		expect(out.html).toContain('ALT');
		expect(started).toEqual(['alternate']);
	});

	it('does not refetch an earlier fulfilled sibling when a later sibling suspends', async () => {
		const mod = evalServer(
			`function Item(p) @{
				const value = use(p.load(p.name));
				<span>{value as string}</span>
			}
			function Pair(p) @{
				<><Item name="stable" load={p.load} /><Item name="changing" load={p.load} /></>
			}
			export function Page(p) @{
				<main>@try { <Pair load={p.load} /> } @pending { <i>w</i> }</main>
			}`,
			'fulfilled-sibling.tsrx',
		);
		const started: string[] = [];
		const changing = deferred<string>();
		const fulfilled = {
			status: 'fulfilled',
			value: 'STABLE',
			then() {},
		};
		const done = prerender(mod.Page, {
			load: (key: string) => {
				started.push(key);
				return key === 'stable' ? fulfilled : changing.promise;
			},
		});
		await drain();
		expect(started).toEqual(['stable', 'changing']);
		changing.resolve('CHANGING');
		const out = await done;
		expect(out.html).toContain('STABLE');
		expect(out.html).toContain('CHANGING');
		expect(started).toEqual(['stable', 'changing']);
	});

	it('warms repeated instances of the same component and dependency values', async () => {
		const mod = evalServer(
			`function Item(p) @{
				const value = use(p.load('same'));
				<span>{value as string}</span>
			}
			function Pair(p) @{
				<><Item load={p.load} /><Item load={p.load} /></>
			}
			export function Page(p) @{
				<main>@try { <Pair load={p.load} /> } @pending { <i>w</i> }</main>
			}`,
			'repeated-siblings.tsrx',
		);
		const started: string[] = [];
		const jobs: ReturnType<typeof deferred<string>>[] = [];
		const done = prerender(mod.Page, {
			load: (key: string) => {
				started.push(key);
				const job = deferred<string>();
				jobs.push(job);
				return job.promise;
			},
		});
		await drain();
		expect(started).toEqual(['same', 'same']);
		jobs[0].resolve('FIRST');
		jobs[1].resolve('SECOND');
		const out = await done;
		expect(out.html).toContain('FIRST');
		expect(out.html).toContain('SECOND');
		expect(started).toEqual(['same', 'same']);
	});

	it('preserves distinct results across more than 64 same-dependency component occurrences', async () => {
		const occurrenceCount = 65;
		const items = Array.from({ length: occurrenceCount }, () => '<Item load={p.load} />').join('');
		const mod = evalServer(
			`function Item(p) @{
				const value = use(p.load('same'));
				<span>{value as string}</span>
			}
			function Many(p) @{
				<>${items}</>
			}
			export function Page(p) @{
				<main>@try { <Many load={p.load} /> } @pending { <i>w</i> }</main>
			}`,
			'many-repeated-siblings.tsrx',
		);
		const started: string[] = [];
		const jobs: ReturnType<typeof deferred<string>>[] = [];
		const done = prerender(mod.Page, {
			load: (key: string) => {
				started.push(key);
				const job = deferred<string>();
				jobs.push(job);
				return job.promise;
			},
		});
		await drain();

		// The renderer must start every concrete occurrence before any one of them
		// resolves, despite all 65 sharing one component, call site, and dependency.
		expect(started).toHaveLength(occurrenceCount);
		expect(started.every((key) => key === 'same')).toBe(true);
		expect(jobs).toHaveLength(occurrenceCount);

		const expected = Array.from(
			{ length: occurrenceCount },
			(_, index) => `VALUE-${index.toString().padStart(3, '0')}`,
		);
		for (let index = occurrenceCount - 1; index >= 0; index--) {
			jobs[index].resolve(expected[index]);
		}
		const out = await done;
		const container = document.createElement('div');
		container.innerHTML = out.html;
		const rendered = Array.from(container.querySelectorAll('span'), (node) => node.textContent);
		expect(rendered).toEqual(expected);
		expect(started).toHaveLength(occurrenceCount);
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
