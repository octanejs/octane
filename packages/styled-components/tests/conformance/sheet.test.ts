// StyleSheetManager and sheet behavior: custom insertion target, namespace,
// unnamed-plugin error 15, upstream data-styled rehydration, and style dedup
// across many instances.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';

import styled, { StyleSheetManager, __PRIVATE__ } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('StyleSheetManager / sheet', () => {
	it('injects one rule for many instances of the same static component', () => {
		const Item = styled.li`
			color: mediumseagreen;
		`;
		const m = mount(() =>
			createElement('ul', {
				children: Array.from({ length: 5 }, (_, i) =>
					createElement(Item as any, { key: String(i), 'data-i': String(i) }),
				),
			}),
		);
		const occurrences = getRenderedCSS().split('color:mediumseagreen').length - 1;
		expect(occurrences).toBe(1);
		m.unmount();
	});

	it('renders styles into a custom target element', () => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		const Boxed = styled.div`
			color: cadetblue;
		`;
		const m = mount(() =>
			createElement(StyleSheetManager as any, {
				target: host,
				children: createElement(Boxed as any, { id: 'tgt' }),
			}),
		);
		const style = host.querySelector('style[data-styled]');
		expect(style).toBeTruthy();
		expect(style!.textContent).toContain('color:cadetblue');
		m.unmount();
		host.remove();
	});

	it('re-injects static styles when a custom target changes', () => {
		const first = document.createElement('div');
		const second = document.createElement('div');
		document.body.append(first, second);
		const Targeted = styled.div`
			color: steelblue;
		`;
		const App = (props: { target: HTMLElement }) =>
			createElement(StyleSheetManager as any, {
				target: props.target,
				children: createElement(Targeted as any, { id: 'retargeted' }),
			});
		const m = mount(App, { target: first });
		expect(first.textContent).toContain('color:steelblue');

		m.update(App, { target: second });

		expect(second.textContent).toContain('color:steelblue');
		m.unmount();
		first.remove();
		second.remove();
	});

	it('prefixes selectors with the configured namespace', () => {
		const Spaced = styled.div`
			color: darkred;
		`;
		const m = mount(() =>
			createElement(StyleSheetManager as any, {
				namespace: '#app-scope',
				children: createElement(Spaced as any, { id: 'ns' }),
			}),
		);
		expect(getRenderedCSS()).toContain('#app-scope ');
		m.unmount();
	});

	it('re-injects static styles when the stylis configuration changes', () => {
		const Static = styled.div`
			color: darkgreen;
		`;
		const App = (props: { namespace: string }) =>
			createElement(StyleSheetManager as any, {
				namespace: props.namespace,
				children: createElement(Static as any, { id: 'static-config' }),
			});
		const m = mount(App, { namespace: '#first-scope' });
		expect(getRenderedCSS()).toContain('#first-scope ');

		m.update(App, { namespace: '#second-scope' });

		expect(getRenderedCSS()).toContain('#second-scope ');
		m.unmount();
	});

	it('throws error 15 for unnamed stylis plugins', () => {
		const Anon = styled.div`
			color: black;
		`;
		const anonymousPlugin = (
			() => () =>
				undefined
		)();
		Object.defineProperty(anonymousPlugin, 'name', { value: '' });
		expect(() =>
			mount(() =>
				createElement(StyleSheetManager as any, {
					stylisPlugins: [anonymousPlugin as any],
					children: createElement(Anon as any, {}),
				}),
			),
		).toThrow();
	});

	it('rehydrates upstream data-styled server tags into a fresh sheet and removes them', () => {
		const tag = document.createElement('style');
		tag.setAttribute('data-styled', '');
		tag.setAttribute('data-styled-version', '6.4.3');
		tag.textContent =
			'.rehydrated-name{color:orchid;}/*!sc*/\n' +
			'data-styled.g999[id="rehydrate-test-id"]{content:"rehydrated-name,"}/*!sc*/\n';
		document.head.appendChild(tag);

		const sheet = new __PRIVATE__.StyleSheet({ isServer: false });
		sheet.rehydrate();

		expect(sheet.hasNameForId('rehydrate-test-id', 'rehydrated-name')).toBe(true);
		expect(document.head.contains(tag)).toBe(false);
	});
});

describe('Consumer children-block guard', () => {
	it('does not invoke compiled element children as render props; warns and renders null', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { ConsumerWithElementChildren } = await import('../_fixtures/consumer-blocks.tsrx');
			const m = mount(ConsumerWithElementChildren as any);
			// the children-blocks were not rendered (and not called with a context)
			expect(m.container.querySelector('#sheet-child')).toBeNull();
			expect(m.container.querySelector('#theme-child')).toBeNull();
			expect(warn.mock.calls.some((args) => String(args[0]).includes('function child'))).toBe(true);
			m.unmount();
		} finally {
			warn.mockRestore();
		}
	});
});
