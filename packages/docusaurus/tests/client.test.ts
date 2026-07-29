// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDocusaurusMemoryRouter } from '../src/client.js';
import { mount, nextPaint } from '../../octane/tests/_helpers';
import { ClientRouterApp } from './_fixtures/client-router.tsrx';
import {
	createDocusaurusTestManifest,
	createDocusaurusTestRegistry,
} from './_fixtures/docusaurus-app.js';

async function flushRouting() {
	for (let index = 0; index < 4; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

describe('Docusaurus client routing', () => {
	it('loads matched route modules, renders nested outlets, and navigates without reloading', async () => {
		const loads: string[] = [];
		const modules = createDocusaurusTestRegistry(loads);
		const manifest = createDocusaurusTestManifest();
		const router = createDocusaurusMemoryRouter(manifest, modules, {
			initialEntries: ['/docs/guide/intro'],
		});
		const result = mount(ClientRouterApp, { manifest, router });

		await flushRouting();

		expect(result.find('section').getAttribute('data-plugin')).toBe('docs');
		expect(result.find('article').getAttribute('data-context')).toBe('guides:doc');
		expect(result.find('article').getAttribute('data-related')).toBe('next');
		expect(result.find('article').getAttribute('data-version')).toBe('current');
		expect(result.find('h1').textContent).toBe('Introduction');
		expect(result.find('p').textContent).toBe('Introduction body');
		expect(loads).not.toContain('advanced');

		await router.navigate('/docs/guide/advanced');
		await flushRouting();

		expect(router.state.location.pathname).toBe('/docs/guide/advanced');
		expect(result.find('h1').textContent).toBe('Advanced');
		expect(result.find('p').textContent).toBe('Advanced body');
		expect(loads.filter((id) => id === 'layout')).toHaveLength(1);
		expect(loads.filter((id) => id === 'item')).toHaveLength(1);
		expect(loads.filter((id) => id === 'related')).toHaveLength(1);
		result.unmount();
	});
});
