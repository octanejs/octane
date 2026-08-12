import { describe, expect, it } from 'vitest';
import { renderToReadableStream, renderToString } from 'octane/server';
import { HookProbe } from './dropzone.tsrx';

describe('react-dropzone U1 server gate', () => {
	it('renders without browser globals and streams deterministic root/input shape', async () => {
		const props = { options: { disabled: true }, rootRef: null, inputRef: null };
		const { html } = renderToString(HookProbe, props);
		expect(html).toContain('data-probe="root"');
		expect(html).toContain('data-probe="input"');
		const stream = await renderToReadableStream(HookProbe, props);
		const streamed = await new Response(stream).text();
		expect(streamed).toContain('data-probe="input"');
	});

	it('renders deterministic default, disabled, and custom-option fixtures', () => {
		const variants = [
			{},
			{ disabled: true },
			{ accept: { 'image/png': ['.png'] }, multiple: false, noKeyboard: true },
		];
		const first = variants.map(
			(options) => renderToString(HookProbe, { options, rootRef: null, inputRef: null }).html,
		);
		const second = variants.map(
			(options) => renderToString(HookProbe, { options, rootRef: null, inputRef: null }).html,
		);
		expect(second).toEqual(first);
		expect(first[0]).toContain('tabindex="0"');
		expect(first[1]).toContain('aria-disabled="true"');
		expect(first[2]).toContain('accept="image/png,.png"');
	});

	it('streams the same settled markup as string rendering', async () => {
		const props = {
			options: { accept: { 'text/plain': ['.txt'] }, multiple: false },
			rootRef: null,
			inputRef: null,
		};
		const string = renderToString(HookProbe, props).html;
		const stream = await renderToReadableStream(HookProbe, props);
		expect(await new Response(stream).text()).toBe(string);
	});
});
