/**
 * SSR Empty divergence with a React oracle. Lives in cmdk-ssr so Octane
 * components compile under `octane({ ssr: true })`; the React half uses the
 * published cmdk package directly.
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString as reactRenderToString } from 'react-dom/server';
import { Command as ReactCommand } from 'cmdk';
import { renderToString as octaneRenderToString } from 'octane/server';
import { BasicMenu } from '../_fixtures/basic.tsrx';

describe('differential: @octanejs/cmdk vs cmdk@1.1.1 SSR', function () {
	// @parity-case differential:cmdk-ssr-empty
	it('documents Empty suppression in server markup', function () {
		const { html: octaneHtml } = octaneRenderToString(BasicMenu);

		const reactHtml = reactRenderToString(
			React.createElement(
				ReactCommand,
				{ label: 'Command Menu' },
				React.createElement(ReactCommand.Input, { placeholder: 'Search…' }),
				React.createElement(
					ReactCommand.List,
					null,
					React.createElement(ReactCommand.Empty, null, 'No results found.'),
					React.createElement(ReactCommand.Item, null, 'Apple'),
					React.createElement(ReactCommand.Item, null, 'Banana'),
					React.createElement(ReactCommand.Item, null, 'Cherry'),
				),
			),
		);

		// OCTANE DIVERGENCE[ssr-empty-suppressed][differential:cmdk-ssr-empty]
		// Upstream Empty keys only off filtered.count (0 during SSR), so React
		// ships cmdk-empty above items. Octane's server snapshot suppresses it.
		expect(reactHtml).toContain('cmdk-item');
		expect(reactHtml).toContain('cmdk-empty');
		expect(octaneHtml).toContain('cmdk-item');
		expect(octaneHtml).not.toContain('cmdk-empty');
	});
});
