import { resolve } from 'node:path';
import { compile } from 'octane/compiler';
import { octane } from 'octane/compiler/vite';
import { renderToString } from 'octane/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadServerFixture } from './_server-fixture';

const fixture = resolve(__dirname, '_fixtures/ssr-invalid-nesting.tsrx');
const dev = loadServerFixture(fixture, { compileOptions: { dev: true } });
const prod = loadServerFixture(fixture, { compileOptions: { dev: false } });

function errors() {
	return vi.spyOn(console, 'error').mockImplementation(() => {});
}

function messageAt(spy: ReturnType<typeof errors>, index = 0): string {
	return String(spy.mock.calls[index]?.[0]);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('DEV SSR invalid HTML nesting', () => {
	it('leaves valid HTML unchanged and silent', () => {
		const spy = errors();
		const { html } = renderToString(dev.Valid);

		expect(html).toContain(
			'<main><p>valid</p><table><tbody><tr><td>cell</td></tr></tbody></table></main>',
		);
		expect(spy).not.toHaveBeenCalled();
	});

	it('reports a direct parser-repaired relationship with both source locations', () => {
		const spy = errors();
		const { html } = renderToString(dev.Direct);

		expect(html).toContain('<p><div>direct</div></p>');
		expect(spy).toHaveBeenCalledTimes(1);
		const warning = messageAt(spy);
		expect(warning).toContain('Octane SSR invalid HTML nesting:');
		expect(warning).toContain('`<div>`');
		expect(warning).toContain('cannot be a child of `<p>`');
		expect(warning).toContain('The browser will repair this HTML before hydration');
		expect(warning.match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
	});

	it('tracks transparent component boundaries when checking ancestors', () => {
		const spy = errors();
		renderToString(dev.CrossComponent);

		expect(spy).toHaveBeenCalledTimes(1);
		const warning = messageAt(spy);
		expect(warning).toContain('`<button>`');
		expect(warning).toContain('cannot be a descendant of `<button>`');
		expect(warning.match(/ssr-invalid-nesting\.tsrx:\d+:\d+/g)).toHaveLength(2);
	});

	it('reports table markup the HTML parser will repair', () => {
		const spy = errors();
		renderToString(dev.InvalidTable);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain('`<table>` only allows these children');
	});

	it('respects custom-element and SVG parsing boundaries', () => {
		const spy = errors();
		renderToString(dev.CustomElementBoundary);
		renderToString(dev.SvgNestedLinks);

		expect(spy).not.toHaveBeenCalled();
	});

	it('resumes HTML validation inside SVG foreignObject', () => {
		const spy = errors();
		renderToString(dev.ForeignObjectHtml);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(messageAt(spy)).toContain('cannot be a child of `<p>`');
	});

	it('deduplicates a repeated authored relationship within one render', () => {
		const spy = errors();
		renderToString(dev.Repeat, { items: ['a', 'b', 'c'] });

		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('uses a fresh warning set for each render', () => {
		const spy = errors();
		renderToString(dev.Direct);
		renderToString(dev.Direct);

		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('restores the outer element context after a nested server render', () => {
		const spy = errors();
		renderToString(dev.NestedRenderIsolation, {
			renderNested: () => renderToString(dev.Direct).html,
		});

		expect(spy).toHaveBeenCalledTimes(2);
		const warnings = spy.mock.calls.map((call) => String(call[0]));
		expect(warnings.some((warning) => warning.includes('cannot be a child of `<p>`'))).toBe(true);
		expect(
			warnings.some((warning) => warning.includes('cannot be a descendant of `<button>`')),
		).toBe(true);
	});

	it('emits no validation call or warning when server DEV is disabled', () => {
		const spy = errors();
		const source = 'export function App() @{ <p><div>prod</div></p> }';
		const compiled = compile(source, 'App.tsrx', { mode: 'server', dev: false }).code;

		expect(compiled).not.toContain('ssrElement');
		expect(renderToString(prod.Direct).html).toContain('<p><div>direct</div></p>');
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('Vite DEV SSR compiler gate', () => {
	async function transform(command: 'serve' | 'build'): Promise<string> {
		const plugin = octane({ ssr: true });
		const root = process.cwd();
		(plugin.config as any)({ root });
		(plugin.configResolved as any)({
			root,
			command,
			define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			build: { ssr: true },
		});
		return (
			await (plugin.transform as any).call(
				{},
				'export function App() @{ <p><div>vite</div></p> }',
				resolve(root, 'src/App.tsrx'),
				{ ssr: true },
			)
		).code;
	}

	it('enables nesting instrumentation for serve and removes it for build', async () => {
		expect(await transform('serve')).toContain('ssrElement');
		expect(await transform('build')).not.toContain('ssrElement');
	});
});
