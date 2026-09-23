import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createElement, createRoot, flushSync, hydrateRoot, trustHTML } from 'octane';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture';

const source = readFileSync(
	join(process.cwd(), 'packages/octane/tests/_fixtures/trusted-html.tsx'),
	'utf8',
);
const suppressedSource = readFileSync(
	join(process.cwd(), 'packages/octane/tests/conformance/_fixtures/reconnecting-wave4c.tsrx'),
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
			flushSync(() => root.render(client.TrustedMarkup, { ...props }));
			expect(container.querySelector('b')).toBe(content);
			flushSync(() => root.render(client.TrustedMarkup, { html: '<i>updated</i>' }));
			expect(container.querySelector('section')).toBe(section);
			expect(section?.innerHTML).toBe('<i>updated</i>');
			const updated = section?.querySelector('i');
			flushSync(() => root.render(client.TrustedMarkup, { html: '<i>updated</i>' }));
			expect(section?.querySelector('i')).toBe(updated);
			flushSync(() => root.render(client.TrustedMarkup, { html: null }));
			expect(section?.innerHTML).toBe('');
			flushSync(() => root.render(client.TrustedMarkup, { ...props }));
			expect(section?.innerHTML).toBe(props.html);
		} finally {
			root.unmount();
		}
		const mounted = createRoot(container);
		try {
			mounted.render(client.TrustedMarkup, props);
			expect(container.querySelector('section')?.innerHTML).toBe('<b>trusted</b>');
			const mountedContent = container.querySelector('b');
			for (let i = 0; i < 2; i++) {
				flushSync(() => mounted.render(client.TrustedMarkup, { ...props }));
				expect(container.querySelector('b')).toBe(mountedContent);
			}
		} finally {
			mounted.unmount();
		}
	});

	it.each([false, true])('preserves parser-normalized HTML after hydration (dev: %s)', (dev) => {
		const options = { id: 'trusted-html.tsx', compileOptions: { dev, hmr: false } };
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const props = { html: '<b data-note="&amp;"/>' };
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.TrustedMarkup, props).html;
		const content = container.querySelector('b');
		const root = hydrateRoot(container, client.TrustedMarkup, props);
		try {
			flushSync(() => root.render(client.TrustedMarkup, { ...props }));
			expect(container.querySelector('b')).toBe(content);
			expect(content?.getAttribute('data-note')).toBe('&');
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])('updates retained hydration mismatches on render (dev: %s)', (dev) => {
		const options = { id: 'trusted-html.tsx', compileOptions: { dev, hmr: false } };
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const suppressedOptions = { ...options, id: 'reconnecting-wave4c.tsrx' };
		const suppressedClient = loadCompiledFixtureSource(suppressedSource, {
			...suppressedOptions,
			mode: 'client',
		});
		const suppressedServer = loadCompiledFixtureSource(suppressedSource, {
			...suppressedOptions,
			mode: 'server',
		});
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			for (const suppressHydrationWarning of [false, true]) {
				const container = document.createElement('div');
				const ServerComponent = suppressHydrationWarning
					? suppressedServer.SuppressedRawHtml
					: server.TrustedMarkup;
				container.innerHTML = renderToString(ServerComponent, { html: '<b>server</b>' }).html;
				const content = container.querySelector('b');
				const props = { html: '<i>client</i>', suppressHydrationWarning };
				const Component = suppressHydrationWarning
					? suppressedClient.SuppressedRawHtml
					: client.TrustedMarkup;
				const root = hydrateRoot(container, Component, props);
				try {
					expect(container.querySelector('b')).toBe(content);
					flushSync(() => root.render(Component, { ...props }));
					const updated = container.querySelector('i');
					expect(updated?.textContent).toBe('client');
					flushSync(() => root.render(Component, { ...props }));
					expect(container.querySelector('i')).toBe(updated);
				} finally {
					root.unmount();
				}
			}
		} finally {
			warning.mockRestore();
		}
	});

	it('reclaims empty raw HTML after ordinary children', () => {
		function Content(props: { html: string | null }) {
			return createElement(
				'section',
				{ dangerouslySetInnerHTML: props.html === null ? undefined : trustHTML(props.html) },
				props.html === null ? 'ordinary' : null,
			);
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		try {
			root.render(Content, { html: '' });
			const section = container.querySelector('section');
			flushSync(() => root.render(Content, { html: null }));
			expect(section?.textContent).toBe('ordinary');
			flushSync(() => root.render(Content, { html: '' }));
			expect(container.querySelector('section')).toBe(section);
			expect(section?.textContent).toBe('');
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])('preserves HTML when a suspended render is abandoned (dev: %s)', (dev) => {
		const client = loadCompiledFixtureSource(source, {
			id: 'trusted-html.tsx',
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});
		const pending = new Promise(() => {});
		const ready = () => 'ready';
		for (const html of ['<i>abandoned</i>', null]) {
			const container = document.createElement('div');
			const root = createRoot(container);
			const props = { html: '<b>retained</b>', read: ready };
			try {
				root.render(client.TrustedPending, props);
				const content = container.querySelector('b');
				expect(content?.textContent).toBe('retained');
				expect(container.querySelector('span')?.textContent).toBe('ready');
				flushSync(() =>
					root.render(client.TrustedPending, {
						html,
						read: () => {
							throw pending;
						},
					}),
				);
				expect(container.querySelector('b')).toBe(content);
				flushSync(() => root.render(client.TrustedPending, { ...props }));
				expect(container.querySelector('b')).toBe(content);
				flushSync(() => root.render(client.TrustedPending, { html, read: ready }));
				expect(container.querySelector('section')?.innerHTML).toBe(html ?? '');
			} finally {
				root.unmount();
			}
		}
	});
});
