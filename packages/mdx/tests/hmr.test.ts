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

	it('hot-swaps an edited document into live mounts in place', () => {
		const v1 = compileMdxSync('# One\n\nfirst\n', '/docs/doc.mdx', { hmr: true });
		let accepted: ((module: any) => void) | null = null;
		const mod1 = evalModuleCode(v1.code, MODS, { accept: (cb) => (accepted = cb) });

		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = Octane.createRoot(container);
		root.render(mod1.default, {});
		Octane.flushSync(() => {});
		expect(container.querySelector('h1')?.textContent).toBe('One');
		expect(accepted).not.toBeNull();

		// The "edit": recompile the same id with new content; vite would re-run
		// the module and hand the new namespace to the accept callback.
		const v2 = compileMdxSync('# Two\n\nsecond\n', '/docs/doc.mdx', { hmr: true });
		const mod2 = evalModuleCode(v2.code, MODS, { accept: () => {} });
		accepted!({ default: mod2.default });
		Octane.flushSync(() => {});

		// The SAME mounted root re-rendered with the new document body.
		expect(container.querySelector('h1')?.textContent).toBe('Two');
		expect(container.textContent).toContain('second');
		expect(container.textContent).not.toContain('first');
		root.unmount();
		container.remove();
	});

	it('keeps the wrapper identity stable so a parent does not remount the document', () => {
		const v1 = compileMdxSync('# One\n', '/docs/doc.mdx', { hmr: true });
		let accepted: ((module: any) => void) | null = null;
		const mod1 = evalModuleCode(v1.code, MODS, { accept: (cb) => (accepted = cb) });
		expect(typeof (mod1.default as any)[Octane.HMR]?.update).toBe('function');

		const v2 = compileMdxSync('# Two\n', '/docs/doc.mdx', { hmr: true });
		const mod2 = evalModuleCode(v2.code, MODS, { accept: () => {} });
		// update() unwraps an incoming wrapper down to the raw body — no nesting.
		accepted!({ default: mod2.default });
		expect((mod1.default as any)[Octane.HMR].fn).toBe((mod2.default as any)[Octane.HMR].fn);
	});
});
