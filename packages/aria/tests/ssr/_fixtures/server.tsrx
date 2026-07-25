import { useState } from 'octane';
import { I18nProvider, SSRProvider, useId, useIsSSR, useLocale } from '@octanejs/aria';

function AriaServerContents() @{
	const labelId = useId('aria-hydration-label');
	const { locale, direction } = useLocale();
	const isSSR = useIsSSR();
	const [clicks, setClicks] = useState(0);

	<main id="aria-server" data-locale={locale} data-direction={direction}>
		<label id={labelId} for="aria-hydration-input">Email</label>
		<input id="aria-hydration-input" aria-labelledby={labelId} />
		<output id="aria-render-phase">{isSSR ? 'server' : 'client'}</output>
		<button id="aria-hydration-button" onClick={() => setClicks((count) => count + 1)}>
			{'Clicks: ' + clicks}
		</button>
	</main>
}

export function AriaServerFixture(props: { locale: string }) @{
	<SSRProvider>
		<I18nProvider locale={props.locale}>
			<AriaServerContents />
		</I18nProvider>
	</SSRProvider>
}
