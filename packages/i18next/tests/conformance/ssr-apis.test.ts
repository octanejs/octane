import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { composeInitialProps, getInitialProps, setI18n, withSSR } from '@octanejs/i18next';

describe('@octanejs/i18next legacy SSR adapters', () => {
	it('collects only reported namespaces into initial props', async () => {
		const instance = createInstance();
		await instance.init({
			lng: 'en',
			fallbackLng: false,
			resources: {
				en: {
					translation: { greeting: 'Hello' },
					unused: { hidden: 'Nope' },
				},
			},
		});
		instance.reportNamespaces = {
			addUsedNamespaces() {},
			getUsedNamespaces: () => ['translation'],
		};
		setI18n(instance);

		expect(getInitialProps()).toEqual({
			initialI18nStore: { en: { translation: { greeting: 'Hello' } } },
			initialLanguage: 'en',
		});
	});

	it('composes wrapped-component props with i18next SSR props', async () => {
		function View() {}
		View.getInitialProps = async (context: unknown) => ({ context });
		const context = { requestId: 'request-1' };

		const composed = await composeInitialProps(View)(context);
		expect(composed).toMatchObject({
			context,
			initialLanguage: 'en',
			initialI18nStore: { en: { translation: { greeting: 'Hello' } } },
		});

		const Wrapped = withSSR()(View);
		expect(Wrapped.WrappedComponent).toBe(View);
		expect(Wrapped.displayName).toBe('withI18nextSSR(View)');
		expect(await Wrapped.getInitialProps(context)).toEqual(composed);
	});
});
