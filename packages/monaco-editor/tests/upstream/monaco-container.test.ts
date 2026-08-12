import { afterEach, describe, expect, it } from 'vitest';
import { act, mount } from '../_helpers';
import { MonacoContainerFixture } from '../_fixtures/upstream.tsrx';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('<MonacoContainer />', () => {
	// Per upstream/src/MonacoContainer/index.spec.tsx:6
	// OCTANE DIVERGENCE[container-ref][runtime:01c65bf4eb0a9c0a]: pass ref= instead of upstream _ref=
	// @parity-case runtime:01c65bf4eb0a9c0a
	it('should check render with snapshot', () => {
		const ref: { current: HTMLDivElement | null } = { current: null };
		const view = mount(MonacoContainerFixture, {
			width: '100%',
			height: '100vh',
			ref,
			loading: 'loading...',
			isEditorReady: false,
		});
		try {
			expect(view.container.innerHTML).toContain('loading...');
			expect(view.container.querySelector('section')).toBeTruthy();
			const host = view.container.querySelector('section > div:last-child') as HTMLElement;
			expect(host.style.display).toBe('none');
			expect(ref.current).toBe(host);
		} finally {
			act(() => view.unmount());
		}
	});
});
