// Transient (`$`-prefixed) props never reach the DOM; shouldForwardProp
// filters remaining props, composes across styled(Styled) layers, and can be
// provided contextually through StyleSheetManager.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled, { StyleSheetManager } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('transient props and shouldForwardProp', () => {
	it('always strips $-prefixed props from the DOM but styles still see them', () => {
		const Card = styled.div<{ $pad: number }>`
			padding: ${(p) => p.$pad}em;
		`;
		const m = mount(() => createElement(Card as any, { id: 'p', $pad: 3 }));
		const el = m.find('#p');
		expect(el.hasAttribute('$pad')).toBe(false);
		expect(getRenderedCSS()).toContain('padding:3em');
		m.unmount();
	});

	it('withConfig({ shouldForwardProp }) filters arbitrary props', () => {
		const Filtered = styled.div.withConfig({
			shouldForwardProp: (prop) => prop !== 'blocked',
		})<{ blocked?: string }>`
			color: seagreen;
		`;
		const m = mount(() =>
			createElement(Filtered as any, { id: 'f', blocked: 'nope', 'data-ok': 'yes' }),
		);
		const el = m.find('#f');
		expect(el.hasAttribute('blocked')).toBe(false);
		expect(el.getAttribute('data-ok')).toBe('yes');
		m.unmount();
	});

	it('composes shouldForwardProp across styled(Styled) — both filters must pass', () => {
		const Inner = styled.div.withConfig({
			shouldForwardProp: (prop) => prop !== 'a',
		})`
			color: red;
		`;
		const Outer = styled(Inner).withConfig({
			shouldForwardProp: (prop) => prop !== 'b',
		})`
			color: blue;
		`;
		const m = mount(() =>
			createElement(Outer as any, { id: 'o', a: '1', b: '2', 'data-keep': '3' }),
		);
		const el = m.find('#o');
		expect(el.hasAttribute('a')).toBe(false);
		expect(el.hasAttribute('b')).toBe(false);
		expect(el.getAttribute('data-keep')).toBe('3');
		m.unmount();
	});

	it('inherits shouldForwardProp from StyleSheetManager context', () => {
		const Plain = styled.div`
			color: darkkhaki;
		`;
		const m = mount(() =>
			createElement(StyleSheetManager as any, {
				shouldForwardProp: (prop: string) => prop !== 'ctxblocked',
				children: createElement(Plain as any, { id: 'ctx', ctxblocked: 'x', 'data-y': 'y' }),
			}),
		);
		const el = m.find('#ctx');
		expect(el.hasAttribute('ctxblocked')).toBe(false);
		expect(el.getAttribute('data-y')).toBe('y');
		m.unmount();
	});
});
