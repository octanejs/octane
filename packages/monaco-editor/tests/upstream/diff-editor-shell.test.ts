import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, loader, mount, settle } from '../_helpers';
import { DiffEditorFixture } from '../_fixtures/upstream.tsrx';

beforeEach(() => {
	loader.__reset();
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('<DiffEditor />', () => {
	// Per upstream/src/DiffEditor/index.spec.tsx:6
	// @parity-case runtime:eebf1e6c3b2ed5c0
	it('should check render with snapshot', async () => {
		const view = mount(DiffEditorFixture, {
			original: 'a',
			modified: 'b',
		});
		try {
			expect(view.container.querySelector('section')).toBeTruthy();
			expect(view.container.textContent).toContain('Loading...');
			await settle();
			expect(view.container.querySelector('[data-monaco-diff-ready="true"]')).toBeTruthy();
		} finally {
			act(() => view.unmount());
		}
	});
});
