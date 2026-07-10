import { describe, test, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import {
	COMMAND_PRIORITY_CRITICAL,
	COMMAND_PRIORITY_EDITOR,
	createCommand,
	createEditor,
	getRegisteredNode,
	mergeRegister,
	TextNode,
	$getEditor,
	type LexicalEditor,
} from 'lexical';
import { mount, flushEffects, nextPaint, type MountResult } from '../_helpers';
import { NestedEditor, OctaneDecoratorNode } from '../_fixtures/nested-editor.tsrx';

// Upstream's vitest.setup.mts mocks warnOnlyOnce so each test observes the
// deprecation warnings independently (the real implementation dedupes via a
// module-level closure that would leak state across tests).
vi.mock('@lexical/internal/warnOnlyOnce', () => ({
	default: (message: string) => () => console.warn(message),
}));

// jsdom's HTMLElement.contentEditable is a plain property that doesn't
// synchronize with the 'contenteditable' DOM attribute (upstream patches this
// in its vitest.setup.mts too) — lexical core sets decorator hosts non-editable
// via the property, so without the sync the attribute assertions can't see it.
const ceDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'contentEditable');
if (!ceDescriptor || ceDescriptor.configurable !== false) {
	Object.defineProperty(HTMLElement.prototype, 'contentEditable', {
		configurable: true,
		get(this: HTMLElement) {
			const attr = this.getAttribute('contenteditable');
			if (attr === 'true' || attr === '') {
				return 'true';
			}
			if (attr === 'false') {
				return 'false';
			}
			return 'inherit';
		},
		set(this: HTMLElement, value: string) {
			if (value === 'inherit') {
				this.removeAttribute('contenteditable');
			} else {
				this.setAttribute('contenteditable', value);
			}
		},
	});
}

async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
		flushEffects();
	}
}

// Structural HTML comparison in place of lexical/src/__tests__/utils'
// expectHtmlToBeEqual (not shipped in the npm package). Compares element tag /
// attribute / text structure, ignoring comment nodes (octane portals leave
// `<!--portal-->` markers inside decorator hosts), attribute order, and
// inter-tag whitespace.
function domToSpec(node: Element): unknown {
	const attrs: Record<string, string> = {};
	for (const a of Array.from(node.attributes)) {
		attrs[a.name] =
			a.name === 'style' ? a.value.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim() : a.value;
	}
	const children: unknown[] = [];
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			children.push(domToSpec(child as Element));
		} else if (child.nodeType === Node.TEXT_NODE && child.textContent!.trim() !== '') {
			children.push(child.textContent);
		}
	}
	return { tag: node.tagName.toLowerCase(), attrs, children };
}

function expectHtmlToBeEqual(actual: string, expected: string) {
	const a = document.createElement('div');
	a.innerHTML = actual;
	const e = document.createElement('div');
	e.innerHTML = expected;
	expect(Array.from(a.children).map(domToSpec)).toEqual(Array.from(e.children).map(domToSpec));
}

const throwErr = (e: unknown) => {
	throw e;
};

