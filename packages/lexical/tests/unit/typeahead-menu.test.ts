import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	$createParagraphNode,
	$getRoot,
	DELETE_CHARACTER_COMMAND,
	ParagraphNode,
	type LexicalEditor,
} from 'lexical';
import { createPortal } from 'octane';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { MenuOption, type MenuRenderFn } from '@octanejs/lexical/shared/menuShared';
import { MenuOption as PluginMenuOption } from '@octanejs/lexical/LexicalTypeaheadMenuPlugin';
import { TypeaheadEditor, CustomTypeaheadBody } from '../_fixtures/typeahead-editor.tsrx';

// The open/close flow crosses startTransition + update-listener setState +
// microtask chains — drain real timers a few times (same as the
// node-context-menu port).
// jsdom's Range lacks getBoundingClientRect (the upstream repo polyfills it in
// its vitest setup) — the typeahead resolution's getRect() needs it.
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

const throwErr = (e: unknown) => {
	throw e;
};

function makeOptions() {
	return [new TestMenuOption('Alpha'), new TestMenuOption('Beta'), new TestMenuOption('Gamma')];
}

function customMenuRenderFn(): MenuRenderFn<TestMenuOption> {
	return (anchorElementRef, itemProps, matchingString) => {
		return anchorElementRef.current && itemProps.options.length
			? createPortal(CustomTypeaheadBody as any, anchorElementRef.current, {
					itemProps,
					matchingString,
				})
			: null;
	};
}

// Ported from @lexical/react/src/__tests__/unit/LexicalTypeaheadMenuPlugin.test.tsx.
describe('LexicalTypeaheadMenuPlugin', () => {
	describe('exports', () => {
		it('should export MenuRenderFn type', () => {
			const fn: MenuRenderFn<TestMenuOption> = () => null;
			expect(fn).toBeDefined();
		});

		it('should export MenuOption class', () => {
			const option = new PluginMenuOption('key');
			expect(option.key).toBe('key');
		});
	});

	describe('with menuRenderFn (backward compatibility)', () => {
		it('should render without errors when menuRenderFn is provided', async () => {
			const r = mount(TypeaheadEditor as any, {
				options: makeOptions(),
				onQueryChange: vi.fn(),
				menuRenderFn: customMenuRenderFn(),
			});
			await settle();
			// The menu is not triggered (no user input) — only the editor mounts.
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});

		it('should accept menuRenderFn as an optional prop', async () => {
			const r = mount(TypeaheadEditor as any, {
				options: [],
				onQueryChange: vi.fn(),
				menuRenderFn: customMenuRenderFn(),
			});
			await settle();
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});
	});

	describe('without menuRenderFn (new default rendering)', () => {
		it('should render without errors when menuRenderFn is omitted', async () => {
			const r = mount(TypeaheadEditor as any, {
				options: makeOptions(),
				onQueryChange: vi.fn(),
			});
			await settle();
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});

		it('should accept props without menuRenderFn', async () => {
			const r = mount(TypeaheadEditor as any, {
				options: [],
				onQueryChange: vi.fn(),
			});
			await settle();
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});
	});

	describe('onClose', () => {
		let patchedSelectionModify = false;

		beforeEach(() => {
			class ResizeObserverMock {
				// LexicalMenu only constructs ResizeObserver and calls
				// observe/unobserve/disconnect.
				constructor(_callback: unknown) {}
				observe() {}
				unobserve() {}
				disconnect() {}
			}
			vi.stubGlobal('ResizeObserver', ResizeObserverMock);

			// jsdom has no Selection.modify — DELETE_CHARACTER_COMMAND needs it.
			if (typeof Selection.prototype.modify !== 'function') {
				patchedSelectionModify = true;
				Selection.prototype.modify = function (
					this: Selection,
					alter: string,
					direction: string,
					granularity: string,
				): void {
					const node = this.anchorNode;
					if (
						node?.nodeType !== Node.TEXT_NODE ||
						direction !== 'backward' ||
						granularity !== 'character'
					) {
						return;
					}
					const text = node as Text;
					const o = this.focusOffset;
					if (o <= 0) {
						return;
					}
					if (alter === 'extend') {
						this.setBaseAndExtent(text, o - 1, text, o);
					} else if (alter === 'move') {
						this.setBaseAndExtent(text, o - 1, text, o - 1);
					}
				};
			}
		});

		afterEach(() => {
			vi.unstubAllGlobals();
			if (patchedSelectionModify) {
				delete (Selection.prototype as { modify?: unknown }).modify;
				patchedSelectionModify = false;
			}
		});

		it('awaits async onClose before unmounting the menu', async () => {
			const editorRef: { current: LexicalEditor | null } = { current: null };

			let resolveOnClose!: () => void;
			const onClose = vi.fn(
				() =>
					new Promise<void>((resolve) => {
						resolveOnClose = resolve;
					}),
			);

			const r = mount(TypeaheadEditor as any, {
				editorRef,
				nodes: [ParagraphNode],
				options: makeOptions(),
				onQueryChange: vi.fn(),
				menuRenderFn: customMenuRenderFn(),
				onClose,
			});
			await settle();

			const editor = editorRef.current;
			expect(editor).not.toBeNull();

			editor!.update(() => {
				$getRoot().clear().append($createParagraphNode()).select().insertText('/');
			});
			await settle();

			expect(document.querySelector('[data-testid="custom-typeahead"]')).not.toBeNull();
			expect(onClose).not.toHaveBeenCalled();

			editor!.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
			await settle();

			expect(onClose).toHaveBeenCalledTimes(1);
			expect(document.querySelector('[data-testid="custom-typeahead"]')).not.toBeNull();

			resolveOnClose();
			await settle();

			expect(document.querySelector('[data-testid="custom-typeahead"]')).toBeNull();
			r.unmount();
		});

		it('runs synchronous onClose before clearing the menu', async () => {
			const editorRef: { current: LexicalEditor | null } = { current: null };
			const callOrder: string[] = [];

			const onClose = vi.fn(() => {
				callOrder.push('onClose');
			});

			const r = mount(TypeaheadEditor as any, {
				editorRef,
				nodes: [ParagraphNode],
				options: makeOptions(),
				onQueryChange: vi.fn(),
				menuRenderFn: customMenuRenderFn(),
				onClose,
			});
			await settle();

			const editor = editorRef.current;
			expect(editor).not.toBeNull();

			editor!.update(() => {
				$getRoot().clear().append($createParagraphNode()).select().insertText('/');
			});
			await settle();

			editor!.dispatchCommand(DELETE_CHARACTER_COMMAND, true);
			await settle();

			expect(callOrder).toEqual(['onClose']);
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(document.querySelector('[data-testid="custom-typeahead"]')).toBeNull();
			r.unmount();
		});
	});
});
