import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEditor, KEY_ENTER_COMMAND, type LexicalEditor } from 'lexical';
import { createElement, createPortal } from 'octane';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { LexicalMenu } from '@octanejs/lexical/shared/LexicalMenu';
import {
	MenuOption,
	type MenuRenderFn,
	type MenuResolution,
} from '@octanejs/lexical/shared/menuShared';
import { CustomMenuBody, DynamicPositioningProbe } from '../_fixtures/menu-probe.tsrx';

// The regression test at the bottom mounts a bare probe (no composer) — hand it
// an editor through a mocked context; every other export stays real.
const ctxEditorHolder: { editor: LexicalEditor | null } = { editor: null };
vi.mock('@octanejs/lexical/LexicalComposerContext', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useLexicalComposerContext: () => [ctxEditorHolder.editor, {}],
}));

class TestOption extends MenuOption {
	title: string;
	constructor(title: string) {
		super(title);
		this.title = title;
	}
}

function createTestResolution(matchingString?: string): MenuResolution {
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
		match: matchingString
			? {
					leadOffset: 0,
					matchingString,
					replaceableString: matchingString,
				}
			: undefined,
	};
}

// Ported from @lexical/react/src/__tests__/unit/LexicalMenu.test.tsx.
describe('MenuOption', () => {
	it('should set key from constructor', () => {
		const option = new MenuOption('test-key');
		expect(option.key).toBe('test-key');
	});

	it('should initialize ref with null current', () => {
		const option = new MenuOption('test-key');
		expect(option.ref).toBeDefined();
		expect(option.ref!.current).toBeNull();
	});

	it('should update ref via setRefElement', () => {
		const option = new MenuOption('test-key');
		const el = document.createElement('div');
		option.setRefElement(el);
		expect(option.ref!.current).toBe(el);
	});

	it('should support optional icon property', () => {
		const option = new MenuOption('test-key');
		expect(option.icon).toBeUndefined();
		option.icon = createElement('i', { class: 'test-icon' });
		expect(option.icon).toBeDefined();
	});

	it('should support optional title property', () => {
		const option = new MenuOption('test-key');
		expect(option.title).toBeUndefined();
		option.title = 'Test Title';
		expect(option.title).toBe('Test Title');
	});

	it('should support JSX Element as title', () => {
		const option = new MenuOption('test-key');
		option.title = createElement('span', null, 'Rich Title');
		expect(option.title).toBeDefined();
	});
});

describe('MenuRenderFn type export', () => {
	it('MenuRenderFn should be importable and usable as a type', () => {
		const fn: MenuRenderFn<TestOption> = (anchorElementRef, itemProps, matchingString) => {
			expect(typeof itemProps.selectOptionAndCleanUp).toBe('function');
			expect(typeof itemProps.setHighlightedIndex).toBe('function');
			expect(Array.isArray(itemProps.options)).toBe(true);
			return null;
		};
		expect(fn).toBeDefined();
	});
});

