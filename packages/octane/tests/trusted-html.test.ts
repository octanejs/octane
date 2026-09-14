import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, hydrateRoot, trustHTML } from 'octane';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture';

const source = readFileSync(
	join(process.cwd(), 'packages/octane/tests/_fixtures/trusted-html.tsx'),
	'utf8',
);

describe('explicitly trusted HTML', () => {
	it('preserves the supplied markup without claiming to sanitize it', () => {
		const markup = '<b data-note="<raw>">trusted &amp; reviewed</b>';
		expect(trustHTML(markup).__html).toBe(markup);
	});

	it.each([false, true])('renders, hydrates, updates, and clears HTML (dev: %s)', (dev) => {
		const compileOptions = { dev, hmr: false };
		const client = loadCompiledFixtureSource(source, {
			id: 'trusted-html.tsx',
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(source, {
			id: 'trusted-html.tsx',
			mode: 'server',
			compileOptions,
		});
		const container = document.createElement('div');
		const props = { html: '<b>trusted</b>' };
		container.innerHTML = renderToString(server.TrustedMarkup, props).html;
		const section = container.querySelector('section');
		const content = container.querySelector('b');
		expect(content?.textContent).toBe('trusted');
		const root = hydrateRoot(container, client.TrustedMarkup, props);
		try {
			expect(container.querySelector('section')).toBe(section);
			expect(container.querySelector('b')).toBe(content);
			flushSync(() => root.render(client.TrustedMarkup, { html: '<i>updated</i>' }));
			expect(container.querySelector('section')).toBe(section);
			expect(section?.innerHTML).toBe('<i>updated</i>');
			flushSync(() => root.render(client.TrustedMarkup, { html: null }));
			expect(section?.innerHTML).toBe('');
		} finally {
			root.unmount();
		}
		const mounted = createRoot(container);
		try {
			mounted.render(client.TrustedMarkup, props);
			expect(container.querySelector('section')?.innerHTML).toBe('<b>trusted</b>');
		} finally {
			mounted.unmount();
		}
	});
});
