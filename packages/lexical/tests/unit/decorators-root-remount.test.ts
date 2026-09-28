import { describe, test, expect, afterEach } from 'vitest';
import { $getNodeByKey, type LexicalEditor, type NodeKey } from 'lexical';
import { mount, flushEffects, nextPaint } from '../_helpers';
import {
	DecoratorRemountEditor,
	$isLabelDecoratorNode,
} from '../_fixtures/decorator-remount-editor.tsrx';

type MountResult = ReturnType<typeof mount>;

// Ported from @lexical/react/src/__tests__/unit/UseDecoratorsRootRemount.test.tsx (0.51.0).
//
// Only the first describe ('useDecorators root remount': LexicalComposer +
// RichTextPlugin, i.e. the legacy Decorators path in
// src/shared/LexicalDecorators.tsrx) is ported. The second describe
// ('useReactDecorators root remount') drives the same scenario through
// LexicalExtensionComposer + RichTextExtension, which @octanejs/lexical does not
// port.
//
// The second test below is Octane-only. In the upstream scenario the reattach's
// full reconcile calls decorate() again, and a fresh element changes the
// decorator map, so the decorator subscription alone already re-renders the
// portal. A decorator that returns an identical element keeps the map unchanged,
// which leaves the root-element subscription as the only trigger.

async function settle() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
		flushEffects();
	}
}

describe('useDecorators root remount', () => {
	let mounted: MountResult | null = null;

	afterEach(() => {
		if (mounted) {
			mounted.unmount();
			mounted = null;
		}
	});

	async function runRemountScenario(stable: boolean) {
		let editor!: LexicalEditor;
		let decoratorKey!: NodeKey;

		mounted = mount(DecoratorRemountEditor as any, {
			stable,
			onInit: (e: LexicalEditor, key: NodeKey) => {
				editor = e;
				decoratorKey = key;
			},
		});
		const container = mounted.container;
		await settle();

		expect(editor).toBeDefined();
		expect(decoratorKey).toBeDefined();
		expect(container.querySelector('[data-testid="decorator-portal"]')?.textContent).toBe('hello');

		const previousRoot = editor.getRootElement();
		expect(previousRoot).not.toBeNull();

		let decoratorMapChanges = 0;
		const removeDecoratorListener = editor.registerDecoratorListener(() => {
			decoratorMapChanges++;
		});

		// Detach the root, then refresh decorators while getElementByKey is null so
		// portal creation is skipped (same race as remount-before-root-attach).
		editor.setRootElement(null);
		await settle();

		editor.update(() => {
			const node = $getNodeByKey(decoratorKey);
			if (!$isLabelDecoratorNode(node)) {
				throw new Error('expected the decorator node');
			}
			// Force a decorator refresh without changing rendered content.
			(node as unknown as { setLabel(label: string): void }).setLabel('hello');
		});
		await settle();

		expect(container.querySelector('[data-testid="decorator-portal"]')).toBeNull();

		const nextRoot = document.createElement('div');
		nextRoot.contentEditable = 'true';
		container.appendChild(nextRoot);

		editor.setRootElement(nextRoot);
		await settle();
		removeDecoratorListener();

		expect(editor.getRootElement()).toBe(nextRoot);
		expect(editor.getRootElement()).not.toBe(previousRoot);
		expect(container.querySelector('[data-testid="decorator-portal"]')?.textContent).toBe('hello');
		// The portal landed in the decorator's element under the NEW root.
		const portal = container.querySelector('[data-testid="decorator-portal"]')!;
		expect(nextRoot.contains(portal)).toBe(true);
		expect(portal.parentElement).toBe(editor.getElementByKey(decoratorKey));

		// Release the manually attached root before unmount.
		editor.setRootElement(null);
		nextRoot.remove();
		await settle();

		return decoratorMapChanges;
	}

	test('recreates decorator portals after root detach/attach without decorator map changes', async () => {
		await runRemountScenario(false);
	});

	test('recreates decorator portals when decorate() returns an identical element (Octane)', async () => {
		const decoratorMapChanges = await runRemountScenario(true);
		// Precondition: the decorator map never changed, so only the root-element
		// subscription could have re-derived the portal.
		expect(decoratorMapChanges).toBe(0);
	});
});
