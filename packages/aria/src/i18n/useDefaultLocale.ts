// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useDefaultLocale.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit `[]` effect dep array is preserved exactly; `window[localeSymbol]`
// reads cast through `any` (symbol-keyed Window access). The server-injected locale symbol
// keeps upstream's exact key so `PackageLocalizationProvider` output stays compatible.
import { useEffect, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { isRTL } from './utils';
import type { Locale } from './I18nProvider';
import { useIsSSR } from '../ssr/SSRProvider';

// Locale passed from server by PackageLocalizationProvider.
const localeSymbol = Symbol.for('react-aria.i18n.locale');

/**
 * Gets the locale setting of the browser.
 */
export function getDefaultLocale(): Locale {
	let locale =
		(typeof window !== 'undefined' && (window as any)[localeSymbol]) ||
		// @ts-ignore
		(typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) ||
		'en-US';

	try {
		Intl.DateTimeFormat.supportedLocalesOf([locale]);
	} catch {
		locale = 'en-US';
	}
	return {
		locale,
		direction: isRTL(locale) ? 'rtl' : 'ltr',
	};
}

let currentLocale = getDefaultLocale();
let listeners = new Set<(locale: Locale) => void>();

function updateLocale() {
	currentLocale = getDefaultLocale();
	for (let listener of listeners) {
		listener(currentLocale);
	}
}

/**
 * Returns the current browser/system language, and updates when it changes.
 */
export function useDefaultLocale(): Locale;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDefaultLocale(slot: symbol | undefined): Locale;
export function useDefaultLocale(...args: any[]): Locale {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDefaultLocale');

	let isSSR = useIsSSR(subSlot(slot, 'ssr'));
	let [defaultLocale, setDefaultLocale] = useState(currentLocale, subSlot(slot, 'locale'));

	useEffect(
		() => {
			if (listeners.size === 0) {
				window.addEventListener('languagechange', updateLocale);
			}

			listeners.add(setDefaultLocale);

			return () => {
				listeners.delete(setDefaultLocale);
				if (listeners.size === 0) {
					window.removeEventListener('languagechange', updateLocale);
				}
			};
		},
		[],
		subSlot(slot, 'listen'),
	);

	// We cannot determine the browser's language on the server, so default to
	// en-US. This will be updated after hydration on the client to the correct value.
	if (isSSR) {
		let locale = typeof window !== 'undefined' && (window as any)[localeSymbol];
		// octane adaptation (upstream bug): upstream hardcodes 'ltr' here even when
		// the server-injected locale is RTL, disagreeing with getDefaultLocale's
		// isRTL derivation for the very same value — derive it from what we return.
		return {
			locale: locale || 'en-US',
			direction: locale && isRTL(locale) ? 'rtl' : 'ltr',
		};
	}

	return defaultLocale;
}
