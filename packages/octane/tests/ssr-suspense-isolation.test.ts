import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';

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

describe('SSR suspense — resolved values and concurrent render isolation', () => {
	// The same component renders both inside and after a Suspense boundary; each
	// position must retain the promise value supplied by the application.
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

	// Each keyed item has an independent promise and must retain its own value.
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

	// Resolve two nested render trees in an interleaved order. Neither request's
	// data may leak into the other response.
	it('keeps concurrent renders isolated while promises resolve out of order', async () => {
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

	// Context supplied above the boundary remains visible after suspended content resolves.
	it('reads context from a Provider above the boundary after resolving', async () => {
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

	// An error thrown after data resolves belongs to the application's ancestor
	// boundary and must not reject the whole prerender operation.
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
