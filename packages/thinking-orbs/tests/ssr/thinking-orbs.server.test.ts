import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { ThinkingOrb } from '../../src/index';

describe('@octanejs/thinking-orbs SSR', () => {
	// @parity-case differential:thinking-orbs-ssr
	it('renders a deterministic accessible canvas shell without browser globals', () => {
		const props = {
			state: 'breathing' as const,
			size: 20 as const,
			theme: 'auto' as const,
			'data-orb': 'server',
		};
		const first = renderToString(ThinkingOrb, props).html;
		const second = renderToString(ThinkingOrb, props).html;
		expect(first).toBe(second);
		expect(first).toContain('<canvas');
		expect(first).toContain('role="img"');
		expect(first).toContain('aria-label="Thinking…"');
		expect(first).toContain('data-orb="server"');
		expect(first).toContain('width:20px');
	});
});
