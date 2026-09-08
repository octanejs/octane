/** @jsxImportSource octane */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'octane';
import * as BaseUI from '@octanejs/base-ui';
import { useMediaQuery as useSubpathMediaQuery } from '@octanejs/base-ui/unstable-use-media-query';
import { mount } from '../../octane/tests/_helpers';

function RootMediaQuery() {
	const matches = BaseUI.useMediaQuery('(min-width: 600px)');
	return createElement('output', null, matches ? 'matches' : 'no match');
}

function SubpathMediaQuery() {
	const matches = useSubpathMediaQuery('(min-width: 600px)');
	return createElement('output', null, matches ? 'matches' : 'no match');
}

afterEach(() => vi.unstubAllGlobals());

describe.each([
	['root', RootMediaQuery],
	['subpath', SubpathMediaQuery],
] as const)('useMediaQuery through the %s entry', (_entry, Component) => {
	it('accepts an omitted options argument when matchMedia is unavailable', () => {
		vi.stubGlobal('matchMedia', undefined);
		const result = mount(Component);
		try {
			expect(result.find('output').textContent).toBe('no match');
		} finally {
			result.unmount();
		}
	});

	it('observes media-query changes with the default options', () => {
		let matches = true;
		const mediaQuery = new EventTarget();
		Object.defineProperty(mediaQuery, 'matches', { get: () => matches });
		vi.stubGlobal('matchMedia', () => mediaQuery);
		const result = mount(Component);
		try {
			expect(result.find('output').textContent).toBe('matches');
			act(() => {
				matches = false;
				mediaQuery.dispatchEvent(new Event('change'));
			});
			expect(result.find('output').textContent).toBe('no match');
		} finally {
			result.unmount();
		}
	});
});
