import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import {
	BaseClosedDialogFixture,
	BaseEdgeSliderFixture,
	BaseHydrationFixture,
} from './_fixtures/server.tsx';

describe('@octanejs/base-ui server rendering', () => {
	it('uses the server hydration snapshot and renders accessible primitives without a DOM', () => {
		expect(typeof document).toBe('undefined');
		const { html, css } = renderToString(BaseHydrationFixture);

		expect(html).toContain('id="base-ui-server"');
		expect(html).toContain('id="base-ui-render-phase">server</output>');
		expect(html).toContain('id="base-ui-server-separator"');
		expect(html).toContain('aria-orientation="vertical"');
		expect(css).toBe('');
	});

	it('hides layout-dependent edge-aligned slider parts before hydration', () => {
		const { html } = renderToString(BaseEdgeSliderFixture);

		expect(html).toContain('id="base-ui-edge-slider"');
		expect(html).toContain('id="base-ui-edge-control"');
		expect(html).toContain('id="base-ui-edge-indicator"');
		expect(html).toContain('id="base-ui-edge-thumb"');
		const indicator = html.match(/<[^>]*\bid="base-ui-edge-indicator"[^>]*>/)?.[0];
		const thumb = html.match(/<[^>]*\bid="base-ui-edge-thumb"[^>]*>/)?.[0];
		expect(indicator).toMatch(/style="[^"]*visibility:\s*hidden/);
		expect(thumb).toMatch(/style="[^"]*visibility:\s*hidden/);
	});

	it('renders closed dialog triggers without server-side portal or document access', () => {
		const { html } = renderToString(BaseClosedDialogFixture);

		expect(html).toContain('id="base-ui-server-dialog-trigger"');
		expect(html).toContain('Open dialog');
		expect(html).not.toContain('role="dialog"');
	});
});
