// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useDateFormatter.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit `[locale, options]` memo deps are preserved exactly; the
// `isEqual` key reads cast through `Record<string, any>` (strict index typing).
import { DateFormatter } from '@internationalized/date';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useDeepMemo } from '../utils/useDeepMemo';
import { useLocale } from './I18nProvider';

export interface DateFormatterOptions extends Intl.DateTimeFormatOptions {
	calendar?: string;
}

/**
 * Provides localized date formatting for the current locale. Automatically updates when the locale
 * changes, and handles caching of the date formatter for performance.
 *
 * @param options - Formatting options.
 */
export function useDateFormatter(options?: DateFormatterOptions): DateFormatter;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDateFormatter(
	options: DateFormatterOptions | undefined,
	slot: symbol | undefined,
): DateFormatter;
export function useDateFormatter(...args: any[]): DateFormatter {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDateFormatter');

	// Reuse last options object if it is shallowly equal, which allows the useMemo result to also be reused.
	let options = useDeepMemo(
		(user[0] as DateFormatterOptions | undefined) ?? {},
		isEqual,
		subSlot(slot, 'options'),
	);
	let { locale } = useLocale(subSlot(slot, 'locale'));
	return useMemo(
		() => new DateFormatter(locale, options),
		[locale, options],
		subSlot(slot, 'formatter'),
	);
}

function isEqual(a: DateFormatterOptions, b: DateFormatterOptions) {
	if (a === b) {
		return true;
	}

	let aKeys = Object.keys(a);
	let bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) {
		return false;
	}

	for (let key of aKeys) {
		if ((b as Record<string, any>)[key] !== (a as Record<string, any>)[key]) {
			return false;
		}
	}

	return true;
}
