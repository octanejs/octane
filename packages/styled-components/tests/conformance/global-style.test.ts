// createGlobalStyle: mount injection, prop/theme-driven rewrites, unmount
// removal, multiple instances sharing one group, and the children dev-warning.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'octane';

import { createGlobalStyle, ThemeProvider } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('createGlobalStyle', () => {
	it('injects on mount and removes its rules on unmount', () => {
		const GS = createGlobalStyle`
      body { letter-spacing: 13px; }
    `;
		const m = mount(() => createElement(GS as any, {}));
		expect(getRenderedCSS()).toContain('letter-spacing:13px');
		m.unmount();
		expect(getRenderedCSS()).not.toContain('letter-spacing:13px');
	});

	it('rewrites rules when a dynamic prop changes', () => {
		const GS = createGlobalStyle<{ $bg: string }>`
      body { background: ${(p) => p.$bg}; }
    `;
		const body = (props: any) => createElement(GS as any, props);
		const m = mount(body as any, { $bg: 'aliceblue' } as any);
		expect(getRenderedCSS()).toContain('background:aliceblue');

		m.update(body as any, { $bg: 'honeydew' } as any);
		const cssText = getRenderedCSS();
		expect(cssText).toContain('background:honeydew');
		expect(cssText).not.toContain('background:aliceblue');
		m.unmount();
	});

	it('reads the theme from context', () => {
		const GS = createGlobalStyle`
      body { outline-color: ${(p: any) => p.theme.line}; }
    `;
		const m = mount(() =>
			createElement(ThemeProvider as any, {
				theme: { line: 'chartreuse' },
				children: createElement(GS as any, {}),
			}),
		);
		expect(getRenderedCSS()).toContain('outline-color:chartreuse');
		m.unmount();
	});

	it('keeps surviving instances when one of several unmounts', () => {
		const GS = createGlobalStyle`
      html { word-spacing: 17px; }
    `;
		const m1 = mount(() => createElement(GS as any, {}));
		const m2 = mount(() => createElement(GS as any, {}));
		m1.unmount();
		expect(getRenderedCSS()).toContain('word-spacing:17px');
		m2.unmount();
		expect(getRenderedCSS()).not.toContain('word-spacing:17px');
	});

	it('warns in dev when given children', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const GS = createGlobalStyle`
        body { color: black; }
      `;
			const m = mount(() => createElement(GS as any, { children: createElement('div', {}) }));
			expect(warn.mock.calls.some((args) => String(args[0]).includes('createGlobalStyle'))).toBe(
				true,
			);
			m.unmount();
		} finally {
			warn.mockRestore();
		}
	});
});
