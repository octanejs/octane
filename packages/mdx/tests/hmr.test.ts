/**
 * HMR — fast refresh for `.mdx` documents. octane's compiler auto-wraps only
 * exported `@{}`-form components, which MDX's emitted `MDXContent` is not, so
 * the pipeline appends the equivalent registration itself (see compile.ts):
 * the default export is wrapped in the runtime `hmr()` and the module
 * self-accepts, swapping the document body and re-rendering live mounts in
 * place. The vite plugin turns this on in serve mode (client only).
 */
import { describe, it, expect } from 'vitest';
import * as Octane from 'octane';
import * as Provider from '@octanejs/mdx';
import { compileMdxSync } from '@octanejs/mdx/compile';
import { evalModuleCode } from './_helpers';

const MODS = { octane: Octane, '@octanejs/mdx': Provider };

describe('mdx HMR', () => {
	it('emits the hmr wrap + self-accept block only for hmr client compiles', () => {
		const hot = compileMdxSync('# hi\n', '/docs/doc.mdx', { hmr: true });
		expect(hot.code).toContain('MDXContent = _$mdxHmr(MDXContent);');
		expect(hot.code).toContain('import.meta.hot.accept');

		const cold = compileMdxSync('# hi\n', '/docs/doc.mdx');
		expect(cold.code).not.toContain('import.meta.hot');
		const server = compileMdxSync('# hi\n', '/docs/doc.mdx', { mode: 'server', hmr: true });
		expect(server.code).not.toContain('import.meta.hot');
	});

	it('hot-swaps consecutive edits into live mounts in place', () => {
		const doc = hotDocument();
		const v1 = doc.load('# One\n\nfirst\n');

		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = Octane.createRoot(container);
		root.render(v1.default, {});
		Octane.flushSync(() => {});
		expect(container.querySelector('h1')?.textContent).toBe('One');

		// Each edit hands its body to the wrapper importers and mounts hold, so a
		// parent never remounts the document and the second edit lands too.
		for (const [title, body] of [
			['Two', 'second'],
			['Three', 'third'],
		]) {
			expect(doc.load(`# ${title}\n\n${body}\n`).default).toBe(v1.default);
			Octane.flushSync(() => {});
			expect(container.querySelector('h1')?.textContent).toBe(title);
			expect(container.textContent).toContain(body);
		}
		expect(container.textContent).not.toContain('first');
		expect(doc.invalidations).toBe(0);
		root.unmount();
		container.remove();
	});

	it.each([
		['the document', ''],
		['an exported component', 'export function Note() { return <aside>note</aside>; }\n'],
	])('sends a changed named export beside %s to its importers', (_label, component) => {
		const doc = hotDocument();
		const source = (title: string, body: string) =>
			`export const title = '${title}';\n${component}\n# ${body}\n`;
		doc.load(source('One', 'first'));
		// Importers still hold the previous evaluation's bindings. An unchanged
		// value keeps them current, so the document stays its own boundary.
		doc.load(source('One', 'second'));
		expect(doc.invalidations).toBe(0);
		doc.load(source('Two', 'second'));
		expect(doc.invalidations).toBeGreaterThan(0);
	});
});

/**
 * One `.mdx` module across successive Vite saves: each `load` evaluates the
 * edit with the module's persistent `hot.data`, then hands the new namespace
 * to the previous evaluation's accept callbacks.
 */
function hotDocument() {
	const data: Record<string, unknown> = {};
	let accept: Array<(module: any) => void> = [];
	const doc = {
		invalidations: 0,
		load(source: string): Record<string, any> {
			const previousAccept = accept;
			accept = [];
			const module = evalModuleCode(
				compileMdxSync(source, '/docs/doc.mdx', { hmr: true }).code,
				MODS,
				{
					data,
					accept: (callback) => accept.push(callback),
					invalidate: () => doc.invalidations++,
				},
			);
			for (const callback of previousAccept) callback(module);
			return module;
		},
	};
	return doc;
}
