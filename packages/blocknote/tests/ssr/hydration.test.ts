import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { afterEach, expect, it, vi } from 'vitest';

import { nextPaint } from '../../../octane/tests/_helpers';
import { DescriptorSsrEditor, SsrEditor } from '../_fixtures/ssr-editor.tsrx';
// @ts-expect-error the shared fixture plugin compiles this module for the server
import * as serverFixtures from '../_fixtures/ssr-editor.tsrx?octane-ssr';

function preferDark(): void {
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		value: (query: string) => ({
			matches: query === '(prefers-color-scheme: dark)',
			media: query,
			addEventListener() {},
			removeEventListener() {},
		}),
	});
}

afterEach(() => {
	Reflect.deleteProperty(window, 'matchMedia');
});

it.each([
	['direct view', SsrEditor, serverFixtures.SsrEditor],
	['descriptor shell', DescriptorSsrEditor, serverFixtures.DescriptorSsrEditor],
] as const)(
	'%s hydrates the server shell, then applies the system scheme and mounts the editor',
	async (_name, ClientFixture, ServerFixture) => {
		preferDark();
		const props = { text: 'Hydrated text' };
		const { html } = renderToString(ServerFixture, props);
		expect(html).toContain('bn-container light');

		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const shell = container.querySelector('.bn-container');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, ClientFixture, props);
		try {
			await nextPaint();
			flushSync(() => {});

			// The server node is adopted, not replaced, and hydration reports no mismatch.
			expect(container.querySelector('.bn-container')).toBe(shell);
			expect(errors).not.toHaveBeenCalled();

			// After hydration the live media query wins and the editor is mounted.
			expect(shell?.className).toBe('bn-root bn-container dark');
			expect(shell?.getAttribute('data-color-scheme')).toBe('dark');
			expect(container.querySelector('.bn-editor')?.textContent).toContain('Hydrated text');
		} finally {
			root.unmount();
			errors.mockRestore();
			container.remove();
		}
	},
);
