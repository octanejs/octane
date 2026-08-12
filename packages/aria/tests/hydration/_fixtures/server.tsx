/** @jsxImportSource octane */
import { useState } from 'octane';

import { I18nProvider, useLocale } from '../../../src/i18n/I18nProvider';
import { SSRProvider, useIsSSR } from '../../../src/ssr/SSRProvider';
import { useId } from '../../../src/utils/useId';

function AriaHydrationContents() {
	const labelId = useId('aria-hydration-label');
	const { locale, direction } = useLocale();
	const isSSR = useIsSSR();
	const [clicks, setClicks] = useState(0);

	return (
		<main id="aria-server" data-locale={locale} data-direction={direction}>
			<label id={labelId} htmlFor="aria-hydration-input">
				Email
			</label>
			<input id="aria-hydration-input" aria-labelledby={labelId} />
			<output id="aria-render-phase">{isSSR ? 'server' : 'client'}</output>
			<button id="aria-hydration-button" onClick={() => setClicks((count) => count + 1)}>
				{'Clicks: ' + clicks}
			</button>
		</main>
	);
}

export function AriaHydrationFixture(props: { locale: string }) {
	return (
		<SSRProvider>
			<I18nProvider locale={props.locale}>
				<AriaHydrationContents />
			</I18nProvider>
		</SSRProvider>
	);
}
