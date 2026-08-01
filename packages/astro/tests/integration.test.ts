import { describe, it, expect } from 'vitest';
import { getContainerRenderer, getRenderer } from '../src/container-renderer.js';
import octane, { getContainerRenderer as getFromIndex } from '../src/index.js';

describe('integration factory', () => {
	it('returns an Astro integration named @octanejs/astro', () => {
		const integration = octane();
		expect(integration.name).toBe('@octanejs/astro');
		expect(integration.hooks?.['astro:config:setup']).toBeTypeOf('function');
		expect(integration.hooks?.['astro:config:done']).toBeTypeOf('function');
	});

	it('registers the renderer during astro:config:setup', () => {
		const integration = octane({ requireDirective: true });
		/** @type {any[]} */
		const renderers = [];
		/** @type {any[]} */
		const configs = [];
		integration.hooks['astro:config:setup']({
			addRenderer: (r) => renderers.push(r),
			updateConfig: (c) => {
				configs.push(c);
				return c;
			},
			command: 'dev',
			injectScript: () => {},
		});
		expect(renderers).toEqual([
			{
				name: 'octane',
				clientEntrypoint: '@octanejs/astro/client.js',
				serverEntrypoint: '@octanejs/astro/server.js',
			},
		]);
		expect(configs[0].vite.plugins.length).toBeGreaterThanOrEqual(2);
	});

	it('warns when multiple JSX renderers lack include/exclude', () => {
		const integration = octane();
		const warnings = [];
		integration.hooks['astro:config:done']({
			logger: { warn: (msg) => warnings.push(msg) },
			config: {
				integrations: [{ name: '@astrojs/react' }, { name: '@octanejs/astro' }],
			},
		});
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain('More than one JSX renderer');
	});

	it('exports matching container renderers', () => {
		expect(getContainerRenderer()).toEqual(getRenderer());
		expect(getFromIndex()).toEqual(getContainerRenderer());
	});
});
