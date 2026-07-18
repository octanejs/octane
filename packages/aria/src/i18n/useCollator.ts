// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useCollator.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the module-level collator cache ports verbatim.
import { S, splitSlot, subSlot } from '../internal';
import { useLocale } from './I18nProvider';

let cache = new Map<string, Intl.Collator>();

/**
 * Provides localized string collation for the current locale. Automatically updates when the locale
 * changes, and handles caching of the collator for performance.
 *
 * @param options - Collator options.
 */
export function useCollator(options?: Intl.CollatorOptions): Intl.Collator;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCollator(
	options: Intl.CollatorOptions | undefined,
	slot: symbol | undefined,
): Intl.Collator;
export function useCollator(...args: any[]): Intl.Collator {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCollator');
	const options = user[0] as Intl.CollatorOptions | undefined;

	let { locale } = useLocale(subSlot(slot, 'locale'));

	let cacheKey =
		locale +
		(options
			? Object.entries(options)
					.sort((a, b) => (a[0] < b[0] ? -1 : 1))
					.join()
			: '');
	if (cache.has(cacheKey)) {
		return cache.get(cacheKey)!;
	}

	let formatter = new Intl.Collator(locale, options);
	cache.set(cacheKey, formatter);
	return formatter;
}
