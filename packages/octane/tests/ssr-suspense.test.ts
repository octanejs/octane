import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';

// SSR Phase 4 — Suspense + data serialization. render() is async: a
// use(thenable) that hasn't resolved suspends the pass (the @try shows
// @pending), render() awaits it and re-renders, so the @try ends up showing its
// resolved success arm (or @catch on rejection). Each resolved value is appended
// to `body` as an inline data <script> for the client to seed on hydration.

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

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
const m = evalServer(
	readFileSync(join(FIXTURES, 'ssr-suspense.tsrx'), 'utf8'),
	'ssr-suspense.tsrx',
);

const OPEN = '<!--[-->';
const CLOSE = '<!--]-->';
const seed = (json: string) =>
	`<script type="application/json" data-octane-suspense>${json}</script>`;

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('SSR Phase 4 — render() awaits use(promise)', () => {
	it('renders fulfilled plain async components after replay', async () => {
		const out = await prerender(m.AsyncComponentBoundary, {
			component: async () => RT.createElement('span', { className: 'async-component-ok' }, 'ready'),
		});

		expect(out.html).toContain('<span class="async-component-ok">ready</span>');
		expect(out.html).not.toContain('async-component-loading');
	});

	it('routes plain async component rejection to @catch without an unhandled replay rejection', async () => {
		const reason = new Error('async-component-nope');
		const caught: unknown[] = [];
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (error: unknown) => unhandled.push(error);
		process.on('unhandledRejection', onUnhandledRejection);
		try {
			const out = await prerender(m.AsyncComponentBoundary, {
				onCatch: (error: unknown) => caught.push(error),
				component: async () => {
					throw reason;
				},
			});

			expect(out.html).toContain('<span class="async-component-error">async-component-nope</span>');
			expect(caught).toEqual([reason]);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
		}
	});

	it('does not re-observe the settled thenable when replay keeps its identity', async () => {
		const redundantObservation = new Error('stable-thenable-was-observed-again');
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (error: unknown) => unhandled.push(error);
		process.on('unhandledRejection', onUnhandledRejection);
		let componentCalls = 0;
		const value = RT.createElement('span', { className: 'stable-thenable' }, 'stable');
		// React's trackUsedThenable only observes the replay value when its identity
		// differs from the settled value. Make a same-identity subscription during
		// replay externally visible as an otherwise-unhandled child rejection.
		const stableThenable: any = Promise.resolve(value);
		const nativeThen = stableThenable.then.bind(stableThenable);
		stableThenable.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: unknown) => {
			if (componentCalls > 1) return Promise.reject(redundantObservation);
			return nativeThen(onFulfilled, onRejected);
		};
		try {
			const out = await prerender(m.AsyncComponentBoundary, {
				component: () => {
					componentCalls++;
					return stableThenable;
				},
			});

			expect(out.html).toContain('<span class="stable-thenable">stable</span>');
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
		}
	});

	it('keeps repeated and concurrent plain async component renders isolated', async () => {
		const component = (value: string) => async () =>
			RT.createElement('span', { className: 'async-component-value' }, value);

		const [left, right] = await Promise.all([
			prerender(m.AsyncComponentBoundary, { component: component('left') }),
			prerender(m.AsyncComponentBoundary, { component: component('right') }),
		]);
		const repeated = await prerender(m.AsyncComponentBoundary, {
			component: component('again'),
		});

		expect(left.html).toContain('<span class="async-component-value">left</span>');
		expect(left.html).not.toContain('right');
		expect(right.html).toContain('<span class="async-component-value">right</span>');
		expect(right.html).not.toContain('left');
		expect(repeated.html).toContain('<span class="async-component-value">again</span>');
		expect(repeated.html).not.toContain('left');
		expect(repeated.html).not.toContain('right');
	});

	it('isolates concurrent fulfilled and rejected plain async components', async () => {
		const rejectedReason = new Error('mixed-rejected');
		const caught: unknown[] = [];
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (error: unknown) => unhandled.push(error);
		process.on('unhandledRejection', onUnhandledRejection);
		try {
			const [fulfilled, rejected] = await Promise.all([
				prerender(m.AsyncComponentBoundary, {
					component: async () =>
						RT.createElement('span', { className: 'mixed-ok' }, 'mixed-fulfilled'),
				}),
				prerender(m.AsyncComponentBoundary, {
					onCatch: (error: unknown) => caught.push(error),
					component: async () => {
						throw rejectedReason;
					},
				}),
			]);

			expect(fulfilled.html).toContain('<span class="mixed-ok">mixed-fulfilled</span>');
			expect(fulfilled.html).not.toContain('mixed-rejected');
			expect(rejected.html).toContain('<span class="async-component-error">mixed-rejected</span>');
			expect(rejected.html).not.toContain('mixed-fulfilled');
			expect(caught).toEqual([rejectedReason]);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
		}
	});

	it('isolates simultaneous rejected plain async components and their original reasons', async () => {
		const leftReason = new Error('left-rejected');
		const rightReason = new Error('right-rejected');
		const leftCaught: unknown[] = [];
		const rightCaught: unknown[] = [];
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (error: unknown) => unhandled.push(error);
		process.on('unhandledRejection', onUnhandledRejection);
		try {
			const [left, right] = await Promise.all([
				prerender(m.AsyncComponentBoundary, {
					onCatch: (error: unknown) => leftCaught.push(error),
					component: async () => {
						throw leftReason;
					},
				}),
				prerender(m.AsyncComponentBoundary, {
					onCatch: (error: unknown) => rightCaught.push(error),
					component: async () => {
						throw rightReason;
					},
				}),
			]);

			expect(left.html).toContain('<span class="async-component-error">left-rejected</span>');
			expect(left.html).not.toContain('right-rejected');
			expect(right.html).toContain('<span class="async-component-error">right-rejected</span>');
			expect(right.html).not.toContain('left-rejected');
			expect(leftCaught).toEqual([leftReason]);
			expect(rightCaught).toEqual([rightReason]);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
		}
	});

	it('keeps cached replay outcomes authoritative over custom thenable behavior', async () => {
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (error: unknown) => unhandled.push(error);
		process.on('unhandledRejection', onUnhandledRejection);
		const replayThenable = (
			observe: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => void,
		) => ({
			then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
				observe(resolve, reject);
			},
		});
		const replaying = (first: PromiseLike<unknown>, replay: PromiseLike<unknown>) => {
			let initial = true;
			return () => {
				if (initial) {
					initial = false;
					return first;
				}
				return replay;
			};
		};
		try {
			const originalReason = new Error('cached-rejection');
			const caught: unknown[] = [];

			const fulfilled = await prerender(m.AsyncComponentBoundary, {
				component: replaying(
					Promise.resolve(RT.createElement('span', { className: 'cached-ok' }, 'cached-value')),
					replayThenable((resolve) => resolve('fresh-value')),
				),
			});
			const rejected = await prerender(m.AsyncComponentBoundary, {
				onCatch: (error: unknown) => caught.push(error),
				component: replaying(
					Promise.reject(originalReason),
					replayThenable((_resolve, reject) => reject(new Error('fresh-rejection'))),
				),
			});
			const throwsAfterContinuation = await prerender(m.AsyncComponentBoundary, {
				component: replaying(
					Promise.resolve(
						RT.createElement('span', { className: 'cached-after-throw' }, 'cached-after-throw'),
					),
					replayThenable((resolve) => {
						resolve('fresh-before-throw');
						throw new Error('observer-threw');
					}),
				),
			});

			expect(fulfilled.html).toContain('<span class="cached-ok">cached-value</span>');
			expect(fulfilled.html).not.toContain('fresh-value');
			expect(rejected.html).toContain(
				'<span class="async-component-error">cached-rejection</span>',
			);
			expect(rejected.html).not.toContain('fresh-rejection');
			expect(caught).toEqual([originalReason]);
			expect(throwsAfterContinuation.html).toContain(
				'<span class="cached-after-throw">cached-after-throw</span>',
			);
			expect(throwsAfterContinuation.html).not.toContain('fresh-before-throw');
			expect(throwsAfterContinuation.html).not.toContain('observer-threw');
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
		}
	});

	it('@try awaits use(promise) and renders the resolved success arm + seed', async () => {
		const out = await prerender(m.Boundary, { promise: Promise.resolve('hi') });
		// Nested ranges: outer = try-slot, inner = the resolved success arm.
		expect(out.html).toBe(
			`<div id="box">${OPEN}${OPEN}<span class="ok">hi</span>${CLOSE}${CLOSE}</div>` +
				seed('["hi"]'),
		);
	});

	it('a bare use(promise) with no @try boundary is awaited and resolved', async () => {
		const out = await prerender(m.AsyncLeaf, { promise: Promise.resolve('hello') });
		expect(out.html).toBe('<div id="leaf">hello</div>' + seed('["hello"]'));
	});

	it('routes a rejected use(promise) to @catch and seeds the catch hydration path', async () => {
		const out = await prerender(m.Boundary, { promise: Promise.reject(new Error('nope')) });
		expect(out.html).toBe(
			`<div id="box">${OPEN}${OPEN}<span class="err">nope</span>${CLOSE}${CLOSE}</div>` +
				seed(
					'{"__octane_new_rejection__":{"version":1,"values":[null],"rejections":[[0,{"kind":"error","name":"Error","message":"nope","fields":{}}]]}}',
				),
		);
	});

	it('resolves NESTED suspense across multiple passes (outer gates inner)', async () => {
		const out = await prerender(m.Nested, {
			outer: Promise.resolve('O'),
			inner: Promise.resolve('I'),
		});
		// Two nested @try, each = slot + arm → four nested ranges around the span.
		expect(out.html).toBe(
			`<div id="outer">${OPEN}${OPEN}${OPEN}${OPEN}<span class="both">O:I</span>${CLOSE}${CLOSE}${CLOSE}${CLOSE}</div>` +
				seed('["O","I"]'),
		);
	});

	it('resolves independent SIBLING boundaries (distinct call-site keys)', async () => {
		const out = await prerender(m.Siblings, {
			a: Promise.resolve('A'),
			b: Promise.resolve('B'),
		});
		expect(out.html).toBe(
			`<div id="sibs">${OPEN}${OPEN}<span class="a">A</span>${CLOSE}${CLOSE}${OPEN}${OPEN}<span class="b">B</span>${CLOSE}${CLOSE}</div>` +
				seed('["A","B"]'),
		);
	});

	it('seeds values in render (depth-first) order', async () => {
		// The seed array order is what the client consumes by cursor on hydrate, so
		// it must match the order use() is reached during render.
		const out = await prerender(m.Nested, {
			outer: Promise.resolve('first'),
			inner: Promise.resolve('second'),
		});
		const json = out.html.match(/data-octane-suspense>(.*?)<\/script>/)![1];
		expect(JSON.parse(json)).toEqual(['first', 'second']);
	});

	it('escapes `<` in the serialized seed payload so it cannot break out of <script>', async () => {
		const out = await prerender(m.AsyncLeaf, { promise: Promise.resolve('</script><x>') });
		// Body text is HTML-escaped as usual…
		expect(out.html).toContain('<div id="leaf">&lt;/script&gt;&lt;x&gt;</div>');
		// …and the JSON payload escapes every `<` to < (no literal `<` in it).
		const json = out.html.match(/data-octane-suspense>(.*?)<\/script>$/)![1];
		expect(json).not.toContain('<');
		expect(JSON.parse(json)).toEqual(['</script><x>']);
	});

	it('keeps two concurrent, interleaved renders isolated (no global clobbering)', async () => {
		// render() holds per-pass state (scope, suspense queue, css, seed list) in
		// module globals. Two render()s suspended at the same time must not bleed
		// into each other across the await. Force interleaving with deferreds:
		// start both (both suspend), then resolve in reverse order.
		const dA = deferred<string>();
		const dB = deferred<string>();
		const pA = prerender(m.Siblings, { a: dA.promise, b: Promise.resolve('A2') });
		const pB = prerender(m.AsyncLeaf, { promise: dB.promise });
		dB.resolve('B1');
		dA.resolve('A1');
		const [a, b] = await Promise.all([pA, pB]);
		expect(a.html).toBe(
			`<div id="sibs">${OPEN}${OPEN}<span class="a">A1</span>${CLOSE}${CLOSE}${OPEN}${OPEN}<span class="b">A2</span>${CLOSE}${CLOSE}</div>` +
				seed('["A1","A2"]'),
		);
		// b must contain ONLY its own seed — not A's values leaking through SERIAL.
		expect(b.html).toBe('<div id="leaf">B1</div>' + seed('["B1"]'));
	});

	it('non-suspending components emit no seed <script>', async () => {
		const out = await prerender(m.Boundary, { promise: Promise.resolve('x') });
		// (sanity: suspending one DOES seed)
		expect(out.html).toContain('data-octane-suspense');
		const plain = evalServer(
			`export function Plain() @{ <div id="p">{'static'}</div> }`,
			'plain.tsrx',
		);
		const out2 = await prerender(plain.Plain);
		expect(out2.html).toBe('<div id="p">static</div>');
		expect(out2.html).not.toContain('data-octane-suspense');
	});

	it('a use(thenable) that never settles fails the render via the suspense deadline (no hang)', async () => {
		const prev = RT.getSsrSuspenseTimeout();
		RT.setSsrSuspenseTimeout(50);
		try {
			// A promise that never resolves/rejects — without the deadline this render
			// would hang forever (MAX_SUSPENSE_PASSES only bounds the pass COUNT, and
			// is checked BEFORE the await).
			const stuck = new Promise<string>(() => {});
			await expect(prerender(m.AsyncLeaf, { promise: stuck })).rejects.toThrow(
				/did not settle within 50ms/,
			);
		} finally {
			RT.setSsrSuspenseTimeout(prev);
		}
	});

	// Regression: `use(thenable)` in JSX / control-flow EXPRESSION positions
	// (text holes, attributes, @if/@for/@switch heads) must get a stable server
	// call-site key, exactly like setup statements. Without it they fell back to
	// the shared base key '@' disambiguated only by render-order occurrence — so an
	// @if(use(...)) revealing new use() calls shifted the occurrence count and
	// sibling holes consumed each other's resolved values.
	it('keys use() in JSX/control-flow positions — siblings/nested do not cross values', async () => {
		const mod = evalServer(
			`export function App(p) @{
				<div>
					@if (use(p.show)) { <span class="x">{use(p.x) as string}</span> }
					<span class="y">{use(p.y) as string}</span>
				</div>
			}`,
			'cross.tsrx',
		);
		const out = await prerender(mod.App, {
			show: Promise.resolve(true),
			x: Promise.resolve('X'),
			y: Promise.resolve('Y'),
		});
		// x must render "X" and y must render "Y" — NOT crossed (pre-fix: both "Y").
		expect(out.html).toContain('<span class="x">X</span>');
		expect(out.html).toContain('<span class="y">Y</span>');
		expect(out.html).not.toContain('<span class="x">Y</span>');
	});

	it('keys use() per call-site in an @for body (distinct value per iteration)', async () => {
		const mod = evalServer(
			`export function App(p) @{
				<ul>
					@for (const item of use(p.items)) { <li>{use(item.v) as string}</li> }
				</ul>
			}`,
			'forUse.tsrx',
		);
		const out = await prerender(mod.App, {
			items: Promise.resolve([{ v: Promise.resolve('a') }, { v: Promise.resolve('b') }]),
		});
		expect(out.html).toContain('<li>a</li>');
		expect(out.html).toContain('<li>b</li>');
	});
});
