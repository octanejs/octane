// Theming parity: provider nesting and merge semantics, function themes,
// the theme error contracts (7/8/14/18), useTheme, ThemeConsumer, withTheme.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled, {
	ThemeConsumer,
	ThemeProvider,
	useTheme,
	withTheme,
} from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';
import { ThemedCard } from '../_fixtures/themed-card.tsrx';

describe('theming', () => {
	it('provides the theme, merges nested providers, and function themes see the outer theme', () => {
		const m = mount(ThemedCard as any);
		let cssText = getRenderedCSS();
		expect(cssText).toContain('color:black');
		expect(cssText).toContain('background:white');
		expect(cssText).toContain('border-color:rebeccapurple');

		m.click('#toggle-theme');
		cssText = getRenderedCSS();
		expect(cssText).toContain('color:white');
		expect(cssText).toContain('background:black');
		m.unmount();
	});

	it('lets a theme prop on the styled component override the provided theme', () => {
		const Note = styled.p`
			color: ${(p: any) => p.theme.tone};
		`;
		const m = mount(() =>
			createElement(ThemeProvider as any, {
				theme: { tone: 'gray' },
				children: createElement(Note as any, { id: 'n', theme: { tone: 'goldenrod' } }),
			}),
		);
		expect(getRenderedCSS()).toContain('color:goldenrod');
		m.unmount();
	});

	it('throws the documented errors for invalid themes', () => {
		const Child = styled.div``;
		const childEl = () => createElement(Child as any, {});

		// 14: falsy theme
		expect(() =>
			mount(() => createElement(ThemeProvider as any, { theme: null, children: childEl() })),
		).toThrow();

		// 8: non-object theme
		expect(() =>
			mount(() => createElement(ThemeProvider as any, { theme: [1, 2], children: childEl() })),
		).toThrow();

		// 7: function theme returning a non-object
		expect(() =>
			mount(() => createElement(ThemeProvider as any, { theme: () => null, children: childEl() })),
		).toThrow();
	});

	it('useTheme returns the provided theme and throws without a provider (error 18)', () => {
		let seen: any;
		function Reader() {
			seen = useTheme();
			return null;
		}
		const m = mount(() =>
			createElement(ThemeProvider as any, {
				theme: { flag: 'up' },
				children: createElement(Reader, {}),
			}),
		);
		expect(seen).toEqual({ flag: 'up' });
		m.unmount();

		function Orphan() {
			useTheme();
			return null;
		}
		expect(() => mount(() => createElement(Orphan, {}))).toThrow();
	});

	it('ThemeConsumer calls its function child with the current theme', () => {
		const m = mount(() =>
			createElement(ThemeProvider as any, {
				theme: { fg: 'salmon' },
				children: createElement(ThemeConsumer as any, {
					children: (theme: any) => createElement('div', { id: 'tc', 'data-fg': theme.fg }),
				}),
			}),
		);
		expect(m.find('#tc').getAttribute('data-fg')).toBe('salmon');
		m.unmount();
	});

	it('withTheme injects the theme as a prop, honoring component defaultProps as fallback', () => {
		let received: any;
		function Show(props: any) {
			received = props.theme;
			return createElement('div', { id: 'w' });
		}
		(Show as any).defaultProps = { theme: { source: 'default' } };
		const Wrapped = withTheme(Show as any);

		const m = mount(() => createElement(Wrapped as any, {}));
		expect(received).toEqual({ source: 'default' });
		m.unmount();

		const m2 = mount(() =>
			createElement(ThemeProvider as any, {
				theme: { source: 'provider' },
				children: createElement(Wrapped as any, {}),
			}),
		);
		expect(received).toEqual({ source: 'provider' });
		m2.unmount();
	});
});
