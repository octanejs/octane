// Factory API surface: withConfig ids, displayName generation, toString,
// isStyledComponent branding, defaultProps folding, static hoisting, and the
// too-many-classes dev warning.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';

import styled, { isStyledComponent, withTheme } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('factory API', () => {
	it('withConfig componentId/displayName produce the documented styledComponentId', () => {
		const A = styled.div.withConfig({ componentId: 'octane-test-cid' })``;
		expect((A as any).styledComponentId).toBe('octane-test-cid');

		// escape() folds CSS-selector characters to dashes and trims edge dashes
		const B = styled.div.withConfig({
			displayName: 'Fancy/Name!',
			componentId: 'octane-test-cid2',
		})``;
		expect((B as any).styledComponentId).toBe('Fancy-Name-octane-test-cid2');
		expect((B as any).displayName).toBe('Fancy/Name!');
	});

	it('generates displayName from the target', () => {
		expect((styled.div`` as any).displayName).toBe('styled.div');
		function MyWidget() {
			return null;
		}
		expect((styled(MyWidget as any)`` as any).displayName).toBe('Styled(MyWidget)');
	});

	it('isStyledComponent identifies styled components but not wrappers or plain fns', () => {
		const S = styled.div``;
		expect(isStyledComponent(S)).toBe(true);
		expect(isStyledComponent(() => null)).toBe(false);
		expect(isStyledComponent('div')).toBe(false);
		// A HOC that hoists statics from a styled component is NOT one itself.
		expect(isStyledComponent(withTheme(S as any))).toBe(false);
	});

	it('folds defaultProps through styled(Styled) with deep merge, driving the theme', () => {
		const Base = styled.h2`
			color: ${(p: any) => p.theme.color};
		`;
		(Base as any).defaultProps = { theme: { color: 'purple', spare: 'kept' } };
		const Extended = styled(Base)`
			background: ${(p: any) => p.theme.bg ?? 'none'};
		`;
		(Extended as any).defaultProps = { theme: { color: 'saddlebrown' } };

		// deep merge: the extended override wins per-key, base keys survive
		expect((Extended as any).defaultProps).toEqual({
			theme: { color: 'saddlebrown', spare: 'kept' },
		});

		const m = mount(() => createElement(Extended as any, { id: 'dp' }));
		expect(getRenderedCSS()).toContain('color:saddlebrown');
		m.unmount();
	});

	it('hoists custom statics from a wrapped component but not styled internals', () => {
		function Target() {
			return null;
		}
		(Target as any).customStatic = 'carried';
		const S = styled(Target as any)``;
		expect((S as any).customStatic).toBe('carried');
		// the styled internals belong to S itself, not the target
		expect((S as any).target).toBe(Target);
	});

	it('warns in dev after 200 generated classes for one component', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const Hot = styled.div<{ $n: number }>`
				width: ${(p) => p.$n}px;
			`;
			const body = (props: any) => createElement(Hot as any, props);
			const m = mount(body as any, { $n: 0 } as any);
			for (let i = 1; i <= 201; i++) {
				m.update(body as any, { $n: i } as any);
			}
			expect(
				warn.mock.calls.some((args) => String(args[0]).includes('Over 200 classes were generated')),
			).toBe(true);
			m.unmount();
		} finally {
			warn.mockRestore();
		}
	});
});
