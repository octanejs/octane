import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEditor, type LexicalEditor } from 'lexical';
import { mount, flushEffects } from '../_helpers';
import { MenuAnchorProbe } from '../_fixtures/menu-anchor-probe.tsrx';

let shadowEditor: LexicalEditor;
let shadowRootElement: HTMLDivElement;
let shadowRoot: ShadowRoot;

// The probe has no composer — the mocked context hands out the shadow editor.
vi.mock('@octanejs/lexical/LexicalComposerContext', () => ({
	useLexicalComposerContext: () => [shadowEditor],
}));

// Ported from @lexical/react/src/__tests__/unit/useMenuAnchorRef.shadow.test.tsx.
describe('useMenuAnchorRef shadow DOM', () => {
	beforeEach(() => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		shadowRoot = host.attachShadow({ mode: 'open' });
		shadowRootElement = document.createElement('div');
		shadowRootElement.contentEditable = 'true';
		shadowRoot.appendChild(shadowRootElement);

		shadowEditor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});
		shadowEditor.setRootElement(shadowRootElement);
	});

	afterEach(() => {
		shadowRootElement.remove();
		(shadowRoot.host as HTMLElement).remove();
		vi.clearAllMocks();
	});

	it('appends anchor to the shadow root when no explicit parent is provided', () => {
		let ref: any;
		const r = mount(MenuAnchorProbe as any, {
			setResolution: vi.fn(),
			onRef: (x: any) => (ref = x),
		});
		flushEffects();

		expect(ref).toBeDefined();
		const anchor = ref.current as HTMLElement | null;
		expect(anchor).not.toBeNull();
		expect(anchor!.getRootNode()).toBe(shadowRoot);
		expect(document.body.contains(anchor!)).toBe(false);
		r.unmount();
	});

	it('removes anchor from shadow root on unmount', () => {
		let ref: any;
		const r = mount(MenuAnchorProbe as any, {
			setResolution: vi.fn(),
			onRef: (x: any) => (ref = x),
		});
		flushEffects();

		const anchor = ref.current as HTMLElement | null;
		expect(anchor).not.toBeNull();
		expect(shadowRoot.contains(anchor!)).toBe(true);

		r.unmount();
		flushEffects();
		expect(shadowRoot.contains(anchor!)).toBe(false);
	});

	it('uses explicit parent even when editor is in shadow', () => {
		const explicitParent = document.createElement('div');
		document.body.appendChild(explicitParent);
		let ref: any;
		const r = mount(MenuAnchorProbe as any, {
			setResolution: vi.fn(),
			parent: explicitParent,
			onRef: (x: any) => (ref = x),
		});
		flushEffects();

		const anchor = ref.current as HTMLElement | null;
		expect(anchor).not.toBeNull();
		expect(explicitParent.contains(anchor!)).toBe(true);
		r.unmount();
		explicitParent.remove();
	});
});
