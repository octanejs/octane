// Factory API framework contracts: withConfig ids, displayName generation,
// static hoisting, and the too-many-classes dev warning. Documented brand and
// defaultProps adaptations live in tests/adapted/api-divergences.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';

import styled from '@octanejs/styled-components';
import { mount } from '../_helpers';

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
