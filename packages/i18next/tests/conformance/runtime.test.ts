import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance, type i18n } from 'i18next';
import { act } from 'octane';
import { cleanup, render, waitFor } from '@octanejs/testing-library';
import {
	BlockChildrenApp,
	ComponentApisApp,
	HookApp,
	IcuApp,
	MultipleHooksApp,
	ProviderApp,
	SSRSeedApp,
	SuspenseApp,
	TransApp,
} from '../_fixtures/runtime.tsrx';

class BackendMock {
	type = 'backend' as const;
	queue: Array<(error: Error | null, resources: Record<string, string>) => void> = [];

	init() {}

	read(
		_language: string,
		_namespace: string,
		callback: (error: Error | null, resources: Record<string, string>) => void,
	) {
		this.queue.push(callback);
	}

	flush() {
		for (const callback of this.queue.splice(0)) callback(null, { key1: 'Loaded lazily' });
	}
}

async function makeI18n(): Promise<i18n> {
	const instance = createInstance();
	await instance.init({
		lng: 'en',
		fallbackLng: false,
		resources: {
			en: {
				translation: {
					welcome: 'Hello {{name}}',
					rich: 'Hello <strong>{{name}}</strong>',
					richIndexed: 'Hello <1>{{name}}</1>',
					icu: 'Welcome <0>friend</0>!',
					icuLink: 'Read <0>the guide</0>',
				},
				common: { action: 'Continue' },
			},
			fr: {
				translation: {
					welcome: 'Bonjour {{name}}',
					rich: 'Bonjour <strong>{{name}}</strong>',
					richIndexed: 'Bonjour <1>{{name}}</1>',
					icu: 'Bienvenue <0>ami</0> !',
					icuLink: 'Lire <0>le guide</0>',
				},
				common: { action: 'Continuer' },
			},
		},
		interpolation: { escapeValue: false },
	});
	return instance;
}

describe('@octanejs/i18next runtime', () => {
	let instance: i18n;

	beforeEach(async () => {
		instance = await makeI18n();
	});

	afterEach(() => cleanup());

	it('translates through the hook and reacts to language changes', async () => {
		const view = render(HookApp, { props: { i18n: instance, name: 'Ada' } });
		expect(view.container.querySelector('#hook-value')).toHaveTextContent('Hello Ada');
		expect(view.container.querySelector('#hook-ready')).toHaveTextContent('true');

		await act(() => view.container.querySelector<HTMLButtonElement>('#fr')!.click());
		expect(view.container.querySelector('#hook-value')).toHaveTextContent('Bonjour Ada');
	});

	it('keeps multiple hook call sites and namespaces independent', () => {
		const view = render(MultipleHooksApp, { props: { i18n: instance } });
		expect(view.container.querySelector('#multi-default')).toHaveTextContent('Hello Ada');
		expect(view.container.querySelector('#multi-common')).toHaveTextContent('Continue');
	});

	it('reads the instance and default namespace from I18nextProvider', () => {
		const view = render(ProviderApp, { props: { i18n: instance } });
		expect(view.container.querySelector('#provider-value')).toHaveTextContent('Hello Ada');
		expect(instance.reportNamespaces?.getUsedNamespaces()).toContain('translation');
	});

	it('renders Trans component maps and descriptor children', () => {
		const view = render(TransApp, { props: { i18n: instance, name: 'Ada' } });
		expect(view.container.querySelector('#trans-value')).toHaveTextContent('Hello Ada');
		expect(view.container.querySelector('#trans-value strong')).toHaveClass('emphasis');
		expect(view.container.querySelector('#trans-children')).toHaveTextContent('Hello Ada');
		expect(view.container.querySelector('#trans-children strong')).not.toBeNull();
	});

	it('falls back safely and warns for opaque natural block children', () => {
		const warn = vi.spyOn(instance.services.logger, 'forward').mockImplementation(() => {});
		const view = render(BlockChildrenApp, { props: { i18n: instance } });
		expect(view.container).toHaveTextContent('Fallback source');
		expect(warn).toHaveBeenCalledWith(
			[
				expect.stringContaining('Trans cannot inspect natural .tsrx block children'),
				expect.objectContaining({ code: 'OCTANE_TRANS_BLOCK_CHILDREN' }),
			],
			'warn',
			'react-i18next::',
			true,
		);
	});

	it('supports Translation and withTranslation component APIs', () => {
		const view = render(ComponentApisApp, { props: { i18n: instance, name: 'Ada' } });
		expect(view.container.querySelector('#render-prop')).toHaveTextContent('Hello Ada');
		expect(view.container.querySelector('#hoc-value')).toHaveTextContent('Hello Ada');
	});

	it('renders ICU declaration trees as octane descriptors', () => {
		const view = render(IcuApp, { props: { i18n: instance } });
		expect(view.container.querySelector('#icu-value')).toHaveTextContent('Welcome friend!');
		expect(view.container.querySelector('#icu-value strong')).toHaveClass('icu-emphasis');
		expect(view.container.querySelector<HTMLAnchorElement>('#icu-component a')).toMatchObject({
			className: 'icu-link',
			pathname: '/guide',
			textContent: 'the guide',
		});
	});

	it('loads missing namespaces through octane Suspense', async () => {
		const backend = new BackendMock();
		const loadingInstance = createInstance().use(backend);
		await loadingInstance.init({
			lng: 'en',
			fallbackLng: false,
			ns: ['translation'],
			resources: { en: { translation: {} } },
			partialBundledLanguages: true,
			interpolation: { escapeValue: false },
		});

		const view = render(SuspenseApp, { props: { i18n: loadingInstance } });
		expect(view.container.querySelector('#loading')).toHaveTextContent('Loading');
		backend.flush();
		await waitFor(() =>
			expect(view.container.querySelector('#async-value')).toHaveTextContent('Loaded lazily'),
		);
	});

	it('seeds an i18next instance through useSSR', async () => {
		const emptyInstance = createInstance();
		await emptyInstance.init({ lng: 'en', fallbackLng: false, resources: {} });
		const view = render(SSRSeedApp, {
			props: {
				i18n: emptyInstance,
				initialStore: {
					fr: { translation: { seeded: 'Hydrated translation' } },
				},
			},
		});

		expect(view.container.querySelector('#seeded-value')).toHaveTextContent('Hydrated translation');
		expect(emptyInstance.initializedStoreOnce).toBe(true);
		expect(emptyInstance.initializedLanguageOnce).toBe(true);
	});
});
