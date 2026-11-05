import { ReactCompat } from 'octane/react';
import { FormattedNumber } from 'react-intl';
import { FormattedMessage, IntlBoundary, IntlProvider, RawIntlProvider, intlContexts, useIntl } from './react-intl.tsrx';

export function Message({ inspect }) @{
	const intl = useIntl();
	inspect?.(intl);
	<p lang={intl.locale}><FormattedMessage id="greeting" defaultMessage="Hello" /></p>
}

export function Local({ config, inspect, mirror, raw, providedRaw }) @{
	<IntlProvider {...config}>
		@if (mirror) {
			<IntlBoundary>
				<ReactCompat contexts={intlContexts}><FormattedNumber value={1234.5} /></ReactCompat>
			</IntlBoundary>
		} @else if (providedRaw) {
			<RawIntlProvider value={raw}><Message inspect={inspect} /></RawIntlProvider>
		} @else {
			<Message inspect={inspect} />
		}
	</IntlProvider>
}
