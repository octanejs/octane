// Ported from @lexical/react/src/__tests__/unit/LexicalTypeaheadMenuPluginUtils.test.ts (0.51.0).
// Both upstream cases are ported. Upstream also reaches the command and the
// class through its private `shared/LexicalMenu` module; Octane's equivalent is
// `shared/menuShared`. The `useBasicTypeaheadTriggerMatch` / PUNCTUATION /
// getScrollParent cases below are Octane additions covering the rest of the new
// entry point (upstream exercises the trigger only through the plugin).
import { describe, it, expect } from 'vitest';
import { createEditor } from 'lexical';
import { getScrollParent as getScrollParentFromUtils } from '@lexical/utils';
import { MenuOption as MenuOptionFromIndex } from '@octanejs/lexical';
import { MenuOption as MenuOptionFromModule } from '@octanejs/lexical/LexicalMenuOption';
import { MenuOption as MenuOptionFromNodeMenu } from '@octanejs/lexical/LexicalNodeMenuPlugin';
import {
	getScrollParent as getScrollParentFromPlugin,
	MenuOption as MenuOptionFromTypeahead,
	PUNCTUATION as punctuationFromPlugin,
	SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND as fromPlugin,
	useBasicTypeaheadTriggerMatch as useTriggerMatchFromPlugin,
} from '@octanejs/lexical/LexicalTypeaheadMenuPlugin';
import {
	getScrollParent,
	PUNCTUATION,
	SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND as fromUtils,
	useBasicTypeaheadTriggerMatch,
} from '@octanejs/lexical/LexicalTypeaheadMenuPluginUtils';
import {
	MenuOption as MenuOptionFromShared,
	SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND as fromMenu,
	type TriggerFn,
} from '@octanejs/lexical/shared/menuShared';
import { mount } from '../_helpers';
import { TriggerMatchProbe } from '../_fixtures/typeahead-trigger-probe.tsrx';

describe('SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND', () => {
	it('is one command, whichever module it is reached through', () => {
		// Commands are matched by object identity, so the command a consumer
		// dispatches has to be the very one the menu registers its handler
		// against: a second `createCommand` with the same name is a different
		// command that no handler will ever see.
		expect(fromPlugin).toBe(fromUtils);
		expect(fromMenu).toBe(fromUtils);
	});
});

describe('MenuOption', () => {
	it('is one class, whichever module it is reached through', () => {
		// The menu machinery and its consumers have to agree on the class, or an
		// `instanceof` (anyone's, now or later) silently answers false.
		expect(MenuOptionFromNodeMenu).toBe(MenuOptionFromModule);
		expect(MenuOptionFromTypeahead).toBe(MenuOptionFromModule);
		expect(MenuOptionFromShared).toBe(MenuOptionFromModule);
		expect(MenuOptionFromIndex).toBe(MenuOptionFromModule);
	});
});

describe('LexicalTypeaheadMenuPluginUtils', () => {
	it('re-exports the same bindings through LexicalTypeaheadMenuPlugin', () => {
		expect(punctuationFromPlugin).toBe(PUNCTUATION);
		expect(getScrollParentFromPlugin).toBe(getScrollParent);
		expect(useTriggerMatchFromPlugin).toBe(useBasicTypeaheadTriggerMatch);
	});

	it('keeps the upstream PUNCTUATION character class', () => {
		expect(PUNCTUATION).toBe('\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;');
	});

	it('aliases the deprecated getScrollParent to @lexical/utils', () => {
		expect(getScrollParent).toBe(getScrollParentFromUtils);
	});

	describe('useBasicTypeaheadTriggerMatch', () => {
		const editor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});

		function renderTrigger(trigger: string, options: Record<string, unknown>): TriggerFn {
			let triggerFn: TriggerFn | null = null;
			const r = mount(TriggerMatchProbe as any, {
				trigger,
				options,
				onTriggerFn: (fn: TriggerFn) => (triggerFn = fn),
			});
			r.unmount();
			if (triggerFn === null) {
				throw new Error('expected the probe to report a TriggerFn');
			}
			return triggerFn;
		}

		it('matches the trigger at the start of the text or after whitespace or "("', () => {
			const match = renderTrigger('/', { minLength: 0 });
			expect(match('/', editor)).toEqual({
				leadOffset: 0,
				matchingString: '',
				replaceableString: '/',
			});
			expect(match('hello /wor', editor)).toEqual({
				leadOffset: 6,
				matchingString: 'wor',
				replaceableString: '/wor',
			});
			expect(match('(/x', editor)).toEqual({
				leadOffset: 1,
				matchingString: 'x',
				replaceableString: '/x',
			});
			// A trigger glued to a preceding word is not a trigger.
			expect(match('a/x', editor)).toBeNull();
		});

		it('defaults minLength to 1 and honors maxLength', () => {
			const match = renderTrigger('@', {});
			expect(match('@', editor)).toBeNull();
			expect(match('@a', editor)?.matchingString).toBe('a');

			const capped = renderTrigger('@', { maxLength: 3 });
			expect(capped('@abc', editor)?.matchingString).toBe('abc');
			expect(capped('@abcd', editor)).toBeNull();
		});

		it('stops at punctuation and whitespace unless allowWhitespace is set', () => {
			const match = renderTrigger('@', {});
			expect(match('@foo.', editor)).toBeNull();
			expect(match('@foo bar', editor)).toBeNull();

			const spaced = renderTrigger('@', { allowWhitespace: true });
			expect(spaced('@foo bar', editor)?.matchingString).toBe('foo bar');

			// A custom punctuation set replaces the default one.
			const custom = renderTrigger('@', { punctuation: '!' });
			expect(custom('@foo.', editor)?.matchingString).toBe('foo.');
			expect(custom('@foo!', editor)).toBeNull();
		});

		it('returns the same TriggerFn across renders with equal options', () => {
			const seen: TriggerFn[] = [];
			const props = (minLength: number) => ({
				trigger: '/',
				options: { minLength },
				onTriggerFn: (fn: TriggerFn) => seen.push(fn),
			});
			const r = mount(TriggerMatchProbe as any, props(0));
			r.update(TriggerMatchProbe as any, props(0));
			r.update(TriggerMatchProbe as any, props(2));
			r.unmount();

			expect(seen).toHaveLength(3);
			expect(seen[1]).toBe(seen[0]);
			expect(seen[2]).not.toBe(seen[1]);
		});
	});
});
