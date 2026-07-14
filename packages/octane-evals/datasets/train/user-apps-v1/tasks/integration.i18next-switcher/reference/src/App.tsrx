import { I18nextProvider, Trans, useTranslation } from '@octanejs/i18next';
import type { i18n } from 'i18next';

function LocalizedContent(props: { name: string }) @{
	const { t, i18n } = useTranslation('translation', { useSuspense: false });

	<section>
		<h1>
			{t('greeting', { name: props.name }) as string}
		</h1>
		<p>
			<Trans i18nKey="details" components={{ strong: <strong /> }} />
		</p>
		<button aria-pressed={i18n.resolvedLanguage === 'en'} onClick={() => i18n.changeLanguage('en')}>
			English
		</button>
		<button aria-pressed={i18n.resolvedLanguage === 'fr'} onClick={() => i18n.changeLanguage('fr')}>
			French
		</button>
	</section>
}

export function App(props: { i18n: i18n; name: string }) @{
	<I18nextProvider i18n={props.i18n} defaultNS="translation">
		<LocalizedContent name={props.name} />
	</I18nextProvider>
}
