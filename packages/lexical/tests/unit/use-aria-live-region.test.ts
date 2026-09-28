import { afterEach, describe, expect, test } from 'vitest';
import { AriaLiveRegionExtension } from '@lexical/a11y';
import { configExtension } from '@lexical/extension';
import { flushEffects, mount } from '../_helpers';
import { AriaLiveRegionFixture } from '../_fixtures/a11y-hooks.tsrx';

type Handle = { announce: (message: string) => void };

// Ported from @lexical/react/src/__tests__/unit/useLexicalAriaLiveRegion.test.tsx (0.51.0).
// Upstream mounts the harness under LexicalExtensionComposer, which
// @octanejs/lexical does not port; the fixture builds the editor with
// buildEditorFromExtensions and provides it through LexicalComposerContext.
describe('useLexicalAriaLiveRegion', () => {
	let r: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		r?.unmount();
		r = null;
		for (const region of Array.from(document.body.querySelectorAll('[aria-live]'))) {
			region.remove();
		}
	});

	function render(extension: unknown = AriaLiveRegionExtension): { current: Handle | null } {
		const handle: { current: Handle | null } = { current: null };
		r = mount(AriaLiveRegionFixture as any, { extension, handle });
		flushEffects();
		return handle;
	}

	function findRegion(): HTMLElement | null {
		return document.body.querySelector<HTMLElement>('[aria-live]');
	}

	test('mounts an aria-live region with polite default and aria-atomic', () => {
		render();
		const region = findRegion();
		expect(region).not.toBeNull();
		expect(region!.getAttribute('aria-live')).toBe('polite');
		expect(region!.getAttribute('aria-atomic')).toBe('true');
		expect(region!.getAttribute('role')).toBe('status');
	});

	test('writes a message into the region when announce is called', () => {
		const ref = render();
		ref.current!.announce('Bold on');
		expect(findRegion()!.textContent).toBe('Bold on');
	});

	test('repeating the same message toggles a zero-width space so SR re-announces', () => {
		const ref = render();
		ref.current!.announce('Italic on');
		expect(findRegion()!.textContent).toBe('Italic on');
		ref.current!.announce('Italic on');
		expect(findRegion()!.textContent).toBe('Italic on​');
	});

	test('politeness=assertive sets aria-live="assertive"', () => {
		render(configExtension(AriaLiveRegionExtension, { politeness: 'assertive' }));
		expect(findRegion()!.getAttribute('aria-live')).toBe('assertive');
	});

	// Octane-specific: the hook returns a stable `announce` (a slot-keyed
	// useCallback over the editor), so a re-render with the same editor keeps
	// the identity the imperative handle captured.
	test('announce is stable across re-renders', () => {
		const handle = render();
		const first = handle.current!.announce;
		r!.update(AriaLiveRegionFixture as any, { extension: AriaLiveRegionExtension, handle });
		flushEffects();
		expect(handle.current!.announce).toBe(first);
		handle.current!.announce('Still works');
		expect(findRegion()!.textContent).toBe('Still works');
	});

	// Octane-specific: unmounting the composer detaches the root and disposes
	// the built editor, which removes the region it created.
	test('removes the region when the editor unmounts', () => {
		render();
		expect(findRegion()).not.toBeNull();
		r!.unmount();
		r = null;
		expect(findRegion()).toBeNull();
	});
});
