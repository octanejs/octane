import { describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
import * as ServerRuntime from 'octane/server';
import { prerender } from 'octane/static';
import { CapturedTheme } from './_fixtures/style-captured-theme.tsrx';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';

const compileOptions = { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' };
const themes = loadServerFixture('packages/octane/tests/_fixtures/style-theme.tsrx', {
	compileOptions,
});
const app = loadServerFixture('packages/octane/tests/_fixtures/style-captured-theme.tsrx', {
	compileOptions,
	runtimeModules: { './style-theme.tsrx': themes },
});

function assertTheme(css: string) {
	expect(css).toContain('font-family: system-ui;');
	expect(css).toContain('color: rgb(0, 128, 0);');
	expect(css.indexOf('font-family: system-ui;')).toBeLessThan(
		css.indexOf('color: rgb(0, 128, 0);'),
	);
}

describe('server: captured theme classes retain their CSS', () => {
	it.each(['destructured', 'direct', 'entry'] as const)(
		'%s includes styles on repeated requests',
		(kind) => {
			for (const nonce of ['first', 'second']) {
				const { html, css } = ServerRuntime.renderToString(app.CapturedTheme, { kind }, { nonce });
				expect(html).toMatch(/<div class="tsrx-[^"]+">Probe<\/div>/);
				assertTheme(css);
				expect(css).toContain(`nonce="${nonce}"`);
				expect(css).not.toContain(`nonce="${nonce === 'first' ? 'second' : 'first'}"`);
			}
		},
	);

	it('retains styles for a class cached during an earlier request', () => {
		assertTheme(ServerRuntime.renderToString(app.CachedTheme).css);
		assertTheme(ServerRuntime.renderToString(app.CachedTheme).css);
	});

	it('collects captured classes in static and buffered async rendering', async () => {
		assertTheme(ServerRuntime.renderToStaticMarkup(app.CapturedTheme, { kind: 'direct' }).css);
		assertTheme((await prerender(app.CapturedTheme, { kind: 'direct' })).css);
	});

	it('collects captured classes in streaming rendering', async () => {
		const stream = await ServerRuntime.renderToReadableStream(app.CapturedTheme, {
			kind: 'direct',
		});
		const output = await new Response(stream).text();
		assertTheme(output);
		expect(output).toContain('Probe</div>');
	});

	it('keeps unrelated requests free of registered theme CSS', () => {
		const { css } = ServerRuntime.renderToString(() =>
			ServerRuntime.createElement('div', null, 'Plain'),
		);
		expect(css).toBe('');
	});

	it('uses complete class tokens from className and composed class values', () => {
		const value = themes.theme.dark;
		const hash = value.split(' ')[0];
		const render = (className: unknown) =>
			ServerRuntime.renderToString(() => ServerRuntime.createElement('div', { className }));
		assertTheme(render(['prefix', { [value]: true }, 'suffix']).css);
		expect(render(`prefix-${hash} ${hash}-suffix`).css).toBe('');
		assertTheme(render(`ordinary\t${value}\nother`).css);
		expect(render(`ordinary\u00a0${hash}`).css).toBe('');
	});

	it('collects a captured body-less bundle in dependency order without duplicate sheets', () => {
		const bundle = loadCompiledFixtureSource(
			`import { base, theme } from './theme.tsrx';
			export const bundle = <style apply={[theme, base]} />;`,
			{
				id: 'captured-bundle.tsrx',
				mode: 'server',
				compileOptions,
				runtimeModules: { './theme.tsrx': themes },
			},
		);
		const value = bundle.bundle.$class;
		const { css } = ServerRuntime.renderToString(() =>
			ServerRuntime.createElement('div', { className: [value, value] }),
		);
		assertTheme(css);
		expect([...css.matchAll(/<style data-octane=/g)]).toHaveLength(2);
	});

	it('restores collectors after errors and nested requests', () => {
		const captured = themes.theme.dark;
		expect(() =>
			ServerRuntime.renderToString(() => {
				ServerRuntime.ssrAttr('class', captured);
				throw new Error('failed render');
			}),
		).toThrow('failed render');
		const { css } = ServerRuntime.renderToString(() => {
			assertTheme(ServerRuntime.renderToString(app.CapturedTheme, { kind: 'direct' }).css);
			return ServerRuntime.createElement('div', null, 'Outer');
		});
		expect(css).toBe('');
		assertTheme(ServerRuntime.renderToString(app.CapturedTheme, { kind: 'direct' }).css);
	});

	it('keeps concurrent suspended renders and aborts request-local', async () => {
		const asyncApp = loadCompiledFixtureSource(
			`import { use } from 'octane';
			import { theme } from './theme.tsrx';
			const cls = theme.$class;
			export function Async({ value }) @{
				const text = use(value);
				<div class={cls}>{text as string}</div>
			}`,
			{
				id: 'captured-async.tsrx',
				mode: 'server',
				compileOptions,
				runtimeModules: { './theme.tsrx': themes },
			},
		);
		const first = Promise.withResolvers<string>();
		const second = Promise.withResolvers<string>();
		const controller = new AbortController();
		const aborted = prerender(
			asyncApp.Async,
			{ value: new Promise(() => {}) },
			{ signal: controller.signal },
		);
		const abortAssertion = expect(aborted).rejects.toThrow('cancelled');
		const a = prerender(asyncApp.Async, { value: first.promise }, { nonce: 'alpha' });
		const b = prerender(asyncApp.Async, { value: second.promise }, { nonce: 'beta' });
		controller.abort(new Error('cancelled'));
		second.resolve('second');
		first.resolve('first');
		await abortAssertion;
		const [left, right] = await Promise.all([a, b]);
		assertTheme(left.css);
		assertTheme(right.css);
		expect(left.html).toContain('first</div>');
		expect(right.html).toContain('second</div>');
		expect(left.css).toContain('nonce="alpha"');
		expect(left.css).not.toContain('nonce="beta"');
		expect(right.css).toContain('nonce="beta"');
		expect(right.css).not.toContain('nonce="alpha"');
	});

	it('preserves server DOM and computed styles during hydration', () => {
		const { html, css } = ServerRuntime.renderToString(app.CapturedTheme, { kind: 'entry' });
		assertTheme(css);
		const host = document.createElement('section');
		const sheets = document.createElement('div');
		sheets.innerHTML = css;
		const styleNodes = [...sheets.childNodes];
		document.head.append(...styleNodes);
		host.innerHTML = html;
		document.body.append(host);
		const element = host.querySelector('div')!;
		const before = getComputedStyle(element).color;
		const errors: unknown[] = [];
		const root = hydrateRoot(
			host,
			CapturedTheme,
			{ kind: 'entry' },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		try {
			expect(host.querySelector('div')).toBe(element);
			expect(before).toBe('rgb(128, 0, 128)');
			expect(getComputedStyle(element).color).toBe(before);
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
			host.remove();
			for (const node of styleNodes) node.parentNode?.removeChild(node);
		}
	});
});
