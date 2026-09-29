import { use } from 'octane';
import type { i18n as I18n } from 'i18next';
import { useTranslation } from '@octanejs/i18next';

interface HydrationProps {
	i18n: I18n;
	load: () => Promise<string>;
}

function LazyConsumer(props: HydrationProps) @{
	const { t } = useTranslation('lazy', { i18n: props.i18n });
	const value = use(props.load());
	<p id="hydrated-value">{t('key') + '/' + value as string}</p>
}

export function SuspenseHydrationApp(props: HydrationProps) @{
	<main>
		@try {
			<LazyConsumer i18n={props.i18n} load={props.load} />
		} @pending {
			<p id="hydrated-loading">loading</p>
		}
	</main>
}
