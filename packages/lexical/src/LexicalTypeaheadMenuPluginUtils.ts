// Ported from @lexical/react/src/LexicalTypeaheadMenuPluginUtils.ts: the
// component-free surface of LexicalTypeaheadMenuPlugin, as its own entry point.
import type { MenuOption } from './LexicalMenuOption';
import type { TriggerFn } from './shared/menuShared';

import { getScrollParent as getScrollParent_ } from '@lexical/utils';
import { createCommand, type LexicalCommand } from 'lexical';
import { useCallback } from 'octane';

/**
 * The default set of punctuation characters (as a character-class fragment)
 * that terminate a typeahead query. Used as the default `punctuation` option of
 * {@link useBasicTypeaheadTriggerMatch}.
 */
export const PUNCTUATION = '\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;';

/**
 * Command dispatched while the typeahead menu is open to scroll the option at
 * the given `index` into view. The built-in menu registers a default handler;
 * custom implementations can register their own at a higher priority.
 */
export const SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND: LexicalCommand<{
	index: number;
	option: MenuOption;
}> = createCommand('SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND');

/** @deprecated Moved to `@lexical/utils`. Import `getScrollParent` from there. */
export const getScrollParent = getScrollParent_;

// Two required user args (trigger, options), so the trailing slot is positional.
export function useBasicTypeaheadTriggerMatch(
	trigger: string,
	options: {
		minLength?: number;
		maxLength?: number;
		punctuation?: string;
		allowWhitespace?: boolean;
	},
	slot?: symbol,
): TriggerFn {
	const minLength = options.minLength ?? 1;
	const maxLength = options.maxLength ?? 75;
	const punctuation = options.punctuation ?? PUNCTUATION;
	const allowWhitespace = options.allowWhitespace ?? false;
	return useCallback(
		(text: string) => {
			const validCharsSuffix = allowWhitespace ? '' : '\\s';
			const validChars = '[^' + trigger + punctuation + validCharsSuffix + ']';
			const TypeaheadTriggerRegex = new RegExp(
				'(^|\\s|\\()(' +
					'[' +
					trigger +
					']' +
					'((?:' +
					validChars +
					'){0,' +
					maxLength +
					'})' +
					')$',
			);
			const match = TypeaheadTriggerRegex.exec(text);
			if (match !== null) {
				const maybeLeadingWhitespace = match[1];
				const matchingString = match[3];
				if (matchingString.length >= minLength) {
					return {
						leadOffset: match.index + maybeLeadingWhitespace.length,
						matchingString,
						replaceableString: match[2],
					};
				}
			}
			return null;
		},
		[allowWhitespace, trigger, punctuation, maxLength, minLength],
		slot,
	);
}
