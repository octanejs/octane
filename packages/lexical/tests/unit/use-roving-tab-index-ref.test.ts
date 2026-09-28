import { afterEach, describe, expect, test } from 'vitest';
import { RovingTabIndexExtension } from '@lexical/a11y';
import { flushEffects, mount } from '../_helpers';
import { RovingTabIndexFixture } from '../_fixtures/a11y-hooks.tsrx';

function dispatchKey(target: HTMLElement, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
}

type GroupProps = {
	count?: number;
	orientation?: 'horizontal' | 'vertical' | 'both';
	showGroup?: boolean;
};

// Ported from @lexical/react/src/__tests__/unit/useLexicalRovingTabIndexRef.test.tsx (0.51.0).
// Upstream mounts the Group under LexicalExtensionComposer, which
// @octanejs/lexical does not port; the fixture builds the editor with
// buildEditorFromExtensions and provides it through LexicalComposerContext.
describe('useLexicalRovingTabIndexRef', () => {
	let r: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		r?.unmount();
		r = null;
	});

	function render(props: GroupProps = {}): void {
		if (r === null) {
			r = mount(RovingTabIndexFixture as any, { extension: RovingTabIndexExtension, ...props });
		} else {
			r.update(RovingTabIndexFixture as any, { extension: RovingTabIndexExtension, ...props });
		}
		flushEffects();
	}

	function byId(id: string): HTMLElement {
		const el = r!.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
		if (el === null) {
			throw new Error(`Missing ${id}`);
		}
		return el;
	}

	test('sets tabindex=0 on the first item, -1 on the rest', () => {
		render();
		expect(byId('btn-0').tabIndex).toBe(0);
		expect(byId('btn-1').tabIndex).toBe(-1);
		expect(byId('btn-2').tabIndex).toBe(-1);
	});

	test('ArrowRight moves focus to the next item and updates tabindex', () => {
		render();
		byId('btn-0').focus();
		dispatchKey(byId('btn-0'), 'ArrowRight');
		expect(document.activeElement).toBe(byId('btn-1'));
		expect(byId('btn-1').tabIndex).toBe(0);
		expect(byId('btn-0').tabIndex).toBe(-1);
	});

	test('ArrowLeft wraps from the first item to the last', () => {
		render();
		byId('btn-0').focus();
		dispatchKey(byId('btn-0'), 'ArrowLeft');
		expect(document.activeElement).toBe(byId('btn-2'));
	});

	test('ArrowRight wraps from the last item to the first', () => {
		render();
		byId('btn-2').focus();
		dispatchKey(byId('btn-2'), 'ArrowRight');
		expect(document.activeElement).toBe(byId('btn-0'));
	});

	test('Home jumps to the first item, End to the last', () => {
		render();
		byId('btn-1').focus();
		dispatchKey(byId('btn-1'), 'Home');
		expect(document.activeElement).toBe(byId('btn-0'));
		dispatchKey(byId('btn-0'), 'End');
		expect(document.activeElement).toBe(byId('btn-2'));
	});

	test('vertical orientation ignores ArrowLeft/Right', () => {
		render({ orientation: 'vertical' });
		byId('btn-0').focus();
		dispatchKey(byId('btn-0'), 'ArrowRight');
		expect(document.activeElement).toBe(byId('btn-0'));
		dispatchKey(byId('btn-0'), 'ArrowDown');
		expect(document.activeElement).toBe(byId('btn-1'));
	});

	test('re-registers with new options when deps change but the node stays mounted', () => {
		render({ orientation: 'horizontal' });
		const groupBefore = byId('group');
		byId('btn-0').focus();
		// Horizontal: ArrowRight moves focus.
		dispatchKey(byId('btn-0'), 'ArrowRight');
		expect(document.activeElement).toBe(byId('btn-1'));

		// Re-render with a different orientation. The same <div> node is reused,
		// so only the ref-callback identity changes (the `orientation` dep).
		// Octane, like React, calls the previous callback with null — disposing
		// the old registration — and the new one with the node, re-registering
		// with the new options.
		render({ orientation: 'vertical' });
		expect(byId('group')).toBe(groupBefore); // same DOM node, not remounted

		byId('btn-0').focus();
		// If the old horizontal registration had leaked, its keydown listener
		// would still move focus here. It must be gone: ArrowRight is now ignored
		// and only the new vertical registration responds to ArrowDown.
		dispatchKey(byId('btn-0'), 'ArrowRight');
		expect(document.activeElement).toBe(byId('btn-0'));
		dispatchKey(byId('btn-0'), 'ArrowDown');
		expect(document.activeElement).toBe(byId('btn-1'));
	});

	test('does nothing when the group is empty', () => {
		render({ count: 0 });
		const group = byId('group');
		expect(() => dispatchKey(group, 'ArrowRight')).not.toThrow();
	});

	// Octane-specific: detaching the container (while the editor stays
	// mounted) calls the callback ref with null, which releases the
	// registration; its teardown restores every item to tabindex 0.
	test('unregisters when the container unmounts', () => {
		render();
		const items = [byId('btn-0'), byId('btn-1'), byId('btn-2')];
		expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);
		render({ showGroup: false });
		expect(r!.container.querySelector('[data-testid="group"]')).toBeNull();
		expect(items.map((item) => item.tabIndex)).toEqual([0, 0, 0]);
	});
});
