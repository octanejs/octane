// Ported from @lexical/react/src/__tests__/unit/LexicalMenuEmptyOptions.test.tsx (0.51.0).
// All 9 upstream cases are ported. Upstream mocks LexicalComposerContext only
// because its shared/LexicalMenu module also hosts the composer-reading hooks;
// Octane's LexicalMenu component never reads the context, so no mock is needed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	COMMAND_PRIORITY_EDITOR,
	createEditor,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_ESCAPE_COMMAND,
	type LexicalCommand,
	type LexicalEditor,
} from 'lexical';
import { createElement } from 'octane';
import { mount, flushEffects } from '../_helpers';
import { LexicalMenu } from '@octanejs/lexical/shared/LexicalMenu';
import {
	MenuOption,
	type MenuRenderFn,
	type MenuResolution,
} from '@octanejs/lexical/shared/menuShared';

class TestOption extends MenuOption {
	title: string;
	constructor(title: string) {
		super(title);
		this.title = title;
	}
}

function createTestResolution(): MenuResolution {
	return {
		getRect: () =>
			({
				bottom: 100,
				height: 20,
				left: 10,
				right: 110,
				top: 80,
				width: 100,
				x: 10,
				y: 80,
			}) as DOMRect,
		match: { leadOffset: 0, matchingString: 'zz', replaceableString: 'zz' },
	};
}

describe('LexicalMenu arrow keys with no options', () => {
	let anchorElement: HTMLDivElement;
	let rootElement: HTMLDivElement;
	let editor: LexicalEditor;
	let rendered: ReturnType<typeof mount> | null = null;

	beforeEach(() => {
		anchorElement = document.createElement('div');
		rootElement = document.createElement('div');
		rootElement.contentEditable = 'true';
		document.body.append(anchorElement, rootElement);
		editor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});
		editor.setRootElement(rootElement);
	});

	afterEach(() => {
		if (rendered !== null) {
			rendered.unmount();
			rendered = null;
		}
		anchorElement.remove();
		rootElement.remove();
		vi.restoreAllMocks();
	});

	function renderMenu(options: TestOption[], menuRenderFn?: MenuRenderFn<TestOption>): void {
		rendered = mount(LexicalMenu as any, {
			close: vi.fn(),
			editor,
			anchorElementRef: { current: anchorElement },
			resolution: createTestResolution(),
			options,
			onSelectOption: vi.fn(),
			menuRenderFn,
		});
		// The key commands are registered from a passive effect.
		flushEffects();
	}

	function pressKey(command: LexicalCommand<KeyboardEvent>): {
		handled: boolean;
		defaultPrevented: boolean;
		reachedEditor: boolean;
	} {
		let reachedEditor = false;
		const removeFallback = editor.registerCommand(
			command,
			() => {
				reachedEditor = true;
				return false;
			},
			COMMAND_PRIORITY_EDITOR,
		);
		const event = new KeyboardEvent('keydown', { cancelable: true });
		try {
			const handled = editor.dispatchCommand(command, event);
			flushEffects();
			return { defaultPrevented: event.defaultPrevented, handled, reachedEditor };
		} finally {
			removeFallback();
		}
	}

	for (const [name, command] of [
		['ArrowDown', KEY_ARROW_DOWN_COMMAND],
		['ArrowUp', KEY_ARROW_UP_COMMAND],
		['Escape', KEY_ESCAPE_COMMAND],
	] as const) {
		it(`lets ${name} through when there are no options`, () => {
			// An empty option list renders no menu at all, so the key must still
			// reach whatever would otherwise move the caret.
			renderMenu([]);

			const result = pressKey(command);
			expect(result.handled).toBe(false);
			expect(result.defaultPrevented).toBe(false);
			expect(result.reachedEditor).toBe(true);
		});

		it(`still consumes ${name} when there are options`, () => {
			renderMenu([new TestOption('a'), new TestOption('b')]);

			const result = pressKey(command);
			expect(result.handled).toBe(true);
			expect(result.defaultPrevented).toBe(true);
			expect(result.reachedEditor).toBe(false);
		});

		it(`still consumes ${name} when a custom renderer draws an empty menu`, () => {
			// Only the default renderer draws nothing for an empty list. A
			// menuRenderFn is called whatever the options look like and may put a
			// "no results" panel on screen, which the user still has to be able to
			// move through and dismiss.
			renderMenu([], () => createElement('div', null, 'No results'));

			const result = pressKey(command);
			expect(result.handled).toBe(true);
			expect(result.defaultPrevented).toBe(true);
			expect(result.reachedEditor).toBe(false);
		});
	}
});
