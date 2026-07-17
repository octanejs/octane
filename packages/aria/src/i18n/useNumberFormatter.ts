// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useNumberFormatter.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit `[locale, options]` memo deps are preserved exactly.
import { NumberFormatOptions, NumberFormatter } from '@internationalized/number';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLocale } from './I18nProvider';

/**
 * Provides localized number formatting for the current locale. Automatically updates when the
 * locale changes, and handles caching of the number formatter for performance.
 *
 * @param options - Formatting options.
 */
export function useNumberFormatter(options?: NumberFormatOptions): Intl.NumberFormat;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useNumberFormatter(
	options: NumberFormatOptions | undefined,
	slot: symbol | undefined,
): Intl.NumberFormat;
export function useNumberFormatter(...args: any[]): Intl.NumberFormat {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useNumberFormatter');
	const options = (user[0] as NumberFormatOptions | undefined) ?? {};

	let { locale } = useLocale(subSlot(slot, 'locale'));
	return useMemo(
		() => new NumberFormatter(locale, options),
		[locale, options],
		subSlot(slot, 'formatter'),
	);
}
