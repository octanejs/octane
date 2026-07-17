// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useListFormatter.tsx).
// octane adaptations: `.tsx` → `.ts` (the file contains no JSX); public-hook slot threading
// (splitSlot/subSlot) per the binding convention; the explicit `[locale, options]` memo deps
// are preserved exactly.
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLocale } from './I18nProvider';

/**
 * Provides localized list formatting for the current locale. Automatically updates when the locale
 * changes, and handles caching of the list formatter for performance.
 *
 * @param options - Formatting options.
 */
export function useListFormatter(options?: Intl.ListFormatOptions): Intl.ListFormat;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useListFormatter(
	options: Intl.ListFormatOptions | undefined,
	slot: symbol | undefined,
): Intl.ListFormat;
export function useListFormatter(...args: any[]): Intl.ListFormat {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useListFormatter');
	const options = (user[0] as Intl.ListFormatOptions | undefined) ?? {};

	let { locale } = useLocale(subSlot(slot, 'locale'));
	return useMemo(
		() => new Intl.ListFormat(locale, options),
		[locale, options],
		subSlot(slot, 'formatter'),
	);
}
