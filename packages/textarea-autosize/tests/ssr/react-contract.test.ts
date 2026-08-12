import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import OctaneTextareaAutosize from '../../src/index.tsrx';
import ReactTextareaAutosize from '../../upstream/src/index.tsx';

const style = {
	boxSizing: 'border-box' as const,
	fontSize: '16px',
	height: 55,
	lineHeight: '20px',
	width: '120px',
};

// Octane SSR terminates every style declaration with `;`; React omits the final one.
function normalizeServerMarkup(html: string): string {
	return html.replace(/style="([^"]*)"/g, function (_match, css: string) {
		return 'style="' + css.replace(/;+$/, '') + '"';
	});
}

describe('@octanejs/textarea-autosize SSR React contract', () => {
	// @parity-case ssr:react-contract
	it('matches the pristine React server-visible contract', () => {
		const props = {
			'aria-describedby': 'message-help',
			defaultValue: 'hello',
			name: 'message',
			placeholder: 'Write something',
			rows: 3,
			style,
		};
		const octane = renderToString(OctaneTextareaAutosize, props).html;
		const react = renderToStaticMarkup(createElement(ReactTextareaAutosize, props));

		expect(normalizeServerMarkup(octane)).toBe(normalizeServerMarkup(react));
	});
});
