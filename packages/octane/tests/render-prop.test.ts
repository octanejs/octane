import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { compile } from 'octane/compiler';
import { App, AppFrag } from './_fixtures/render-prop.tsrx';

// React-style render-prop children: `<Comp>{(data) => <jsx/>}</Comp>`. The arrow
// body is bare JSX — the compiler lowers it to a `createElement(...)` descriptor
// while keeping the arrow callable, so the consuming component can do
// `props.children(value)` and have the returned descriptor rendered.
describe('render-prop children (bare-JSX arrow)', () => {
	it('calls the render-prop with data and renders the returned host element', () => {
		const r = mount(App);
		expect(r.find('.wrap')).toBeTruthy();
		const rendered = r.find('.rendered');
		expect(rendered.tagName).toBe('SPAN');
		expect(rendered.getAttribute('data-tag')).toBe('x');
		expect(rendered.textContent).toBe('hi');
		r.unmount();
	});

	it('supports a fragment arrow body (flattened into siblings)', () => {
		const r = mount(AppFrag);
		expect(r.find('.wrap')).toBeTruthy();
		expect(r.find('.rendered').textContent).toBe('hi');
		expect(r.find('.extra').textContent).toBe('!');
		r.unmount();
	});

	it('lowers a parenthesised arrow body to createElement (kept callable)', () => {
		// The prettier plugin canonicalises `(v) => (<span/>)`, so assert the
		// parenthesised source compiles via a string literal the formatter can't
		// rewrite. The arrow is preserved; only its body is lowered.
		const src =
			'function Provide(props) @{ <div>{props.children("hi")}</div> }\n' +
			'export function App() @{ <Provide>{(v) => (<span class="rendered">{v as string}</span>)}</Provide> }';
		const { code } = compile(src, 'rp-paren.tsrx', { mode: 'client' });
		expect(code).not.toMatch(/<span/); // no raw (unlowered) JSX leaked
		expect(code).toContain('(v) => createElement');
	});
});
