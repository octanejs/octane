// Interpolation resolution parity with upstream styled-components v6: prop
// functions, arrays, nested css`` blocks, object styles (camelCase→kebab,
// unitless px handling), falsy dropout, and `&` self-reference.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled, { css } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('interpolations', () => {
	it('resolves prop functions with the execution context', () => {
		const Box = styled.div<{ $w: number }>`
			width: ${(props) => props.$w}px;
		`;
		const m = mount(() => createElement(Box as any, { id: 'w', $w: 120 }));
		expect(getRenderedCSS()).toContain('width:120px');
		m.unmount();
	});

	it('flattens arrays and nested css`` blocks', () => {
		const mixin = css`
			letter-spacing: 11px;
			${['text-transform:uppercase;', 'word-break:break-all;']}
		`;
		const Fancy = styled.p`
			color: tomato;
			${mixin}
		`;
		const m = mount(() => createElement(Fancy as any, { id: 'f' }));
		const cssText = getRenderedCSS();
		expect(cssText).toContain('color:tomato');
		expect(cssText).toContain('letter-spacing:11px');
		expect(cssText).toContain('text-transform:uppercase');
		expect(cssText).toContain('word-break:break-all');
		m.unmount();
	});

	it('supports object styles with camelCase keys, px auto-append and unitless properties', () => {
		const ObjStyled = styled.section({
			backgroundColor: 'papayawhip',
			marginTop: 12,
			lineHeight: 3,
			zIndex: 7,
		});
		const m = mount(() => createElement(ObjStyled as any, { id: 'o' }));
		const cssText = getRenderedCSS();
		expect(cssText).toContain('background-color:papayawhip');
		expect(cssText).toContain('margin-top:12px');
		expect(cssText).toContain('line-height:3');
		expect(cssText).not.toContain('line-height:3px');
		expect(cssText).toContain('z-index:7');
		m.unmount();
	});

	it('drops falsy interpolation results without emitting text', () => {
		const Maybe = styled.div<{ $on?: boolean }>`
			color: olive;
			${(props) => props.$on && 'border:1px solid olive;'}
		`;
		const m = mount(() => createElement(Maybe as any, { id: 'm' }));
		const cssText = getRenderedCSS();
		expect(cssText).toContain('color:olive');
		expect(cssText).not.toContain('undefined');
		expect(cssText).not.toContain('false');
		expect(cssText).not.toContain('border:1px solid olive');
		m.unmount();
	});

	it('resolves `&` to the generated class for self-referencing selectors', () => {
		const Hoverable = styled.a`
			color: teal;
			&:hover {
				color: darkslategray;
			}
		`;
		const m = mount(() => createElement(Hoverable as any, { id: 'h' }));
		const el = m.find('#h');
		const generated = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).pop()!;
		expect(getRenderedCSS()).toContain(`.${generated}:hover{color:darkslategray;}`);
		m.unmount();
	});

	it('supports nested selectors from object styles', () => {
		const Nested = styled.nav({
			color: 'peru',
			span: { color: 'sienna' },
		});
		const m = mount(() => createElement(Nested as any, { id: 'n' }));
		const cssText = getRenderedCSS();
		expect(cssText).toContain('color:peru');
		expect(cssText).toContain('span{color:sienna;}');
		m.unmount();
	});
});
