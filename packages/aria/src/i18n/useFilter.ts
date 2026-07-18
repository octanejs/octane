// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/i18n/useFilter.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit `[collator]` / `[startsWith, endsWith, contains]` dep arrays are
// preserved exactly; the callback params get explicit `string` types (strict implicit-any).
import { useCallback, useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useCollator } from './useCollator';

export interface Filter {
	/** Returns whether a string starts with a given substring. */
	startsWith: (string: string, substring: string) => boolean;
	/** Returns whether a string ends with a given substring. */
	endsWith: (string: string, substring: string) => boolean;
	/** Returns whether a string contains a given substring. */
	contains: (string: string, substring: string) => boolean;
}

/**
 * Provides localized string search functionality that is useful for filtering or matching items in
 * a list. Options can be provided to adjust the sensitivity to case, diacritics, and other
 * parameters.
 */
export function useFilter(options?: Intl.CollatorOptions): Filter;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFilter(
	options: Intl.CollatorOptions | undefined,
	slot: symbol | undefined,
): Filter;
export function useFilter(...args: any[]): Filter {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFilter');
	const options = user[0] as Intl.CollatorOptions | undefined;

	let collator = useCollator(
		{
			usage: 'search',
			...options,
		},
		subSlot(slot, 'collator'),
	);

	// TODO(later): these methods don't currently support the ignorePunctuation option.
	let startsWith = useCallback(
		(string: string, substring: string) => {
			if (substring.length === 0) {
				return true;
			}

			// Normalize both strings so we can slice safely
			// TODO: take into account the ignorePunctuation option as well...
			string = string.normalize('NFC');
			substring = substring.normalize('NFC');
			return collator.compare(string.slice(0, substring.length), substring) === 0;
		},
		[collator],
		subSlot(slot, 'startsWith'),
	);

	let endsWith = useCallback(
		(string: string, substring: string) => {
			if (substring.length === 0) {
				return true;
			}

			string = string.normalize('NFC');
			substring = substring.normalize('NFC');
			return collator.compare(string.slice(-substring.length), substring) === 0;
		},
		[collator],
		subSlot(slot, 'endsWith'),
	);

	let contains = useCallback(
		(string: string, substring: string) => {
			if (substring.length === 0) {
				return true;
			}

			string = string.normalize('NFC');
			substring = substring.normalize('NFC');

			let scan = 0;
			let sliceLen = substring.length;
			for (; scan + sliceLen <= string.length; scan++) {
				let slice = string.slice(scan, scan + sliceLen);
				if (collator.compare(substring, slice) === 0) {
					return true;
				}
			}

			return false;
		},
		[collator],
		subSlot(slot, 'contains'),
	);

	return useMemo(
		() => ({
			startsWith,
			endsWith,
			contains,
		}),
		[startsWith, endsWith, contains],
		subSlot(slot, 'filter'),
	);
}
