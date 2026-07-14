/**
 * Pipeline-shape tests for `@octanejs/mdx/compile` — the source-to-source
 * contract: @mdx-js/mdx (jsx: true) → recmaOctaneAdapter → octane/compiler.
 */
import { describe, it, expect } from 'vitest';
import { compileMdx, compileMdxSync, defaultRemarkPlugins } from '@octanejs/mdx/compile';

describe('compileMdxSync', () => {
	it('emits a compiled octane CLIENT module (no JSX, no MDX runtime)', () => {
		const { code } = compileMdxSync('# hi\n\nsome *text*\n', '/docs/doc.mdx');
		expect(code).toContain("from 'octane'");
		expect(code).not.toContain('@mdx-js');
		// The JSX was fully lowered by octane's compiler.
		expect(code).not.toMatch(/<_components/);
		expect(code).toContain('export default');
	});

	it('mounts the MDX body through the component machinery in both branches', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx');
		// The no-layout branch mounts through the component machinery (the bare
		// `_createMdxContent(props)` call was rewritten to JSX and lowered to a
		// descriptor — `<_createMdxContent/>` is a component REFERENCE per JSX
		// semantics) — no direct call that would bypass the
		// `(props, __s, __extra)` ABI.
		expect(code).toContain('_$createElement(_createMdxContent');
		// …and the emitted ternary-else direct-call shape is gone.
		expect(code).not.toContain(': _createMdxContent(');
	});

	it('registers the final exported MDX component after its HMR wrapper in profiling builds', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			hmr: true,
			profile: true,
		});
		const hmrWrapper = code.indexOf('MDXContent = _$mdxHmr(MDXContent);');
		const registration = code.indexOf('_$mdxProfile(MDXContent,');

		expect(hmrWrapper).toBeGreaterThan(-1);
		expect(registration).toBeGreaterThan(hmrWrapper);
		expect(code).toContain(
			"import { __profileComponent as _$mdxProfile } from 'octane/profiling';",
		);
		expect(code).toContain(
			'{"id":"/docs/doc.mdx#MDXContent@1:0","name":"MDXContent","file":"/docs/doc.mdx","line":1,"column":0,"kind":"component"}',
		);

		const server = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			mode: 'server',
			profile: true,
		});
		expect(server.code).not.toContain('_$mdxProfile');
	});

	it('keeps authored hook metadata owned by the generated MDX body component', () => {
		const { code } = compileMdxSync(
			"import { useState } from 'octane'\n\n# {useState(0)[0]}\n",
			'/docs/hook.mdx',
			{ profile: true },
		);
		const body = code.match(/_\$__profileComponent\(_createMdxContent, \{"id":"([^"]+)"/)?.[1];
		const hookOwner = code.match(/"componentId":"([^"]+)"/)?.[1];
		expect(body).toMatch(/^\/docs\/hook\.mdx#_createMdxContent@\d+:\d+$/);
		expect(hookOwner).toBe(body);
	});

	it('keeps explicit profile:false output and maps byte-identical', () => {
		const normal = compileMdxSync('# hi\n', '/docs/doc.mdx');
		const explicitOff = compileMdxSync('# hi\n', '/docs/doc.mdx', { profile: false });
		expect(explicitOff).toEqual(normal);
	});

	it('emits SERVER codegen with mode: server', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx', { mode: 'server' });
		expect(code).toContain("from 'octane/server'");
	});

	it('wires providerImportSource to @octanejs/mdx by default; null disables it', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx');
		expect(code).toContain('@octanejs/mdx');
		const { code: bare } = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			providerImportSource: null,
		});
		expect(bare).not.toContain('@octanejs/mdx');
	});

	it('detects plain-markdown format from the .md extension', () => {
		// `{x}` / `<Foo/>` are literal text in md format — as source they would be
		// an expression + a JSX tag and compile very differently (or throw for the
		// undefined `x`).
		const { code } = compileMdxSync('*hi* `{x}` and text {x}\n', '/docs/doc.md');
		expect(code).toContain('{x}');
	});

	it('exposes the default remark plugin set for extension', () => {
		expect(defaultRemarkPlugins).toHaveLength(3);
	});
});

describe('compileMdx (async)', () => {
	it('matches the sync output', async () => {
		const source = '# hi\n\n- a\n- b\n';
		const sync = compileMdxSync(source, '/docs/doc.mdx');
		const async_ = await compileMdx(source, '/docs/doc.mdx');
		expect(async_.code).toBe(sync.code);
	});
});
