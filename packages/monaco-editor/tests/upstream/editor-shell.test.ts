import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, loader, mount, settle } from '../_helpers';
import { EditorFixture } from '../_fixtures/upstream.tsrx';

beforeEach(() => {
	loader.__reset();
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('<Editor />', () => {
	// Per upstream/src/Editor/index.spec.tsx:6
	// @parity-case runtime:9792912731e9c20e
	it('should check render with snapshot', async () => {
		const view = mount(EditorFixture, {});
		try {
			expect(view.container.querySelector('section')).toBeTruthy();
			expect(view.container.textContent).toContain('Loading...');
			await settle();
			expect(view.container.querySelector('[data-monaco-ready="true"]')).toBeTruthy();
		} finally {
			act(() => view.unmount());
		}
	});
});
