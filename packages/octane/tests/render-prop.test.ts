import { describe, it, expect } from 'vitest';
import { flushSync, hydrateRoot, type ComponentBody } from '../src/index.js';
import { renderToString } from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import {
	App,
	AppFrag,
	CallbackEvaluation,
	FragmentCallbackEvaluation,
} from './_fixtures/render-prop.tsrx';

// React-style render-prop children: `<Comp>{(data) => <jsx/>}</Comp>`. The arrow
// body is bare JSX — the compiler lowers it to a `createElement(...)` descriptor
// while keeping the arrow callable, so the consuming component can do
// `props.children(value)` and have the returned descriptor rendered.
describe('render-prop children (bare-JSX arrow)', () => {
	it.each([
		['CallbackEvaluation', CallbackEvaluation],
		['FragmentCallbackEvaluation', FragmentCallbackEvaluation],
	] as const)('preserves callback evaluation through SSR and hydration: %s', (name, Component) => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/render-prop.tsrx');
		const { html } = renderToString(server[name]);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const existing = container.querySelector('span');
		expect(existing?.textContent).toBe('during callback');
		const root = hydrateRoot(container, Component);
		try {
			flushSync(() => {});
			expect(container.querySelector('span')).toBe(existing);
			expect(existing?.textContent).toBe('during callback');
		} finally {
			root.unmount();
			container.remove();
		}
	});
	it.each([CallbackEvaluation, FragmentCallbackEvaluation])(
		'evaluates the returned JSX while the render callback runs',
		(Component) => {
			const result = mount(Component);
			try {
				expect(result.find('span').textContent).toBe('during callback');
			} finally {
				result.unmount();
			}
		},
	);
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

	it('keeps a parenthesised JSX render prop callable and renders its returned element', () => {
		// Keep the authored parentheses in source bytes because formatting a fixture
		// canonicalizes them away. Executing the output proves the render prop stays
		// callable and its JSX result remains renderable without pinning a factory.
		const src =
			'function Provide(props) @{ <div>{props.children("hi")}</div> }\n' +
			'export function App() @{ <Provide>{(v) => (<span class="rendered">{v as string}</span>)}</Provide> }';
		const fixture = loadCompiledFixtureSource<{ App: ComponentBody }>(src, {
			id: 'rp-paren.tsrx',
			mode: 'client',
		});
		const result = mount(fixture.App);
		const rendered = result.find('.rendered');
		expect(rendered.tagName).toBe('SPAN');
		expect(rendered.textContent).toBe('hi');
		result.unmount();
	});
});
