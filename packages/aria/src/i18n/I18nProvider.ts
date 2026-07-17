// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/I18nProvider.tsx).
// octane adaptations:
// - `.tsx` → `.ts`: JSX → createElement (plain-`.ts` components get no compiled slots —
//   hooks use the stable S()/subSlot component-slot convention). The Provider descriptor
//   keeps a stable `{ value, children }` shape.
// - React's `ReactNode`/`JSX.Element` types → `any` (octane descriptors).
// - `useLocale` gets the public-hook slot threading (splitSlot/subSlot) per the binding
//   convention; `useContext` needs no slot (context-identity keyed).
import type { Direction } from '@react-types/shared';
import { createContext, createElement, useContext, useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { isRTL } from './utils';
import { useDefaultLocale } from './useDefaultLocale';

export interface Locale {
	/** The [BCP47](https://www.ietf.org/rfc/bcp/bcp47.txt) language code for the locale. */
	locale: string;
	/** The writing direction for the locale. */
	direction: Direction;
}

export interface I18nProviderProps {
	/** Contents that should have the locale applied. */
	children: any;
	/** The locale to apply to the children. */
	locale?: string;
}

const I18nContext = createContext<Locale | null>(null);

interface I18nProviderWithLocaleProps extends I18nProviderProps {
	locale: string;
}

/**
 * Internal component that handles the case when locale is provided.
 */
function I18nProviderWithLocale(props: I18nProviderWithLocaleProps): any {
	const slot = S('I18nProviderWithLocale');
	let { locale, children } = props;
	let value: Locale = useMemo(
		() => ({
			locale,
			direction: isRTL(locale) ? 'rtl' : 'ltr',
		}),
		[locale],
		subSlot(slot, 'value'),
	);

	return createElement(I18nContext.Provider, { value, children });
}

interface I18nProviderWithDefaultLocaleProps {
	children: any;
}

/**
 * Internal component that handles the case when no locale is provided.
 */
function I18nProviderWithDefaultLocale(props: I18nProviderWithDefaultLocaleProps): any {
	const slot = S('I18nProviderWithDefaultLocale');
	let { children } = props;
	let defaultLocale = useDefaultLocale(subSlot(slot, 'default'));

	return createElement(I18nContext.Provider, { value: defaultLocale, children });
}

/**
 * Provides the locale for the application to all child components.
 */
export function I18nProvider(props: I18nProviderProps): any {
	let { locale, children } = props;

	// Conditionally render different components to avoid calling useDefaultLocale.
	// This is necessary because useDefaultLocale triggers a re-render.
	if (locale) {
		return createElement(I18nProviderWithLocale, { locale, children });
	}

	return createElement(I18nProviderWithDefaultLocale, { children });
}

/**
 * Returns the current locale and layout direction.
 */
export function useLocale(): Locale;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useLocale(slot: symbol | undefined): Locale;
export function useLocale(...args: any[]): Locale {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLocale');

	let defaultLocale = useDefaultLocale(subSlot(slot, 'default'));
	let context = useContext(I18nContext);
	return context || defaultLocale;
}
