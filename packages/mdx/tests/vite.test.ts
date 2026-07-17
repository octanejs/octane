/**
 * Vite plugin claiming rules — which module ids `octaneMdx()` transforms.
 * `.md` is default-ON (docs sites want plain markdown compiled like `.mdx`),
 * with two escape hatches: `md: false` leaves ALL `.md` modules alone, and
 * asset-query imports (`?raw`, `?url`, `?inline`) always pass through
 * untouched — vite's asset plugin owns those (its load step already produced
 * `export default "<file text>"`; re-compiling that JS would mangle it).
 */
import { describe, it, expect, vi } from 'vitest';
import { octaneMdx } from '@octanejs/mdx/vite';

function plugin(options?: Parameters<typeof octaneMdx>[0]) {
	const p = octaneMdx(options);
	p.configResolved({ command: 'build' });
	return p;
}

const transform = (p: ReturnType<typeof octaneMdx>, code: string, id: string) =>
	p.transform.call({}, code, id);

describe('octaneMdx() id claiming', () => {
	it('transforms .mdx and .md modules (md default-on)', async () => {
		const p = plugin();
		expect(await transform(p, '# hi\n', '/docs/doc.mdx')).not.toBeNull();
		expect(await transform(p, '# hi\n', '/docs/doc.md')).not.toBeNull();
		expect(await transform(p, 'const x = 1;', '/src/mod.ts')).toBeNull();
	});

	it('md: false leaves .md modules alone', async () => {
		const p = plugin({ md: false });
		expect(await transform(p, '# hi\n', '/docs/doc.md')).toBeNull();
		expect(await transform(p, '# hi\n', '/docs/doc.mdx')).not.toBeNull();
	});

	it('passes ?raw / ?url / ?inline asset imports through untouched', async () => {
		const p = plugin();
		// vite's asset plugin already loaded these as JS — not markdown source.
		const assetJs = 'export default "# hi\\n";';
		expect(await transform(p, assetJs, '/docs/doc.md?raw')).toBeNull();
		expect(await transform(p, assetJs, '/docs/doc.mdx?raw')).toBeNull();
		expect(await transform(p, assetJs, '/docs/doc.md?url')).toBeNull();
		expect(await transform(p, assetJs, '/docs/doc.md?inline')).toBeNull();
	});

	it('still transforms ids carrying vite-internal bookkeeping queries', async () => {
		const p = plugin();
		expect(await transform(p, '# hi\n', '/docs/doc.md?v=abc123')).not.toBeNull();
		expect(await transform(p, '# hi\n', '/docs/doc.mdx?import&v=abc123')).not.toBeNull();
	});

	it('publishes one authored-range warning per module generation', async () => {
		const p = plugin();
		const warn = vi.fn();
		const source = '# Form\n\n<input onChange={() => {}} />\n';
		const context = { warn };
		const first = await p.transform.call(context, source, '/docs/form.mdx');
		expect(first?.diagnostics).toHaveLength(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
				id: '/docs/form.mdx',
				loc: { file: '/docs/form.mdx', line: 3, column: 7 },
			}),
		);

		await p.transform.call(context, source, '/docs/form.mdx', { ssr: true });
		expect(warn).toHaveBeenCalledTimes(1);

		p.watchChange('/docs/form.mdx');
		await p.transform.call(context, source, '/docs/form.mdx');
		expect(warn).toHaveBeenCalledTimes(2);
	});
});