// Ported from @lexical/react/src/__tests__/unit/LexicalNestedComposer.test.tsx.
// (Upstream also runs jest-axe a11y checks on the editable/uneditable states;
// axe isn't a dependency here, so those assertions are omitted.)
describe('LexicalNestedComposer', () => {
	let warn: MockInstance;
	let mounted: MountResult | null = null;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		if (mounted) {
			mounted.unmount();
			mounted = null;
		}
		warn.mockReset();
		vi.restoreAllMocks();
	});

	async function mountNested(props: Record<string, unknown>) {
		let editor: LexicalEditor | undefined;
		let nestedEditor: LexicalEditor | undefined;
		mounted = mount(NestedEditor as any, {
			onEditors: (e: LexicalEditor, n: LexicalEditor) => {
				editor = e;
				nestedEditor = n;
			},
			...props,
		});
		await settle();
		expect(editor, 'editor defined').toBeDefined();
		expect(nestedEditor, 'nestedEditor defined').toBeDefined();
		return { editor: editor!, nestedEditor: nestedEditor!, r: mounted };
	}

	const INNER_HTML = (opts: { parentLabel?: boolean; nestedLabel?: boolean } = {}) => `
		<div
			contenteditable="true"
			role="textbox"
			spellcheck="true"
			style="user-select: text; white-space: pre-wrap; word-break: break-word"
			${opts.parentLabel ? 'aria-label="parent"' : ''}
			data-lexical-editor="true">
			<p dir="auto"><span data-lexical-text="true">parent</span></p>
			<div contenteditable="false" data-lexical-decorator="true">
				<div
					contenteditable="true"
					role="textbox"
					spellcheck="true"
					style="user-select: text; white-space: pre-wrap; word-break: break-word"
					${opts.nestedLabel ? 'aria-label="nested"' : ''}
					data-lexical-editor="true">
					<p dir="auto"><span data-lexical-text="true">nested</span></p>
				</div>
			</div>
		</div>
	`;

	test('with inherited configuration and namespace', async () => {
		const { editor, nestedEditor, r } = await mountNested({
			createNested: () => createEditor(),
		});
		// namespace inherited
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('parent');
		// nodes inherited
		expect([...(nestedEditor as any)._nodes.keys()]).toEqual([...(editor as any)._nodes.keys()]);
		expect(warn.mock.calls).toEqual([]);
		expectHtmlToBeEqual(r.container.innerHTML, INNER_HTML());
	});

	test('with deprecated initialNodes configuration and inherited namespace', async () => {
		const { editor, nestedEditor, r } = await mountNested({
			createNested: () => createEditor(),
			initialNodes: [],
		});
		// namespace inherited
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('parent');
		// nodes inherited
		expect([...(nestedEditor as any)._nodes.keys()]).toEqual([...(editor as any)._nodes.keys()]);
		expect(warn.mock.calls).toEqual([
			[
				`LexicalNestedComposer initialNodes is deprecated and will be removed in v0.32.0, it has never worked correctly.\nYou can configure your editor's nodes with createEditor({nodes: [], parentEditor: $getEditor()})`,
			],
			[
				`LexicalNestedComposer initialEditor should explicitly initialize its namespace when the node configuration differs from the parentEditor. For backwards compatibility, the namespace will be initialized from parentEditor until v0.32.0, but this has always had incorrect copy/paste behavior when the configuration differed.\nYou can configure your editor's namespace with createEditor({namespace: 'nested-editor-namespace', nodes: [], parentEditor: $getEditor()}).`,
			],
		]);
		expectHtmlToBeEqual(r.container.innerHTML, INNER_HTML());
	});

	test('with deprecated initialNodes configuration and explicit namespace', async () => {
		const { editor, nestedEditor, r } = await mountNested({
			createNested: (parentEditor: LexicalEditor) =>
				createEditor({ namespace: 'nested', nodes: [], onError: throwErr, parentEditor }),
			initialNodes: [OctaneDecoratorNode],
		});
		// namespace explicit
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('nested');
		// nodes inherited
		expect([...(nestedEditor as any)._nodes.keys()].sort()).toEqual(
			[...(editor as any)._nodes.keys()].sort(),
		);
		expectHtmlToBeEqual(r.container.innerHTML, INNER_HTML());
		expect(warn.mock.calls).toEqual([
			[
				`LexicalNestedComposer initialNodes is deprecated and will be removed in v0.32.0, it has never worked correctly.\nYou can configure your editor's nodes with createEditor({nodes: [], parentEditor: $getEditor()})`,
			],
		]);
	});

	test('with explicit nodes configuration and explicit namespace', async () => {
		const { editor, nestedEditor, r } = await mountNested({
			createNested: (parentEditor: LexicalEditor) =>
				createEditor({ namespace: 'nested', nodes: [], onError: throwErr, parentEditor }),
		});
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('nested');
		// nodes NOT inherited — the decorator type stays parent-only
		expect([...(nestedEditor as any)._nodes.keys()].sort()).toEqual(
			[...(editor as any)._nodes.keys()]
				.filter((k: string) => k !== OctaneDecoratorNode.getType())
				.sort(),
		);
		expectHtmlToBeEqual(r.container.innerHTML, INNER_HTML());
		expect(warn.mock.calls).toEqual([]);
	});

	test('default editable inheritance', async () => {
		const { editor, nestedEditor, r } = await mountNested({
			createNested: (parentEditor: LexicalEditor) =>
				createEditor({
					// this gets overwritten immediately
					editable: false,
					namespace: 'nested',
					nodes: [],
					onError: throwErr,
					parentEditor,
				}),
			parentAriaLabel: 'parent',
			nestedAriaLabel: 'nested',
		});
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('nested');
		expect([...(nestedEditor as any)._nodes.keys()].sort()).toEqual(
			[...(editor as any)._nodes.keys()]
				.filter((k: string) => k !== OctaneDecoratorNode.getType())
				.sort(),
		);
		expect(editor.isEditable()).toBe(true);
		expect(nestedEditor.isEditable()).toBe(true);
		expectHtmlToBeEqual(
			r.container.innerHTML,
			INNER_HTML({ parentLabel: true, nestedLabel: true }),
		);
		expect(warn.mock.calls).toEqual([]);

		editor.setEditable(false);
		await settle();
		expect(editor.isEditable()).toBe(false);
		expect(nestedEditor.isEditable()).toBe(false);
		expectHtmlToBeEqual(
			r.container.innerHTML,
			`
			<div
				contenteditable="false"
				role="textbox"
				spellcheck="true"
				style="user-select: text; white-space: pre-wrap; word-break: break-word"
				aria-autocomplete="none"
				aria-label="parent"
				aria-readonly="true"
				data-lexical-editor="true">
				<p dir="auto"><span data-lexical-text="true">parent</span></p>
				<div contenteditable="false" data-lexical-decorator="true">
					<div
						contenteditable="false"
						role="textbox"
						spellcheck="true"
						style="user-select: text; white-space: pre-wrap; word-break: break-word"
						aria-autocomplete="none"
						aria-label="nested"
						aria-readonly="true"
						data-lexical-editor="true">
						<p dir="auto"><span data-lexical-text="true">nested</span></p>
					</div>
				</div>
			</div>
			`,
		);

		editor.setEditable(true);
		await settle();
		expect(editor.isEditable()).toBe(true);
		expect(nestedEditor.isEditable()).toBe(true);
	});

	test('skipEditableListener', async () => {
		const { editor, nestedEditor, r } = await mountNested({
			createNested: (parentEditor: LexicalEditor) =>
				createEditor({
					editable: false,
					namespace: 'nested',
					nodes: [],
					onError: throwErr,
					parentEditor,
				}),
			skipEditableListener: true,
			parentAriaLabel: 'parent',
			nestedAriaLabel: 'nested',
		});
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('nested');
		expect(editor.isEditable()).toBe(true);
		expect(nestedEditor.isEditable()).toBe(false);
		expectHtmlToBeEqual(
			r.container.innerHTML,
			`
			<div
				contenteditable="true"
				role="textbox"
				spellcheck="true"
				style="user-select: text; white-space: pre-wrap; word-break: break-word"
				aria-label="parent"
				data-lexical-editor="true">
				<p dir="auto"><span data-lexical-text="true">parent</span></p>
				<div contenteditable="false" data-lexical-decorator="true">
					<div
						contenteditable="false"
						role="textbox"
						spellcheck="true"
						style="user-select: text; white-space: pre-wrap; word-break: break-word"
						aria-autocomplete="none"
						aria-label="nested"
						aria-readonly="true"
						data-lexical-editor="true">
						<p dir="auto"><span data-lexical-text="true">nested</span></p>
					</div>
				</div>
			</div>
			`,
		);
		expect(warn.mock.calls).toEqual([]);

		editor.setEditable(false);
		await settle();
		expect(editor.isEditable()).toBe(false);
		expect(nestedEditor.isEditable()).toBe(false);

		editor.setEditable(true);
		await settle();
		expect(editor.isEditable()).toBe(true);
		expect(nestedEditor.isEditable()).toBe(false);
	});

	test('command listener delegation', async () => {
		const DELEGATED_COMMAND = createCommand<unknown>('DELEGATED_COMMAND');
		const $commandListener = vi.fn((_: unknown) => false);
		const register = (currentEditor: LexicalEditor) =>
			mergeRegister(
				currentEditor.registerCommand(
					DELEGATED_COMMAND,
					(payload, dispatchEditor) =>
						$commandListener({
							currentEditor: $getEditor(),
							dispatchEditor,
							payload,
							priority: COMMAND_PRIORITY_CRITICAL,
						}),
					COMMAND_PRIORITY_CRITICAL,
				),
				currentEditor.registerCommand(
					DELEGATED_COMMAND,
					(payload, dispatchEditor) =>
						$commandListener({
							currentEditor: $getEditor(),
							dispatchEditor,
							payload,
							priority: COMMAND_PRIORITY_EDITOR,
						}),
					COMMAND_PRIORITY_EDITOR,
				),
			);

		const { editor, nestedEditor } = await mountNested({
			createNested: (parentEditor: LexicalEditor) =>
				createEditor({ namespace: 'nested', nodes: [], onError: throwErr, parentEditor }),
			skipEditableListener: true,
			register,
		});
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('nested');
		expect(warn.mock.calls).toEqual([]);

		expect(editor.dispatchCommand(DELEGATED_COMMAND, undefined)).toBe(false);
		expect($commandListener.mock.calls).toEqual([
			[
				{
					currentEditor: editor,
					dispatchEditor: editor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
			[
				{
					currentEditor: editor,
					dispatchEditor: editor,
					payload: undefined,
					priority: COMMAND_PRIORITY_EDITOR,
				},
			],
		]);
		$commandListener.mockClear();

		expect(nestedEditor.dispatchCommand(DELEGATED_COMMAND, undefined)).toBe(false);
		expect($commandListener.mock.calls).toEqual([
			[
				{
					currentEditor: nestedEditor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
			[
				{
					currentEditor: editor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
			[
				{
					currentEditor: nestedEditor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_EDITOR,
				},
			],
			[
				{
					currentEditor: editor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_EDITOR,
				},
			],
		]);
		$commandListener.mockClear();

		// Can stop propagation from nested editor
		$commandListener.mockImplementation(
			(opts: any) =>
				opts.dispatchEditor === opts.currentEditor && opts.priority === COMMAND_PRIORITY_EDITOR,
		);
		expect(nestedEditor.dispatchCommand(DELEGATED_COMMAND, undefined)).toBe(true);
		expect($commandListener.mock.calls).toEqual([
			[
				{
					currentEditor: nestedEditor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
			[
				{
					currentEditor: editor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
			[
				{
					currentEditor: nestedEditor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_EDITOR,
				},
			],
		]);
		$commandListener.mockClear();

		// Can stop propagation from parent editor
		$commandListener.mockImplementation((opts: any) => opts.dispatchEditor !== opts.currentEditor);
		expect(nestedEditor.dispatchCommand(DELEGATED_COMMAND, undefined)).toBe(true);
		expect($commandListener.mock.calls).toEqual([
			[
				{
					currentEditor: nestedEditor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
			[
				{
					currentEditor: editor,
					dispatchEditor: nestedEditor,
					payload: undefined,
					priority: COMMAND_PRIORITY_CRITICAL,
				},
			],
		]);
	});

	test('static transform and $config.transform inheritance', async () => {
		const $transform = vi.fn();
		const transform = vi.fn();
		class StaticTransformNode extends TextNode {
			static getType() {
				return 'static-transform';
			}
			static transform() {
				return transform;
			}
		}
		class ConfigTransformNode extends TextNode {
			$config() {
				return this.config('$config-transform', { $transform });
			}
		}

		const { editor, nestedEditor } = await mountNested({
			createNested: () => createEditor(),
			parentNodes: [OctaneDecoratorNode, StaticTransformNode, ConfigTransformNode],
		});
		// namespace inherited
		expect((editor as any)._config.namespace).toBe('parent');
		expect((nestedEditor as any)._config.namespace).toBe('parent');
		// nodes inherited
		expect([...(nestedEditor as any)._nodes.keys()].sort()).toEqual(
			[...(editor as any)._nodes.keys()].sort(),
		);
		for (const { type, fn } of [
			{ fn: transform, type: 'static-transform' },
			{ fn: $transform, type: '$config-transform' },
		]) {
			expect(getRegisteredNode(nestedEditor, type)?.transforms).toEqual(new Set([fn]));
		}
		expect(warn.mock.calls).toEqual([]);
	});
});
