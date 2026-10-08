import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { QueryClient, QueryClientProvider } from '@octanejs/tanstack-query';

// The real @tanstack/query-devtools core is a Solid UI; a recording fake lets these
// tests exercise the Octane binding's own lifecycle deterministically.
const { instances, panels } = vi.hoisted(() => ({
	instances: [] as Array<Record<string, any>>,
	panels: [] as Array<Record<string, any>>,
}));

vi.mock('@tanstack/query-devtools', () => {
	const make = (registry: Array<Record<string, any>>) =>
		class {
			options: Record<string, any>;
			mount = vi.fn();
			unmount = vi.fn();
			setClient = vi.fn();
			setButtonPosition = vi.fn();
			setPosition = vi.fn();
			setInitialIsOpen = vi.fn();
			setErrorTypes = vi.fn();
			setTheme = vi.fn();
			setOnClose = vi.fn();
			constructor(options: Record<string, any>) {
				this.options = options;
				registry.push(this as unknown as Record<string, any>);
			}
		};
	return {
		TanstackQueryDevtools: make(instances),
		TanstackQueryDevtoolsPanel: make(panels),
	};
});

import { ReactQueryDevtools, ReactQueryDevtoolsPanel } from '../../src/production';

describe('@octanejs/tanstack-query-devtools', () => {
	let client: QueryClient;

	beforeEach(() => {
		instances.length = 0;
		panels.length = 0;
		client = new QueryClient();
	});

	// @parity-case conformance:tanstack-query-devtools-renders-the-parent-container-the-core-mounts-into
	it('renders the parent container the core mounts into', () => {
		const { container } = render(createElement(ReactQueryDevtools, { client }));
		const parent = container.querySelector('.tsqd-parent-container');

		expect(parent).not.toBeNull();
		expect(parent?.getAttribute('dir')).toBe('ltr');
		expect(instances).toHaveLength(1);
		expect(instances[0]!.mount).toHaveBeenCalledWith(parent);
	});

	// @parity-case conformance:tanstack-query-devtools-constructs-the-core-once-across-re-renders-and-updates-it-in-place
	it('constructs the core once across re-renders and updates it in place', () => {
		const { rerender } = render(createElement(ReactQueryDevtools, { client, theme: 'light' }));
		rerender(createElement(ReactQueryDevtools, { client, theme: 'dark' }));
		rerender(createElement(ReactQueryDevtools, { client, theme: 'system' }));

		expect(instances).toHaveLength(1);
		expect(instances[0]!.setTheme).toHaveBeenLastCalledWith('system');
		expect(instances[0]!.mount).toHaveBeenCalledTimes(1);
		expect(instances[0]!.unmount).not.toHaveBeenCalled();
	});

	// @parity-case conformance:tanstack-query-devtools-passes-the-react-query-flavor-and-version-to-the-core
	it('passes the React Query flavor and version to the core', () => {
		render(createElement(ReactQueryDevtools, { client }));

		expect(instances[0]!.options).toMatchObject({
			client,
			queryFlavor: 'React Query',
			version: '5',
		});
	});

	// @parity-case conformance:tanstack-query-devtools-resolves-the-client-from-queryclientprovider-context
	it('resolves the client from QueryClientProvider context', () => {
		render(
			createElement(QueryClientProvider, {
				client,
				children: createElement(ReactQueryDevtools, {}),
			}),
		);

		expect(instances[0]!.setClient).toHaveBeenCalledWith(client);
	});

	// @parity-case conformance:tanstack-query-devtools-unmounts-the-core-when-the-component-unmounts
	it('unmounts the core when the component unmounts', () => {
		const { unmount } = render(createElement(ReactQueryDevtools, { client }));
		unmount();

		expect(instances[0]!.unmount).toHaveBeenCalledTimes(1);
	});

	describe('ReactQueryDevtoolsPanel', () => {
		// @parity-case conformance:tanstack-query-devtools-defaults-to-a-500px-tall-container-and-merges-the-style-prop-over-it
		it('defaults to a 500px tall container and merges the style prop over it', () => {
			const first = render(createElement(ReactQueryDevtoolsPanel, { client }));
			expect(
				(first.container.querySelector('.tsqd-parent-container') as HTMLElement).style.height,
			).toBe('500px');
			first.unmount();

			const second = render(
				createElement(ReactQueryDevtoolsPanel, { client, style: { height: '100%', width: '50%' } }),
			);
			const parent = second.container.querySelector('.tsqd-parent-container') as HTMLElement;
			expect(parent.style.height).toBe('100%');
			expect(parent.style.width).toBe('50%');
		});

		// @parity-case conformance:tanstack-query-devtools-opens-the-panel-initially-and-mounts-into-its-container
		it('opens the panel initially and mounts into its container', () => {
			const { container } = render(createElement(ReactQueryDevtoolsPanel, { client }));

			expect(panels[0]!.options).toMatchObject({
				initialIsOpen: true,
				buttonPosition: 'bottom-left',
				position: 'bottom',
			});
			expect(panels[0]!.mount).toHaveBeenCalledWith(
				container.querySelector('.tsqd-parent-container'),
			);
		});

		// @parity-case conformance:tanstack-query-devtools-keeps-the-core-in-sync-with-a-changed-onclose-callback
		it('keeps the core in sync with a changed onClose callback', () => {
			const first = vi.fn();
			const second = vi.fn();
			const { rerender } = render(
				createElement(ReactQueryDevtoolsPanel, { client, onClose: first }),
			);
			rerender(createElement(ReactQueryDevtoolsPanel, { client, onClose: second }));

			expect(panels).toHaveLength(1);
			expect(panels[0]!.setOnClose).toHaveBeenLastCalledWith(second);
		});
	});
});
