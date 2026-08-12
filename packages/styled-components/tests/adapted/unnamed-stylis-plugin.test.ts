// Exact executable evidence for the documented unnamed-Stylis-plugin throw.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled, { StyleSheetManager } from '@octanejs/styled-components';
import { mount } from '../_helpers';

describe('StyleSheetManager / sheet', () => {
	it('throws error 15 for unnamed stylis plugins', () => {
		const Anon = styled.div`
			color: black;
		`;
		const anonymousPlugin = (
			() => () =>
				undefined
		)();
		Object.defineProperty(anonymousPlugin, 'name', { value: '' });
		expect(() =>
			mount(() =>
				createElement(StyleSheetManager as any, {
					stylisPlugins: [anonymousPlugin as any],
					children: createElement(Anon as any, {}),
				}),
			),
		).toThrow();
	});
});
