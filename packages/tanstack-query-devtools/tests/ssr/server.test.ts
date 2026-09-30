import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { ServerDevtools } from '../_fixtures/server.tsrx';

const { mount } = vi.hoisted(() => ({ mount: vi.fn() }));

vi.mock('@tanstack/query-devtools', () => ({
	TanstackQueryDevtools: class {
		mount = mount;
	},
	TanstackQueryDevtoolsPanel: class {
		mount = mount;
	},
}));

describe('@octanejs/tanstack-query-devtools SSR', () => {
	// @parity-case conformance:tanstack-query-devtools-renders-only-the-parent-containers-on-the-server-and-never-mounts-the-core
	it('renders only the parent containers on the server and never mounts the core', () => {
		expect(typeof document).toBe('undefined');

		const { html } = renderToStaticMarkup(ServerDevtools);

		expect(html).toContain('class="tsqd-parent-container"');
		expect(html).toContain('dir="ltr"');
		expect(html).toContain('height:200px');
		expect(html.match(/tsqd-parent-container/g)).toHaveLength(2);
		expect(mount).not.toHaveBeenCalled();
	});
});
