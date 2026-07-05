import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';

// SSR suspense "discovery" optimization (runtime.server.ts render()). A waterfall
// (each level's use() only reachable once the previous resolves) used to cost D+1
// FULL-tree passes — re-serializing the static bulk on every pass. render() now
// re-renders only the innermost suspending COMPONENT subtree between the (few)
// canonical full passes, so the bulk renders ~twice regardless of depth. The
// emitted HTML always comes from a normal full pass, so output/seeds/ids are
// byte-identical to the retry-loop design (proven by ssr-suspense.test.ts).

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

describe('SSR suspense — discovery re-render (subtree-scoped passes)', () => {
	// The core win: the static bulk (and the outer App body) render a CONSTANT
	// number of times regardless of waterfall depth, because discovery rounds
	// re-run only the suspending Chain subtree, not the whole tree. On the old
	// full-retry loop App would run depth+1 times and each Big 2*(depth+1) times.
	const WATERFALL = `
		export function Big(p) @{
			p.onBig();
			<ul class="big">
				@for (const i of p.items; key i) { <li>{('' + i) as string}</li> }
			</ul>
		}
		export function Chain(p) @{
			<section class="lvl">
				@try {
					const v = use(p.make(p.level));
					<div class="ok">{('L' + p.level + '=' + v) as string}
						@if (p.level < p.depth) {
							<Chain level={p.level + 1} depth={p.depth} make={p.make} />
						}
					</div>
				} @pending {
					<span class="fb">loading</span>
				}
			</section>
		}
		export function App(p) @{
			p.tick();
			<main>
				<Big items={p.items} onBig={p.onBig} />
				<Chain level={1} depth={p.depth} make={p.make} />
				<Big items={p.items} onBig={p.onBig} />
			</main>
		}
	`;
	const wf = evalServer(WATERFALL, 'wf.tsrx');

	it('renders the outer tree exactly TWICE and the bulk 2x per Big for a D=3 waterfall', async () => {
		let ticks = 0;
		let bigs = 0;
		const makeCounts: Record<number, number> = {};
		const make = (level: number) => {
			makeCounts[level] = (makeCounts[level] ?? 0) + 1;
			return Promise.resolve(level * 10);
		};
		const out = await prerender(wf.App, {
			depth: 3,
			items: [1, 2, 3],
			tick: () => ticks++,
			onBig: () => bigs++,
			make,
		});

		// Outer App body ran exactly 2x (initial full pass + final canonical pass) —
		// NOT depth+1 = 4x. Each of the two Bigs ran once per full pass = 4 total,
		// NOT 2*(depth+1) = 8. This is the whole point: discovery skips the bulk.
		expect(ticks).toBe(2);
		expect(bigs).toBe(4);

		// The outermost level's thenable creator fires 3x (pass 1, the single
		// discovery round that re-runs Chain#0, and the final pass) — a CONSTANT,
		// not depth+1 = 4x. Deep waterfalls therefore stop re-firing shallow creators.
		expect(makeCounts[1]).toBe(3);
		expect(makeCounts[1]).toBeLessThan(4);

		// And the body is fully resolved (every @pending gone, final chain present).
		expect(out.html).not.toContain('loading');
		expect(out.html).toContain('L1=10');
		expect(out.html).toContain('L2=20');
		expect(out.html).toContain('L3=30');
	});

	it('scales the outer render count as a CONSTANT (D=6 still renders App twice)', async () => {
		let ticks = 0;
		let bigs = 0;
		const out = await prerender(wf.App, {
			depth: 6,
			items: [1],
			tick: () => ticks++,
			onBig: () => bigs++,
			make: (level: number) => Promise.resolve(level),
		});
		expect(ticks).toBe(2); // depth+1 = 7 on the old loop
		expect(bigs).toBe(4);
		expect(out.html).toContain('L6=6');
	});

	// Key stability across a component membrane: the SAME component containing a
	// use() rendered BOTH inside a suspending @try AND as a following sibling. The
	// frame-scoped key must keep their resolved values disjoint (a bug in keying
	// would cross the data — wrong HTML and wrong hydration seeds, silently).
	it('does not cross resolved values between a use() inside a boundary and one after it', async () => {
		const mod = evalServer(
			`export function Leaf(p) @{ <span class={p.cls}>{use(p.v) as string}</span> }
			 export function App(p) @{
				<div>
					@try { <Leaf cls="inside" v={p.inside} /> } @pending { <i>l</i> }
					<Leaf cls="after" v={p.after} />
				</div>
			 }`,
			'membrane.tsrx',
		);
		const out = await prerender(mod.App, {
			inside: Promise.resolve('IN'),
			after: Promise.resolve('AF'),
		});
		expect(out.html).toContain('<span class="inside">IN</span>');
		expect(out.html).toContain('<span class="after">AF</span>');
		expect(out.html).not.toContain('>AF</span></span>'); // sanity: not crossed
		expect(out.html).not.toContain('<span class="inside">AF</span>');
		expect(out.html).not.toContain('<span class="after">IN</span>');
	});

	// Parallel discovery jobs: a suspending @try inside a per-iteration COMPONENT
	// under an @for. Each Item is its own discovery job; distinct per-iteration
	// values must survive the subtree re-runs without crossing.
	it('keeps distinct per-iteration values under an @for of suspending components', async () => {
		const mod = evalServer(
			`export function Item(p) @{
				@try { <li>{use(p.v) as string}</li> } @pending { <li>x</li> }
			 }
			 export function App(p) @{
				<ul>@for (const it of p.items; key it.id) { <Item v={it.v} /> }</ul>
			 }`,
			'foritem.tsrx',
		);
		const out = await prerender(mod.App, {
			items: [
				{ id: 1, v: Promise.resolve('a') },
				{ id: 2, v: Promise.resolve('b') },
				{ id: 3, v: Promise.resolve('c') },
			],
		});
		expect(out.html).toContain('<li>a</li>');
		expect(out.html).toContain('<li>b</li>');
		expect(out.html).toContain('<li>c</li>');
	});

	// Concurrency across DISCOVERY rounds: two D=2 waterfalls in flight at once,
	// resolved in reverse/interleaved order, so both are mid-discovery when the
	// module globals (FRAME / DEFERRED / CURRENT_COMP + the pass state) are swapped
	// across awaits. Neither render's data may leak into the other.
	it('keeps two concurrent renders isolated while BOTH are in discovery rounds', async () => {
		const mod = evalServer(
			`export function Chain(p) @{
				<section>
					@try {
						<div>{use(p.next).label as string}
							@if (use(p.next).child) { <Chain next={use(p.next).child} /> }
						</div>
					} @pending { <span>load</span> }
				</section>
			 }
			 export function App(p) @{ <main><Chain next={p.next} /></main> }`,
			'concurrent-wf.tsrx',
		);
		const a1 = deferred<any>();
		const a2 = deferred<any>();
		const b1 = deferred<any>();
		const b2 = deferred<any>();
		const pA = prerender(mod.App, { next: a1.promise });
		const pB = prerender(mod.App, { next: b1.promise });
		// Interleave: drive B a level, then A a level, then B's leaf, then A's leaf.
		b1.resolve({ label: 'B1', child: b2.promise });
		a1.resolve({ label: 'A1', child: a2.promise });
		b2.resolve({ label: 'B2', child: null });
		a2.resolve({ label: 'A2', child: null });
		const [ra, rb] = await Promise.all([pA, pB]);
		expect(ra.html).toContain('A1');
		expect(ra.html).toContain('A2');
		expect(ra.html).not.toContain('B1');
		expect(ra.html).not.toContain('B2');
		expect(rb.html).toContain('B1');
		expect(rb.html).toContain('B2');
		expect(rb.html).not.toContain('A1');
		expect(rb.html).not.toContain('A2');
	});

	// A Provider ABOVE the boundary stamps context on scope objects the discovery
	// job retains by reference; a component re-run in a discovery round must still
	// read that context through its captured parent scope chain (the Provider is
	// not itself re-run in the round).
	it('reads context from a Provider above the boundary during a discovery re-run', async () => {
		const mod = evalServer(
			`import { use, useContext, createContext } from 'octane';
			 export const Ctx = createContext('default');
			 export function Leaf(p) @{
				const c = useContext(Ctx);
				const v = use(p.promise);
				<span class="leaf">{(c + ':' + v) as string}</span>
			 }
			 export function App(p) @{
				<Ctx.Provider value="ctxval">
					@try { <Leaf promise={p.promise} /> } @pending { <i>l</i> }
				</Ctx.Provider>
			 }`,
			'ctx-boundary.tsrx',
		);
		const out = await prerender(mod.App, { promise: Promise.resolve('DATA') });
		expect(out.html).toContain('ctxval:DATA');
	});

	// REQ from the adversarial review: a REAL error thrown by a component during a
	// DISCOVERY re-run (after its use() resolved) must be discarded — the canonical
	// full pass re-renders the real tree, where the error unwinds to its actual
	// ancestor @catch. Propagating from the discovery driver would reject render()
	// even though a boundary handles the error.
	it('routes a post-resolve error to the ancestor @catch, not out of render()', async () => {
		const mod = evalServer(
			`import { use } from 'octane';
			 export function Boom(p) @{
				const v = use(p.promise);
				if (v === 'boom') throw new Error('exploded: ' + v);
				<span class="ok">{v as string}</span>
			 }
			 export function App(p) @{
				<main>
					@try {
						<Boom promise={p.promise} />
					} @pending {
						<p class="pending">{'loading'}</p>
					} @catch (e) {
						<p class="caught">{e.message as string}</p>
					}
				</main>
			 }`,
			'discovery-error.tsrx',
		);
		const d = deferred<string>();
		const p = prerender(mod.App, { promise: d.promise });
		d.resolve('boom');
		const { html } = await p;
		expect(html).toContain('class="caught"');
		expect(html).toContain('exploded: boom');
		expect(html).not.toContain('class="ok"');
	});
});
