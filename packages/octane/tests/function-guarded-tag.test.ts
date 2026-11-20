import { afterEach, describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { createRoot, flushSync } from '../src/index.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { act } from './_helpers.js';

/**
 * A `const` tag inside the consequent of `typeof Tag === 'function'` cannot be a
 * host string, so it takes the function-only component slot instead of the
 * generic one that also renders host string tags.
 */
const source = `
import { createContext, lazy, memo, useContext } from 'octane';
const Theme = createContext('none');
function Plain(p) @{ <b class="plain">{p.label as string}</b> }
const Memo = memo(function Memo(p) @{ <b class="memo">{p.label as string}</b> });
const Lazy = lazy(() => Promise.resolve({ default: Plain }));
function Read() @{ <b class="context">{useContext(Theme) as string}</b> }
export const components = { Plain, Memo, Lazy, Theme, Read };
export function View(p) @{
	const Tag = p.tag;
	<div>
		@if (typeof Tag === 'function') {
			<Tag label={p.label} value={p.label}><Read /></Tag>
		} @else {
			<p class="other">{String(Tag) as string}</p>
		}
	</div>
}`;

const slots = (code: string) => ({
	fn: code.match(/_\$componentSlotFunction\(/g)?.length ?? 0,
	generic: code.match(/_\$componentSlot\(/g)?.length ?? 0,
});

const tagged = (body: string) =>
	compile(`function F() @{ <i /> }\nexport function V(p) @{\n${body}\n}`, 'guarded-tag.tsrx', {
		hmr: false,
	}).code;

describe('typeof-function guarded component tags', () => {
	let host: HTMLElement | undefined;
	afterEach(() => host?.remove());

	it('compiles a guarded const tag to the function-only slot', () => {
		expect(slots(compile(source, 'guarded-tag.tsrx', { hmr: false }).code)).toEqual({
			fn: 1,
			generic: 0,
		});
		expect(
			slots(tagged(`const T = p.t;\n<div>@if (typeof T === 'function') { <T /> }</div>`)),
		).toEqual({ fn: 1, generic: 0 });
		expect(
			slots(tagged(`const T = p.t;\n<div>@if ('function' == typeof T) { <T /> }</div>`)),
		).toEqual({ fn: 1, generic: 0 });
		expect(
			slots(
				tagged(
					`const T = p.t;\n<div>@if (p.x) { <i /> } @else if (typeof T === 'function') { <T /> }</div>`,
				),
			),
		).toEqual({ fn: 1, generic: 0 });
	});

	it.each([
		['an unguarded tag', `const T = p.t;\n<div><T /></div>`],
		['a let tag', `let T = p.t;\n<div>@if (typeof T === 'function') { <T /> }</div>`],
		[
			'the else arm',
			`const T = p.t;\n<div>@if (typeof T !== 'function') { <i /> } @else { <T /> }</div>`,
		],
		['a negated guard', `const T = p.t;\n<div>@if (typeof T !== 'function') { <T /> }</div>`],
		[
			'a guard over another binding',
			`const T = p.t;\nconst U = p.u;\n<div>@if (typeof U === 'function') { <T /> }</div>`,
		],
		['a different typeof', `const T = p.t;\n<div>@if (typeof T === 'object') { <T /> }</div>`],
	])('keeps the generic slot for %s', (_name, body) => {
		expect(slots(tagged(body))).toEqual({ fn: 0, generic: 1 });
	});

	it('renders every component kind through the guarded slot', async () => {
		const module = loadCompiledFixtureSource(source, {
			id: 'guarded-tag.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const { Plain, Memo, Lazy, Theme } = module.components;
		host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		try {
			root.render(module.View, { tag: Plain, label: 'one' });
			expect(host.querySelector('.plain')?.textContent).toBe('one');
			flushSync(() => root.render(module.View, { tag: Memo, label: 'two' }));
			expect(host.querySelector('.memo')?.textContent).toBe('two');
			flushSync(() => root.render(module.View, { tag: Theme, label: 'provided' }));
			expect(host.querySelector('.context')?.textContent).toBe('provided');
			await act(async () => root.render(module.View, { tag: Lazy, label: 'three' }));
			expect(host.querySelector('.plain')?.textContent).toBe('three');
			flushSync(() => root.render(module.View, { tag: 'section', label: 'four' }));
			expect(host.querySelector('section')).toBeNull();
			expect(host.querySelector('.other')?.textContent).toBe('section');
		} finally {
			root.unmount();
		}
		expect(host.childNodes.length).toBe(0);
	});
});
