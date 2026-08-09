import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { ServerProbe } from '../_fixtures/server.tsrx';

describe('@octanejs/gsap — SSR', () => {
	it('renders without evaluating the GSAP effect', () => {
		const onEffect = vi.fn();
		const { html } = renderToString(ServerProbe, { onEffect });

		expect(html).toContain('data-context-safe="function"');
		expect(html).toContain('server-safe');
		expect(onEffect).not.toHaveBeenCalled();
	});
});
