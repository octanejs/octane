import { describe, expect, it } from 'vitest';
import { prerenderDocusaurusRoute } from '@octanejs/docusaurus/server';
import {
	createDocusaurusTestManifest,
	createDocusaurusTestRegistry,
} from '../_fixtures/docusaurus-app.js';

describe('Docusaurus static rendering', () => {
	it('prerenders a manifest route pathname without loading sibling content', async () => {
		const loads: string[] = [];
		const result = await prerenderDocusaurusRoute(
			'/docs/guide/intro',
			createDocusaurusTestManifest(),
			createDocusaurusTestRegistry(loads),
		);

		expect(result).not.toBeInstanceOf(Response);
		if (result instanceof Response) throw new Error('Unexpected redirect response.');

		expect(result.context.statusCode).toBe(200);
		expect(result.context.location.pathname).toBe('/docs/guide/intro');
		expect(result.html).toContain('<section data-plugin="docs">');
		expect(result.html).toContain('<article data-context="guides:doc"');
		expect(result.html).toContain('<h1>Introduction</h1>');
		expect(result.html).toContain('<p>Introduction body</p>');
		expect(result.html).not.toContain('Advanced body');
		expect(result.head).toBe('');
		expect(result.css).toBe('');
		expect(loads).toEqual(['layout', 'plugin', 'section', 'item', 'intro', 'related', 'kind']);
	});
});
