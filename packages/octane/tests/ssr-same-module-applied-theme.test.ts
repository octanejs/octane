import { describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
import * as ServerRuntime from 'octane/server';
import { App as ClientApp } from './_fixtures/style-imported-applied-theme.tsrx';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';

for (const dev of [false, true]) {
	const compileOptions = { dev, hmr: false };
	const base = loadServerFixture('packages/octane/tests/_fixtures/style-applied-theme-base.tsrx', {
		compileOptions,
	});
	const variants = [
		{
			name: 'no imports',
			app: loadServerFixture('packages/octane/tests/_fixtures/style-local-applied-theme.tsrx', {
				compileOptions,
			}),
		},
		{
			name: 'static base import',
			app: loadServerFixture('packages/octane/tests/_fixtures/style-imported-applied-theme.tsrx', {
				compileOptions,
				runtimeModules: { './style-applied-theme-base.tsrx': base },
			}),
		},
	];

	for (const { name, app } of variants) {
		describe(`server: applied theme beside its consumer (${name}, dev=${dev})`, () => {
			it('emits base rules before overrides for a captured $class', () => {
				const result = ServerRuntime.renderToString(app.App, { entry: false });
				expect(result.html).toContain('>Probe</div>');
				expect(result.css).toContain('color: red;');
				expect(result.css).toContain('color: blue;');
				expect(result.css.indexOf('color: red;')).toBeLessThan(result.css.indexOf('color: blue;'));
			});

			it('includes base CSS variables for a captured class entry', () => {
				const result = ServerRuntime.renderToString(app.App, { entry: true });
				expect(result.html).toMatch(/class="[^"]*card[^"]*"/);
				expect(result.css).toContain('color: var(--ink);');
				expect(result.css).toContain('--ink: green;');
			});
		});
	}

	describe(`server: applied theme collection across renders (dev=${dev})`, () => {
		const app = variants[1].app;
		function assertSheets(css: string) {
			expect(css).toContain('--ink: green;');
			expect(css).toContain('color: red;');
			expect(css).toContain('color: blue;');
			expect(css.indexOf('color: red;')).toBeLessThan(css.indexOf('color: blue;'));
			expect(css.match(/<style /g)).toHaveLength(2);
		}

		it('collects both sheets with the current nonce on each request', () => {
			for (const nonce of ['first', 'second']) {
				const { css } = ServerRuntime.renderToStaticMarkup(app.App, { entry: true }, { nonce });
				assertSheets(css);
				expect(css.match(new RegExp(`nonce="${nonce}"`, 'g'))).toHaveLength(2);
				expect(css).not.toContain(`nonce="${nonce === 'first' ? 'second' : 'first'}"`);
			}
			expect(ServerRuntime.renderToString(() => 'Plain').css).toBe('');
		});

		it('streams the applied base before its override', async () => {
			const stream = await ServerRuntime.renderToReadableStream(app.App, { entry: true });
			const output = await new Response(stream).text();
			assertSheets(output);
			expect(output).toContain('>Probe</div>');
		});

		it('preserves the ordered styles and server element during hydration', () => {
			const { html, css } = ServerRuntime.renderToString(app.App, { entry: false });
			assertSheets(css);
			const host = document.createElement('section');
			const sheets = document.createElement('div');
			sheets.innerHTML = css;
			const styleNodes = [...sheets.childNodes];
			document.head.append(...styleNodes);
			host.innerHTML = html;
			document.body.append(host);
			const element = host.querySelector('div')!;
			const errors: unknown[] = [];
			const root = hydrateRoot(
				host,
				ClientApp,
				{ entry: false },
				{
					onRecoverableError: (error) => errors.push(error),
				},
			);
			try {
				expect(host.querySelector('div')).toBe(element);
				expect(element.textContent).toBe('Probe');
				expect(errors).toEqual([]);
				for (const node of styleNodes) expect(node.parentNode).toBe(document.head);
			} finally {
				root.unmount();
				host.remove();
				for (const node of styleNodes) node.parentNode?.removeChild(node);
			}
		});

		it('collects a shared transitive dependency once and preserves explicit CSS and nonces', () => {
			const themes = loadCompiledFixtureSource(
				`import { base } from './base.tsrx';
				export const middle = <style apply={base}>div { --middle: 1; }</style>;
				export const theme = <style apply={[middle, base]}>.card { --theme: 1; }</style>;`,
				{
					id: `same-module-applied-chain-${dev}.tsrx`,
					mode: 'server',
					compileOptions,
					runtimeModules: { './base.tsrx': base },
				},
			);
			const card = themes.theme.card;
			const themeHash = card.split(' ')[0];
			const baseHash = base.base.$class;
			const { css } = ServerRuntime.renderToString(() => {
				ServerRuntime.injectStyle(baseHash, ':root { --ink: purple; }', 'base-nonce');
				ServerRuntime.injectStyle(themeHash, '.card { color: orange; }', 'theme-nonce');
				return ServerRuntime.createElement('div', { class: card }, 'Probe');
			});
			expect(css.match(/<style /g)).toHaveLength(3);
			expect(css).toContain('--ink: purple;');
			expect(css).not.toContain('--ink: green;');
			expect(css).toContain('--middle: 1;');
			expect(css).toContain('color: orange;');
			expect(css).not.toContain('--theme: 1;');
			expect(css.indexOf('--ink: purple;')).toBeLessThan(css.indexOf('--middle: 1;'));
			expect(css.indexOf('--middle: 1;')).toBeLessThan(css.indexOf('color: orange;'));
			expect(css).toContain(`data-octane="${baseHash}" nonce="base-nonce"`);
			expect(css).toContain(`data-octane="${themeHash}" nonce="theme-nonce"`);
		});
	});
}