describe('LexicalMenu', () => {
	let editor: LexicalEditor;
	let anchorElement: HTMLDivElement;

	beforeEach(() => {
		// Anchor element that portals render into.
		anchorElement = document.createElement('div');
		anchorElement.id = 'typeahead-menu';
		document.body.appendChild(anchorElement);

		editor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});
		const rootElement = document.createElement('div');
		rootElement.contentEditable = 'true';
		document.body.appendChild(rootElement);
		editor.setRootElement(rootElement);
	});

	afterEach(() => {
		anchorElement.remove();
		const rootEl = editor.getRootElement();
		if (rootEl) {
			rootEl.remove();
		}
		vi.restoreAllMocks();
	});

	function mountMenu(props: Record<string, unknown>) {
		return mount(LexicalMenu as any, {
			close: vi.fn(),
			editor,
			anchorElementRef: { current: anchorElement },
			resolution: createTestResolution('test'),
			onSelectOption: vi.fn(),
			...props,
		});
	}

	describe('default rendering (without menuRenderFn)', () => {
		it('should render menu items using default MenuItem component', async () => {
			const options = [
				new TestOption('Option A'),
				new TestOption('Option B'),
				new TestOption('Option C'),
			];
			const r = mountMenu({ options });
			await nextPaint();

			// Default rendering creates a portal into the anchor element.
			const portal = anchorElement.querySelector('.typeahead-popover');
			expect(portal).not.toBeNull();

			const items = anchorElement.querySelectorAll('li[role="option"]');
			expect(items.length).toBe(3);

			const texts = Array.from(items).map((item) => item.querySelector('.text')?.textContent);
			expect(texts).toEqual(['Option A', 'Option B', 'Option C']);
			r.unmount();
		});

		it('should apply selected class to preselected first item', async () => {
			const options = [new TestOption('First'), new TestOption('Second')];
			const r = mountMenu({ options, preselectFirstItem: true });
			await nextPaint();

			const items = anchorElement.querySelectorAll('li[role="option"]');
			expect(items[0].className).toContain('selected');
			expect(items[1].className).not.toContain('selected');
			r.unmount();
		});

		it('should render nothing when options array is empty', async () => {
			const r = mountMenu({ options: [] });
			await nextPaint();

			const portal = anchorElement.querySelector('.typeahead-popover');
			expect(portal).toBeNull();
			r.unmount();
		});

		it('should not select an option when Enter is pressed with Shift (line break / fall-through)', async () => {
			const onSelectOption = vi.fn();
			const options = [new TestOption('Option A'), new TestOption('Option B')];
			const r = mountMenu({ options, onSelectOption, preselectFirstItem: true });
			await nextPaint();

			const shiftEnter = {
				preventDefault: vi.fn(),
				shiftKey: true,
				stopImmediatePropagation: vi.fn(),
			} as unknown as KeyboardEvent;

			editor.dispatchCommand(KEY_ENTER_COMMAND, shiftEnter);
			await nextPaint();

			expect(onSelectOption).not.toHaveBeenCalled();
			r.unmount();
		});

		it('should select an option when Enter is pressed without Shift', async () => {
			const onSelectOption = vi.fn();
			const options = [new TestOption('Option A'), new TestOption('Option B')];
			const r = mountMenu({ options, onSelectOption, preselectFirstItem: true });
			await nextPaint();

			const enter = {
				preventDefault: vi.fn(),
				shiftKey: false,
				stopImmediatePropagation: vi.fn(),
			} as unknown as KeyboardEvent;

			editor.dispatchCommand(KEY_ENTER_COMMAND, enter);
			await nextPaint();

			expect(onSelectOption).toHaveBeenCalledTimes(1);
			expect(onSelectOption.mock.calls[0][0]).toBe(options[0]);
			r.unmount();
		});

		it('should render icon and title in default MenuItem', async () => {
			const option = new TestOption('With Icon');
			option.icon = createElement('i', { class: 'custom-icon' });
			const r = mountMenu({ options: [option] });
			await nextPaint();

			const icon = anchorElement.querySelector('.custom-icon');
			expect(icon).not.toBeNull();

			const text = anchorElement.querySelector('.text');
			expect(text?.textContent).toBe('With Icon');
			r.unmount();
		});
	});

	describe('custom rendering (with menuRenderFn)', () => {
		it('should use menuRenderFn when provided', async () => {
			const options = [new TestOption('Custom A'), new TestOption('Custom B')];

			const customRenderFn: MenuRenderFn<TestOption> = (
				anchorElementRef,
				itemProps,
				matchingString,
			) => {
				return anchorElementRef.current
					? createPortal(CustomMenuBody as any, anchorElementRef.current, {
							itemProps,
							matchingString,
						})
					: null;
			};

			const r = mountMenu({
				options,
				menuRenderFn: customRenderFn,
				resolution: createTestResolution('hello'),
			});
			await nextPaint();

			// Custom rendering should be used, NOT the default.
			const defaultMenu = anchorElement.querySelector('.typeahead-popover');
			expect(defaultMenu).toBeNull();

			const customMenu = anchorElement.querySelector('.custom-menu');
			expect(customMenu).not.toBeNull();

			const buttons = anchorElement.querySelectorAll('button');
			expect(buttons.length).toBe(2);
			expect(buttons[0].textContent).toBe('Custom A');
			expect(buttons[1].textContent).toBe('Custom B');

			// Verify matchingString is passed through.
			const matchingStr = anchorElement.querySelector('.matching-string');
			expect(matchingStr?.textContent).toBe('hello');
			r.unmount();
		});

		it('should pass selectedIndex to menuRenderFn', async () => {
			const options = [new TestOption('A'), new TestOption('B')];
			let capturedSelectedIndex: number | null = null;

			const customRenderFn: MenuRenderFn<TestOption> = (_anchorRef, itemProps) => {
				capturedSelectedIndex = itemProps.selectedIndex;
				return null;
			};

			const r = mountMenu({ options, menuRenderFn: customRenderFn, preselectFirstItem: true });
			await nextPaint();

			// With preselectFirstItem=true, selectedIndex should be 0.
			expect(capturedSelectedIndex).toBe(0);
			r.unmount();
		});

		it('should pass options array to menuRenderFn', async () => {
			const options = [new TestOption('X'), new TestOption('Y'), new TestOption('Z')];
			let capturedOptions: TestOption[] = [];

			const customRenderFn: MenuRenderFn<TestOption> = (_anchorRef, itemProps) => {
				capturedOptions = itemProps.options;
				return null;
			};

			const r = mountMenu({ options, menuRenderFn: customRenderFn });
			await nextPaint();

			expect(capturedOptions).toHaveLength(3);
			expect(capturedOptions.map((o) => o.title)).toEqual(['X', 'Y', 'Z']);
			r.unmount();
		});

		it('should pass empty string as matchingString when no match', async () => {
			let capturedMatchingString: string | null = 'NOT_SET';

			const customRenderFn: MenuRenderFn<TestOption> = (_anchorRef, _itemProps, matchingString) => {
				capturedMatchingString = matchingString;
				return null;
			};

			const r = mountMenu({
				options: [new TestOption('A')],
				menuRenderFn: customRenderFn,
				resolution: createTestResolution(),
			});
			await nextPaint();

			// When resolution.match is undefined, matchingString should be ''.
			expect(capturedMatchingString).toBe('');
			r.unmount();
		});
	});
});

