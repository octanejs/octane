import memoizeOne from 'memoize-one';

import { stripDiacritics } from './diacritics';

export interface FilterOptionOption<Option> {
	readonly label: string;
	readonly value: string;
	readonly data: Option;
}

interface Config<Option> {
	readonly ignoreCase?: boolean;
	readonly ignoreAccents?: boolean;
	readonly stringify?: (option: FilterOptionOption<Option>) => string;
	readonly trim?: boolean;
	readonly matchFrom?: 'any' | 'start';
}

const memoizedStripDiacriticsForInput = memoizeOne(stripDiacritics);
const trimString = (value: string) => value.replace(/^\s+|\s+$/g, '');
const defaultStringify = <Option>(option: FilterOptionOption<Option>) =>
	`${option.label} ${option.value}`;

export const createFilter =
	<Option>(config?: Config<Option>) =>
	(option: FilterOptionOption<Option>, rawInput: string): boolean => {
		if ((option.data as { __isNew__?: unknown }).__isNew__) return true;
		const { ignoreCase, ignoreAccents, stringify, trim, matchFrom } = {
			ignoreCase: true,
			ignoreAccents: true,
			stringify: defaultStringify,
			trim: true,
			matchFrom: 'any' as const,
			...config,
		};
		let input = trim ? trimString(rawInput) : rawInput;
		let candidate = trim ? trimString(stringify(option)) : stringify(option);
		if (ignoreCase) {
			input = input.toLowerCase();
			candidate = candidate.toLowerCase();
		}
		if (ignoreAccents) {
			input = memoizedStripDiacriticsForInput(input);
			candidate = stripDiacritics(candidate);
		}
		return matchFrom === 'start'
			? candidate.slice(0, input.length) === input
			: candidate.indexOf(input) > -1;
	};
