import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { ThemedApp } from '../_fixtures/app.tsrx';

function inlineScript(html: string): { attributes: string; body: string } {
	const match = /<script([^>]*)>([\s\S]*?)<\/script>/.exec(html);
	if (!match) throw new Error(`no inline script in ${html}`);
	return { attributes: match[1], body: match[2] };
}

describe('@octanejs/next-themes on octane/server', () => {
	it('renders the provider and its children with no browser globals', () => {
		expect(typeof window).toBe('undefined');
		const { html } = renderToString(ThemedApp, {
			attribute: 'class',
			nonce: 'n0nce',
			scriptProps: { id: 'theme-script' },
			themes: ['light', 'dark', 'pink'],
		});
		const script = inlineScript(html);

		expect(script.attributes).toContain('id="theme-script"');
		expect(script.attributes).toContain('nonce="n0nce"');
		expect(html).toContain('<button>loading</button>');
		// The serialized function is called with the provider's settings, in the
		// order next-themes' script takes them; undefined serializes as null.
		expect(
			script.body.endsWith(
				')("class","theme","system",null,["light","dark","pink"],null,true,true)',
			),
		).toBe(true);
	});

	it('serializes a self-contained script that applies the theme on its own', () => {
		const { html } = renderToString(ThemedApp, {
			attribute: ['class', 'data-mode'],
			value: { dark: 'theme-dark' },
		});
		const classes = new Set<string>();
		const attributes: Record<string, string> = {};
		const documentElement = {
			classList: {
				add: (name: string) => classes.add(name),
				remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
			},
			setAttribute: (name: string, value: string) => {
				attributes[name] = value;
			},
			style: {} as { colorScheme?: string },
		};
		// Only the browser globals the script reads are in scope, so a reference
		// to anything the bundler renamed or hoisted would throw here.
		new Function('document', 'window', 'localStorage', inlineScript(html).body)(
			{ documentElement },
			{ matchMedia: () => ({ matches: true }) },
			{ getItem: () => null },
		);

		expect([...classes]).toEqual(['theme-dark']);
		expect(attributes).toEqual({ 'data-mode': 'dark' });
		expect(documentElement.style.colorScheme).toBe('dark');
	});
});
