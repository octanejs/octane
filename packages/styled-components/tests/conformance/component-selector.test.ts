// Component selectors: `${Other}` interpolates to `.styledComponentId`,
// folding styled(Styled) keeps both classes and both style layers, and
// referring to a non-styled component logs the error-13 diagnostic.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';

import styled from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('component selectors and folding', () => {
	it('interpolates a styled component as its class selector', () => {
		const Chip = styled.span`
			color: black;
		`;
		const Row = styled.div`
			display: flex;
			${Chip} {
				color: hotpink;
			}
		`;
		const m = mount(() =>
			createElement(Row as any, {
				id: 'row',
				children: createElement(Chip as any, { id: 'chip' }),
			}),
		);
		const cssText = getRenderedCSS();
		expect(cssText).toContain(`.${(Chip as any).styledComponentId}{color:hotpink;}`);
		m.unmount();
	});

	it('String(Component) is the component selector', () => {
		const Thing = styled.div``;
		expect(String(Thing)).toBe(`.${(Thing as any).styledComponentId}`);
	});

	it('folds styled(Styled): both classes on the node, both style layers injected', () => {
		const Base = styled.button`
			color: red;
			padding: 1px;
		`;
		const Extended = styled(Base)`
			color: blue;
		`;
		const m = mount(() => createElement(Extended as any, { id: 'x' }));
		const el = m.find('#x');
		expect(el.tagName).toBe('BUTTON');
		const cls = el.getAttribute('class') ?? '';
		expect(cls).toContain((Base as any).styledComponentId);
		expect(cls).toContain((Extended as any).styledComponentId);
		const cssText = getRenderedCSS();
		expect(cssText).toContain('color:red');
		expect(cssText).toContain('padding:1px');
		expect(cssText).toContain('color:blue');
		m.unmount();
	});

	it('logs error 13 in dev when a plain component is used as a selector', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			// A plain component whose render result is an element descriptor — the
			// documented misuse the diagnostic exists for (null-returning functions
			// are silently skipped, matching upstream).
			const NotStyled = () => createElement('i', {});
			const Broken = styled.div`
				${NotStyled as any} {
					color: red;
				}
			`;
			const m = mount(() => createElement(Broken as any, { id: 'b' }));
			expect(
				error.mock.calls.some((args) => String(args[0]).includes('is not a styled component')),
			).toBe(true);
			m.unmount();
		} finally {
			error.mockRestore();
		}
	});
});
