import { describe, it, expect, vi } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { MenuAnchorProbe } from '../_fixtures/menu-anchor-probe.tsrx';

// Only force CAN_USE_DOM; keep every other real `lexical` export so modules
// pulled in transitively still work (per the upstream test).
vi.mock('lexical', async (importOriginal) => ({
	...(await importOriginal<typeof import('lexical')>()),
	CAN_USE_DOM: false,
}));

// The probe has no composer — mock the context to hand out a standalone editor.
vi.mock('@octanejs/lexical/LexicalComposerContext', async () => {
	const { createEditor } = await import('lexical');
	return {
		useLexicalComposerContext: () => [
			createEditor({
				namespace: 'test',
				onError: (e: unknown) => {
					throw e;
				},
			}),
		],
	};
});

// Ported from @lexical/react/src/__tests__/unit/useMenuAnchorRef.test.tsx.
describe('useMenuAnchorRef', () => {
	it('should return null if CAN_USE_DOM is false', () => {
		let anchorElementRef: any;
		const r = mount(MenuAnchorProbe as any, {
			resolution: null,
			setResolution: vi.fn(),
			className: 'some-class',
			parent: undefined,
			includeYOffset: true,
			onRef: (ref: any) => (anchorElementRef = ref),
		});
		flushEffects();
		expect(anchorElementRef.current).toBeNull();
		r.unmount();
	});
});
