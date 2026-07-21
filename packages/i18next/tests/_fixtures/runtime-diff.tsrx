import { createInstance } from 'i18next';
import { I18nextProvider, Trans, useTranslation } from '@octanejs/i18next';

const instance = createInstance();
await instance.init({
	lng: 'en',
	fallbackLng: false,
	resources: {
		en: {
			translation: {
				plain: 'Hello {{name}}',
				rich: 'Read <strong>{{name}}</strong>',
			},
		},
		fr: {
			translation: {
				plain: 'Bonjour {{name}}',
				rich: 'Lire <strong>{{name}}</strong>',
			},
		},
	},
	interpolation: { escapeValue: false },
});

function Content() @{
	const { t, ready } = useTranslation('translation', { useSuspense: false });
	<div>
		<p id="plain">{t('plain', { name: 'Ada' }) as string}</p>
		<p id="ready">{String(ready)}</p>
		<p id="rich">
			<Trans
				i18nKey="rich"
				values={{ name: 'Ada' }}
				components={{ strong: <strong className="emphasis" /> }}
			/>
		</p>
		<button id="en" onClick={() => instance.changeLanguage('en')}>English</button>
		<button id="fr" onClick={() => instance.changeLanguage('fr')}>French</button>
	</div>
}

export function I18nextParity() @{
	<I18nextProvider i18n={instance}>
		<Content />
	</I18nextProvider>
}
