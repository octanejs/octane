import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { ConcatCount, Labelled } from './_fixtures/known-string.tsrx';

// A dynamic text hole `{expr}` is classified as TEXT (an `htext` binding) vs a
// RENDERABLE child (`textSlot`) by `isKnownStringExpression` in the compiler.
// The explicit `{expr as string}` cast forces TEXT, but it is UNNECESSARY when
// the compiler can already prove the value is a string — a string literal, a
// template literal, or a `+`-concatenation involving a string. These tests pin
// that the cast is optional in exactly those provably-string shapes, and still
// required for values the (syntactic) compiler can't prove (bare identifier /
// member access), which stay renderable holes.

function classify(holeOrSetup: string, hole?: string): 'text' | 'renderable' | string {
	const setup = hole === undefined ? '' : holeOrSetup;
	const theHole = hole === undefined ? holeOrSetup : hole;
	const src = `import { useState } from 'octane';
		export function C(props) @{ const [n, setN] = useState(0); ${setup} <p>${theHole}</p> }`;
	const code = compile(src, 'ks.tsrx').code;
	// A text hole mounts via `htext`; a renderable `{expr}` hole goes through the
	// inline text-hole path (`textHole`, template bodies) or the `textSlot` wrapper
	// (noTemplate bodies).
	const isText = /htext\(/.test(code);
	const isChild = /childTextHole\(|textHole\(|textSlot\(/.test(code);
	if (isText && !isChild) return 'text';
	if (isChild && !isText) return 'renderable';
	return `ambiguous(htext=${isText},renderable=${isChild})`;
}

describe('text holes — `as string` cast is optional when provably a string', () => {
	it('`+`-concatenation with a string literal → text (no cast)', () => {
		expect(classify(`{'Count: ' + n}`)).toBe('text');
	});

	it('`+`-concatenation in either operand order → text (no cast)', () => {
		expect(classify(`{n + ' items'}`)).toBe('text');
	});

	it('template literal → text (no cast)', () => {
		expect(classify('{`Count: ${n}`}')).toBe('text');
	});

	it('string literal `+` a member access → text (no cast)', () => {
		expect(classify(`{'Hi ' + props.name}`)).toBe('text');
	});

	it('explicit `as string` cast → text', () => {
		expect(classify('{n as string}')).toBe('text');
	});

	it('bare identifier (not provably a string) → renderable hole; cast still required', () => {
		expect(classify('{n}')).toBe('renderable');
	});

	it('bare member access (not provably a string) → renderable hole; cast still required', () => {
		expect(classify('{props.name}')).toBe('renderable');
	});
});

describe('known-string concat hole renders + updates at runtime (no cast)', () => {
	it('renders the concatenation as text and reacts to state', () => {
		const r = mount(ConcatCount as any);
		expect(r.html()).toBe('<button>Count: 0</button>');
		r.click('button');
		expect(r.html()).toBe('<button>Count: 1</button>');
		r.unmount();
	});
});

// A bare identifier hole `{x}` is normally a renderable hole, but when `x` is a
// setup `const` the compiler can track back to a string (a provably-string
// initializer, a `: string` annotation, or a `string`-typed param), it becomes a
// text binding too — so the `as string` cast is unnecessary for tracked locals.
// Render scopes that re-bind the name (a `@for` loop var) are excluded so the
// inner hole is never misclassified.
describe('text holes — bare identifier tracked back to a string (no cast)', () => {
	it('const bound to a `+`-concat → text', () => {
		expect(classify(`const greeting = 'Hi ' + props.name;`, '{greeting}')).toBe('text');
	});

	it('const with a `: string` annotation → text', () => {
		expect(classify(`const label: string = props.x;`, '{label}')).toBe('text');
	});

	it('a chain of string consts → text', () => {
		expect(classify(`const a = 'x'; const b = a + props.y;`, '{b}')).toBe('text');
	});

	it('a non-string const stays a renderable hole', () => {
		expect(classify(`const count = 5;`, '{count}')).toBe('renderable');
	});

	it('a `let` (not const) is not tracked → renderable', () => {
		expect(classify(`let s = 'x';`, '{s}')).toBe('renderable');
	});

	it('SHADOW GUARD: a `@for` loop var shadowing a string const is NOT treated as text', () => {
		const src = `import { useState } from 'octane';
			export function C(props) @{
				const item = 'outer';
				<ul>@for (const item of props.items; key item) { <li>{item}</li> } </ul>
			}`;
		const code = compile(src, 'shadow.tsrx').code;
		// The inner {item} is the loop var, so it must be a renderable child (inline
		// text-hole / textSlot), not a text binding stamped from the outer `const
		// item` string.
		expect(/childTextHole\(|textHole\(|textSlot\(/.test(code)).toBe(true);
	});

	it('`string`-typed param → text', () => {
		const code = compile(`export function C(name: string) @{ <p>{name}</p> }`, 'param.tsrx').code;
		expect(/htext\(/.test(code) && !/childTextHole\(|textHole\(|textSlot\(/.test(code)).toBe(true);
	});
});

describe('tracked-identifier hole renders + updates at runtime (no cast)', () => {
	it('renders the tracked const as text and reacts to state', () => {
		const r = mount(Labelled as any);
		expect(r.html()).toBe('<button>n=0</button>');
		r.click('button');
		expect(r.html()).toBe('<button>n=1</button>');
		r.unmount();
	});
});

// The strongest cross-cutting check: server and client MUST classify a tracked
// identifier hole identically, or the SSR markup wouldn't line up for hydration.
// collectKnownStringLocals runs on both compile paths, so they agree by
// construction — verify the round-trip adopts the server node and stays live.
const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/known-string.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'known-string.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

describe('tracked-identifier hole hydrates (server + client classify identically)', () => {
	it('adopts the server text node for a tracked `{label}` hole and stays interactive', async () => {
		const server = serverModule();
		const { body } = await ServerRT.render(server.Labelled, {});
		expect(body).toContain('<button>n=0</button>'); // server emitted it as TEXT

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = body;
		const btn = container.querySelector('button') as HTMLButtonElement;
		const root = hydrateRoot(container, Labelled);
		flushSync(() => {});

		expect(container.querySelector('button')).toBe(btn); // adopted, not rebuilt
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('n=1'); // tracked text binding is live
		root.unmount();
		container.remove();
	});
});