describe('useDynamicPositioning Comment 8 regression', () => {
	it('registers a scroll listener on the editor root enclosing shadow root, not on the portaled target tree', () => {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		// Editor + scroll container live in an open shadow root, while the
		// floating menu target is portaled into document.body. The pre-fix
		// code keyed getDOMShadowRoots off the target — which sits in the
		// light DOM — so the for-loop yielded zero shadow listeners. The fix
		// keys off the editor root, so shadow.addEventListener('scroll', …)
		// fires exactly once.
		const host = document.createElement('div');
		document.body.appendChild(host);
		const shadow = host.attachShadow({ mode: 'open' });

		const editorScroller = document.createElement('div');
		editorScroller.style.height = '60px';
		editorScroller.style.overflow = 'auto';
		const editorRoot = document.createElement('div');
		editorRoot.style.height = '400px';
		editorRoot.contentEditable = 'true';
		editorScroller.appendChild(editorRoot);
		shadow.appendChild(editorScroller);

		const shadowEditor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});
		shadowEditor.setRootElement(editorRoot);
		ctxEditorHolder.editor = shadowEditor;

		const target = document.createElement('div');
		document.body.appendChild(target);

		const shadowAddSpy = vi.spyOn(shadow, 'addEventListener');

		const r = mount(DynamicPositioningProbe as any, {
			resolution: createTestResolution(),
			target,
			onReposition: () => {},
		});
		flushEffects();

		const scrollListenerCalls = shadowAddSpy.mock.calls.filter(
			([eventName]) => eventName === 'scroll',
		);
		expect(scrollListenerCalls.length).toBeGreaterThan(0);

		r.unmount();
		ctxEditorHolder.editor = null;
		host.remove();
		target.remove();
		vi.unstubAllGlobals();
	});
});
