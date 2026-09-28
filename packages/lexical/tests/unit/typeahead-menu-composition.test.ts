// Ported from @lexical/react/src/__tests__/unit/LexicalTypeaheadMenuPlugin.test.tsx (0.51.0).
// Only the `IME composition` block that 0.51.0 added; the pre-existing cases of
// that upstream file live in typeahead-menu.test.ts. The other 0.46.0 -> 0.51.0
// changes to the upstream file (type-only imports, unmounting in afterEach) have
// no behavior to port. All 3 new upstream cases are ported.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	$createParagraphNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	$setCompositionKey,
	ParagraphNode,
	type LexicalEditor,
	type TextNode,
} from 'lexical';
import { createPortal } from 'octane';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { MenuOption, type MenuRenderFn } from '@octanejs/lexical/shared/menuShared';
import { TypeaheadEditor, CustomTypeaheadBody } from '../_fixtures/typeahead-editor.tsrx';

// jsdom's Range lacks getBoundingClientRect (the upstream repo polyfills it in
// its vitest setup); the typeahead resolution's getRect() needs it.
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
	Range.prototype.getBoundingClientRect = function () {
		return {
			bottom: 0,
			height: 0,
			left: 0,
			right: 0,
			top: 0,
			width: 0,
			x: 0,
			y: 0,
			toJSON() {
				return {};
			},
		} as DOMRect;
	};
}

// The open/close flow crosses startTransition + update-listener setState +
// microtask chains, so drain real timers a few times (as typeahead-menu.test.ts).
async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
		flushEffects();
	}
}

class TestMenuOption extends MenuOption {
	title: string;
	constructor(title: string) {
		super(title);
		this.title = title;
	}
}

const TEST_OPTIONS = [
	new TestMenuOption('Alpha'),
	new TestMenuOption('Beta'),
	new TestMenuOption('Gamma'),
];

// Mirrors the upstream IME menuRenderFn: a portal holding the list and the
// current matching string (CustomTypeaheadBody renders both).
const menuRenderFn: MenuRenderFn<TestMenuOption> = (
	anchorElementRef,
	itemProps,
	matchingString,
) => {
	return anchorElementRef.current && itemProps.options.length
		? createPortal(CustomTypeaheadBody as any, anchorElementRef.current, {
				itemProps,
				matchingString,
			})
		: null;
};

function $insertTrigger(): void {
	$getRoot().clear().append($createParagraphNode()).select().insertText('/');
}

function $getQueryTextNode(): TextNode {
	const textNode = $getRoot().getFirstDescendant();
	if (!$isTextNode(textNode)) {
		throw new Error('expected a text node holding the query');
	}
	return textNode;
}

function $compose(text: string): void {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		throw new Error('expected a range selection');
	}
	selection.insertText(text);
	$setCompositionKey(selection.anchor.key);
}

function $dropTriggerWhileComposing(): void {
	const textNode = $getQueryTextNode();
	textNode.setTextContent('햄');
	$setCompositionKey(textNode.getKey());
}

function getMenu(): Element | null {
	return document.querySelector('[data-testid="custom-typeahead"]');
}

describe('LexicalTypeaheadMenuPlugin', () => {
	describe('IME composition', () => {
		let rendered: ReturnType<typeof mount> | null = null;

		beforeEach(() => {
			class ResizeObserverMock {
				constructor(_callback: unknown) {}
				observe() {}
				unobserve() {}
				disconnect() {}
			}
			vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		});

		afterEach(() => {
			if (rendered !== null) {
				rendered.unmount();
				rendered = null;
			}
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
		});

		async function mountEditor(props: {
			onQueryChange?: (matchingString: string | null) => void;
			onClose?: () => void;
		}): Promise<LexicalEditor> {
			const editorRef: { current: LexicalEditor | null } = { current: null };
			rendered = mount(TypeaheadEditor as any, {
				editorRef,
				nodes: [ParagraphNode],
				options: TEST_OPTIONS,
				onQueryChange: props.onQueryChange ?? vi.fn(),
				menuRenderFn,
				onClose: props.onClose,
			});
			await settle();
			const editor = editorRef.current;
			if (editor === null) {
				throw new Error('expected the editor ref to be populated');
			}
			return editor;
		}

		async function mountAndCompose(props: {
			onQueryChange?: (matchingString: string | null) => void;
			onClose?: () => void;
		}): Promise<LexicalEditor> {
			const editor = await mountEditor(props);

			editor.update($insertTrigger);
			await settle();

			editor.update(() => $compose('햄'));
			await settle();

			return editor;
		}

		it('reports the query while composing without closing the menu', async () => {
			const onQueryChange = vi.fn();
			const editor = await mountEditor({ onQueryChange });

			editor.update($insertTrigger);
			await settle();

			expect(getMenu()).not.toBeNull();

			onQueryChange.mockClear();

			editor.update(() => $compose('햄'));
			await settle();

			expect(editor.isComposing()).toBe(true);
			expect(onQueryChange).toHaveBeenCalledWith('햄');
			expect(getMenu()).not.toBeNull();
			expect(document.querySelector('[data-testid="matching-string"]')?.textContent).toBe('햄');
		});

		it('keeps the menu open when the trigger match is lost while composing', async () => {
			const onClose = vi.fn();
			const editor = await mountAndCompose({ onClose });

			editor.update($dropTriggerWhileComposing);
			await settle();

			expect(editor.isComposing()).toBe(true);
			expect(onClose).not.toHaveBeenCalled();
			expect(getMenu()).not.toBeNull();
		});

		it('closes the menu once composition ends without a trigger match', async () => {
			const onClose = vi.fn();
			const editor = await mountAndCompose({ onClose });

			editor.update($dropTriggerWhileComposing);
			await settle();

			expect(getMenu()).not.toBeNull();

			editor.update(() => {
				$setCompositionKey(null);
				$getQueryTextNode().markDirty();
			});
			await Promise.resolve();
			await settle();

			expect(editor.isComposing()).toBe(false);
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(getMenu()).toBeNull();
		});
	});
});
