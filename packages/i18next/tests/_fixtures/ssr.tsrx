import type { i18n } from 'i18next';
import { I18nextProvider, Trans, useTranslation } from '@octanejs/i18next';

function ServerContent() @{
	const { t, ready } = useTranslation('translation', { useSuspense: false });
	<main lang="en">
		<h1>{t('heading') as string}</h1>
		<p id="ready">{String(ready)}</p>
		<p>
			<Trans i18nKey="rich" values={{ name: 'Ada' }} components={{ strong: <strong /> }} />
		</p>
	</main>
}

export function ServerApp(props: { i18n: i18n }) @{
	<I18nextProvider i18n={props.i18n}>
		<ServerContent />
	</I18nextProvider>
}
