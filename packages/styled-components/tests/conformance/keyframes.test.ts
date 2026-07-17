// Keyframes: hashed animation names, lazy inject-on-use, the error-12
// untagged-interpolation guard, and per-stylis-config name variants.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled, { keyframes, StyleSheetManager } from '@octanejs/styled-components';
import { getRenderedCSS, mount } from '../_helpers';

describe('keyframes', () => {
	it('injects @keyframes on first use and references the hashed name', () => {
		const fade = keyframes`
      from { opacity: 0; }
      to { opacity: 1; }
    `;
		// Lazy: nothing is injected until a styled component uses it.
		expect(getRenderedCSS()).not.toContain('@keyframes ' + (fade as any).getName());

		const Fader = styled.div`
			animation: ${fade} 1s linear;
		`;
		const m = mount(() => createElement(Fader as any, { id: 'kf' }));
		const cssText = getRenderedCSS();
		const name = (fade as any).getName();
		expect(cssText).toContain(`@keyframes ${name}`);
		expect(cssText).toContain(`animation:${name} 1s linear`);
		m.unmount();
	});

	it('throws error 12 when interpolated into an untagged template string', () => {
		const spin = keyframes`
      from { transform: rotate(0deg); }
    `;
		expect(() => `animation: ${spin} 1s;`).toThrow(/css/);
	});

	it('emits a distinct name per stylis configuration (namespace variant)', () => {
		const pulse = keyframes`
      50% { opacity: 0.5; }
    `;
		const Base = styled.i`
			animation-name: ${pulse};
		`;
		const m = mount(() =>
			createElement('div', {
				children: [
					createElement(Base as any, { id: 'k1', key: '1' }),
					createElement(StyleSheetManager as any, {
						key: '2',
						namespace: '#ns',
						children: createElement(Base as any, { id: 'k2' }),
					}),
				],
			}),
		);
		const cssText = getRenderedCSS();
		const plainName = (pulse as any).getName();
		expect(cssText).toContain(`@keyframes ${plainName}`);
		// The namespaced stylis instance has a non-empty hash → distinct name.
		const matches = cssText.match(/@keyframes ([\w-]+)/g) ?? [];
		expect(new Set(matches).size).toBeGreaterThanOrEqual(2);
		m.unmount();
	});
});
