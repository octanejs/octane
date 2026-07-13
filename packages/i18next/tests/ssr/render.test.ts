import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { renderToString } from 'octane/server';
import { ServerApp } from '../_fixtures/ssr.tsrx';

describe('@octanejs/i18next server rendering', () => {
	it('renders preloaded hook and Trans output and reports used namespaces', async () => {
		const instance = createInstance();
		await instance.init({
			lng: 'en',
			fallbackLng: false,
			resources: {
				en: {
					translation: {
						heading: 'Server greeting',
						rich: 'Hello <strong>{{name}}</strong>',
					},
				},
			},
			interpolation: { escapeValue: false },
		});

		const { html } = renderToString(ServerApp, { i18n: instance });
		expect(html).toContain('<h1>Server greeting</h1>');
		expect(html).toContain('<p id="ready">true</p>');
		expect(html).toContain('<strong>Ada</strong>');
		expect(instance.reportNamespaces?.getUsedNamespaces()).toContain('translation');
	});
});
