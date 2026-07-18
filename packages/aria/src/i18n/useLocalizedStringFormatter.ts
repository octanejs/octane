// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useLocalizedStringFormatter.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention (`useLocalizedStringDictionary` calls no octane hooks today but keeps the
// slot-threading shape for uniformity); the explicit `[locale, dictionary]` memo deps are
// preserved exactly.
import {
	LocalizedString,
	LocalizedStringDictionary,
	LocalizedStringFormatter,
	LocalizedStrings,
} from '@internationalized/string';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useLocale } from './I18nProvider';

const cache = new WeakMap();
function getCachedDictionary<K extends string, T extends LocalizedString>(
	strings: LocalizedStrings<K, T>,
): LocalizedStringDictionary<K, T> {
	let dictionary = cache.get(strings);
	if (!dictionary) {
		dictionary = new LocalizedStringDictionary(strings);
		cache.set(strings, dictionary);
	}

	return dictionary;
}

/**
 * Returns a cached LocalizedStringDictionary for the given strings.
 */
export function useLocalizedStringDictionary<
	K extends string = string,
	T extends LocalizedString = string,
>(strings: LocalizedStrings<K, T>, packageName?: string): LocalizedStringDictionary<K, T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useLocalizedStringDictionary<
	K extends string = string,
	T extends LocalizedString = string,
>(
	strings: LocalizedStrings<K, T>,
	packageName: string | undefined,
	slot: symbol | undefined,
): LocalizedStringDictionary<K, T>;
export function useLocalizedStringDictionary(...args: any[]): LocalizedStringDictionary<any, any> {
	const [user] = splitSlot(args);
	const strings = user[0] as LocalizedStrings<any, any>;
	const packageName = user[1] as string | undefined;

	return (
		(packageName && LocalizedStringDictionary.getGlobalDictionaryForPackage(packageName)) ||
		getCachedDictionary(strings)
	);
}

/**
 * Provides localized string formatting for the current locale. Supports interpolating variables,
 * selecting the correct pluralization, and formatting numbers. Automatically updates when the
 * locale changes.
 *
 * @param strings - A mapping of languages to localized strings by key.
 */
export function useLocalizedStringFormatter<
	K extends string = string,
	T extends LocalizedString = string,
>(strings: LocalizedStrings<K, T>, packageName?: string): LocalizedStringFormatter<K, T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useLocalizedStringFormatter<
	K extends string = string,
	T extends LocalizedString = string,
>(
	strings: LocalizedStrings<K, T>,
	packageName: string | undefined,
	slot: symbol | undefined,
): LocalizedStringFormatter<K, T>;
export function useLocalizedStringFormatter(...args: any[]): LocalizedStringFormatter<any, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLocalizedStringFormatter');
	const strings = user[0] as LocalizedStrings<any, any>;
	const packageName = user[1] as string | undefined;

	let { locale } = useLocale(subSlot(slot, 'locale'));
	let dictionary = useLocalizedStringDictionary(strings, packageName, subSlot(slot, 'dictionary'));
	return useMemo(
		() => new LocalizedStringFormatter(locale, dictionary),
		[locale, dictionary],
		subSlot(slot, 'formatter'),
	);
}
