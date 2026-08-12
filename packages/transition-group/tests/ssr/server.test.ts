import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerGroup, ServerTransition } from '../_fixtures/server.tsrx';

describe('react-transition-group v4.4.5 server rendering', () => {
	// @parity-case ssr:transition-initial-state
	it('renders the initial transition state without running effects', () => {
		expect(renderToString(ServerTransition).html).toContain('id="server-state">entered</span>');
	});

	// @parity-case ssr:transition-group-wrapper
	it('renders TransitionGroup wrapper and children', () => {
		const html = renderToString(ServerGroup).html;
		expect(html).toContain('<section id="server-group">');
		expect(html).toContain('id="server-child">child</span>');
	});
});
