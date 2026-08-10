// Exact executable evidence for documented factory-API adaptations.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled, { isStyledComponent, withTheme } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('factory API', () => {
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
});
