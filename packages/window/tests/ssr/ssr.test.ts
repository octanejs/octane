import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { ReactWindowServerFixture } from './_fixtures/server';

describe('@octanejs/window server rendering', () => {
	it('uses default dimensions without accessing browser layout APIs', () => {
		expect(typeof document).toBe('undefined');
		expect(typeof ResizeObserver).toBe('undefined');

		const { html, css } = renderToString(ReactWindowServerFixture);

		expect(html).toContain('id="react-window-server"');
		expect(html).toContain('data-testid="server-list"');
		expect(html.match(/data-row="/g)).toHaveLength(8);
		expect(html).toContain('data-row="0"');
		expect(html).toContain('data-row="7"');
		expect(html).toContain('data-testid="server-grid"');
		expect(html.match(/data-cell="/g)).toHaveLength(25);
		expect(html).toContain('data-cell="0:0"');
		expect(html).toContain('data-cell="4:4"');
		expect(css).toBe('');
	});
});
