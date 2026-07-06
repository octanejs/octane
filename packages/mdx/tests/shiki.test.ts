/**
 * Syntax highlighting via `@shikijs/rehype` through the pipeline's
 * `rehypePlugins` hook — the documented recipe (see README). Shiki is a
 * devDependency ONLY: nothing in @octanejs/mdx bundles or depends on it; its
 * hast output simply serializes through the same @mdx-js/mdx → octane
 * pipeline as any other rehype transform. Highlighting is async, so the
 * async `compileMdx` is required (the vite plugin's transform already is).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import rehypeShiki from '@shikijs/rehype';
import * as Octane from 'octane';
import * as ServerRT from 'octane/server';
import * as Provider from '@octanejs/mdx';
import * as ServerProvider from '@octanejs/mdx/server';
import { compileMdx, type CompileMdxOptions } from '@octanejs/mdx/compile';
import { evalModuleCode, stripMarkers } from './_helpers';

const SOURCE = '# Code\n\n```js\nconst x = 1;\n```\n';
const OPTIONS: Pick<CompileMdxOptions, 'rehypePlugins'> = {
	rehypePlugins: [[rehypeShiki, { theme: 'github-light' }]],
};

async function modules() {
	const client = await compileMdx(SOURCE, '/docs/shiki.mdx', { mode: 'client', ...OPTIONS });
	const server = await compileMdx(SOURCE, '/docs/shiki.mdx', { mode: 'server', ...OPTIONS });
	return {
		client: evalModuleCode(client.code, { octane: Octane, '@octanejs/mdx': Provider }),
		server: evalModuleCode(server.code, {
			'octane/server': ServerRT,
			'@octanejs/mdx/server': ServerProvider,
		}),
	};
}

describe('shiki (optional, via rehypePlugins)', () => {
	// The first highlight pays shiki's engine cold-start (oniguruma WASM +
	// grammar/theme load; singleton-cached after), which can exceed the default
	// 5s test timeout on slow CI runners — warm it outside any test's budget.
	beforeAll(async () => {
		await modules();
	}, 60_000);

	it('renders highlighted tokens on the client', async () => {
		const { client } = await modules();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = Octane.createRoot(container);
		root.render(client.default, {});
		Octane.flushSync(() => {});
		const pre = container.querySelector('pre.shiki') as HTMLElement;
		expect(pre).not.toBeNull();
		expect(pre.className).toContain('github-light');
		// Tokenized output: the code line is span-per-token, not plain text.
		const tokens = [...pre.querySelectorAll('code span span')];
		expect(tokens.length).toBeGreaterThan(1);
		expect(pre.textContent).toContain('const x = 1;');
		root.unmount();
		container.remove();
	});

	it('serializes the same highlighted payload on the server (SSR/client parity)', async () => {
		const { client, server } = await modules();
		const { html } = ServerRT.renderToString(server.default, {});
		expect(stripMarkers(html)).toContain('<pre class="shiki github-light"');

		// The raw SSR string and a live DOM serialize attributes differently
		// (`style="color:#fff"` vs `rgb(...)`, attr-name case) — parse the server
		// payload through the DOM, and round-trip its style attributes through
		// CSSOM (the client runtime sets styles via CSSOM, which normalizes on
		// serialization), so both sides compare in the SAME normal form.
		const parsed = document.createElement('div');
		parsed.innerHTML = stripMarkers(html);
		for (const el of parsed.querySelectorAll('[style]')) {
			(el as HTMLElement).style.cssText = el.getAttribute('style')!;
		}

		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = Octane.createRoot(container);
		root.render(client.default, {});
		Octane.flushSync(() => {});
		expect(stripMarkers(container.innerHTML)).toBe(parsed.innerHTML);
		root.unmount();
		container.remove();
	});

	it('hydrates the server-rendered highlighted document', async () => {
		const { client, server } = await modules();
		const { html } = ServerRT.renderToString(server.default, {});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const beforeHydrate = container.innerHTML; // DOM-normalized server payload
		const pre = container.querySelector('pre.shiki');

		const root = Octane.hydrateRoot(container, client.default, {});
		Octane.flushSync(() => {});
		// Hydration changed nothing, and the highlighted tree was adopted.
		expect(container.innerHTML).toBe(beforeHydrate);
		expect(container.querySelector('pre.shiki')).toBe(pre);
		root.unmount();
		container.remove();
	});
});
