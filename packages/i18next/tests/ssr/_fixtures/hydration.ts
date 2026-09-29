import { createInstance } from 'i18next';
import { prerender } from 'octane/static';
import { SuspenseHydrationApp } from '../../_fixtures/hydration.tsrx';

// The server instance loads the `lazy` namespace asynchronously, so the server
// render suspends in useTranslation before it completes.
export async function renderSuspenseHydration() {
	const i18n = createInstance().use({
		type: 'backend',
		init() {},
		read(
			_language: string,
			_namespace: string,
			callback: (error: Error | null, resources: Record<string, string>) => void,
		) {
			setTimeout(() => callback(null, { key: 'Lazy' }), 0);
		},
	});
	await i18n.init({
		lng: 'en',
		fallbackLng: false,
		ns: ['translation'],
		resources: { en: { translation: {} } },
		partialBundledLanguages: true,
		interpolation: { escapeValue: false },
	});
	return prerender(SuspenseHydrationApp, {
		i18n,
		load: () => Promise.resolve('server-data'),
	});
}
