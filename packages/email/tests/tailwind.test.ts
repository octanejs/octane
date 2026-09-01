import { describe, expect, it } from 'vitest';
import { render } from '../src/render.ts';
import { pixelBasedPreset } from '../src/tailwind/index.ts';
import { transformTailwindHtml } from '../src/tailwind/transform.ts';
import {
	NestedTailwindBoundaries,
	TailwindEmail,
	TwoTailwindBoundaries,
} from './_fixtures/tailwind-email.tsrx';

describe('Tailwind email styling', () => {
	it('inlines utilities while preserving authored inline style precedence', async () => {
		const html = await render(TailwindEmail);
		expect(html).toContain('background-color:');
		expect(html).toContain('font-size:14px');
		expect(html).toContain('padding-top:99px');
		expect(html).toContain('padding:32px !important');
		expect(html).toContain('color:rebeccapurple');
		expect(html).toContain('Price: $1');
		expect(html).not.toContain('data-octane-email-tailwind');
	});

	it('loads the complete stock Tailwind theme', async () => {
		const html = await render(TailwindEmail);
		expect(html).toMatch(
			/class="rounded bg-white text-gray-900"[^>]*style="[^"]*border-radius:0\.25rem;[^"]*background-color:\s*#fff;[^"]*color:rgb\(16,24,40\)/,
		);
	});

	it('preserves quoted values in authored inline styles', async () => {
		const html = await render(TailwindEmail);
		expect(html).toMatch(
			/style="padding:8px;[^"]*font-family:'Helvetica Neue',\s*Arial,\s*sans-serif;/,
		);
	});

	it('moves responsive and pseudo utilities into the document head', async () => {
		const html = await render(TailwindEmail);
		expect(html).toMatch(/<style[^>]*>[\s\S]*@media[\s\S]*hover\\:text-red-500/);
	});

	it('converts modern Tailwind colors to email-safe rgb values', async () => {
		const html = await render(TailwindEmail);
		expect(html).toMatch(/style="[^"]*background-color:rgb\(43,127,255\)/);
		expect(html).toMatch(/<style[^>]*>[\s\S]*color:rgb\(251,44,54\)/);
		expect(html).not.toContain('oklch(');
	});

	it('keeps Tailwind styles inside self-closing void elements', async () => {
		const html = await render(TailwindEmail);
		expect(html).toMatch(/<img\b[^>]*\bstyle="padding:8px;"\/>/);
		expect(html).not.toContain('/ style=');
	});

	it('only reads class and style text from actual attributes', async () => {
		const id = 'quoted-attribute-text';
		const html = await transformTailwindHtml(
			`<html><head></head><body><template data-octane-email-tailwind-start="${id}"></template><div title='class="ignored" style="ignored"' class="p-2">Content</div><template data-octane-email-tailwind-end="${id}"></template></body></html>`,
			new Map([[id, { config: { presets: [pixelBasedPreset] } }]]),
		);

		expect(html).toContain(`title='class="ignored" style="ignored"'`);
		expect(html).toMatch(/class="p-2" style="padding:8px;"/);
	});

	it('resolves custom-property fallbacks containing CSS functions', async () => {
		const id = 'function-fallback';
		const html = await transformTailwindHtml(
			`<html><head></head><body><template data-octane-email-tailwind-start="${id}"></template><p class="function-fallback">Content</p><template data-octane-email-tailwind-end="${id}"></template></body></html>`,
			new Map([
				[
					id,
					{
						utility: '@utility function-fallback { color: var(--missing-color, rgb(12, 34, 56)); }',
					},
				],
			]),
		);

		expect(html).toContain('style="color:rgb(12, 34, 56);"');
		expect(html).not.toContain('var(--missing-color');
	});

	it('pretty-prints the transformed document without skipping Tailwind styles', async () => {
		const html = await render(TailwindEmail, undefined, { pretty: true });
		expect(html).toContain('>\n<');
		expect(html).toMatch(/style="[^"]*background-color:rgb\(43,127,255\)/);
		expect(html).not.toContain('data-octane-email-tailwind');
	});

	it('isolates multiple Tailwind boundaries in one async render', async () => {
		const html = await render(TwoTailwindBoundaries);
		expect(html).toContain('padding:8px');
		expect(html).toContain('margin:12px');
	});

	it('keeps concurrent render collections independent', async () => {
		const [first, second] = await Promise.all([
			render(TailwindEmail),
			render(TwoTailwindBoundaries),
		]);
		expect(first).toContain('background-color:');
		expect(first).not.toContain('margin:12px');
		expect(second).toContain('margin:12px');
		expect(second).not.toContain('background-color:');
	});

	it('rejects nested boundaries instead of silently dropping their configuration', async () => {
		await expect(render(NestedTailwindBoundaries)).rejects.toThrow(
			'Tailwind boundaries cannot be nested',
		);
	});
});
