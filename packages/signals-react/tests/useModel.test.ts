// Per packages/signals-react/upstream/canonical/runtime/test/browser/useModel.test.tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement as h } from 'octane';
import { ModelCounter } from './_fixtures/model.tsrx';

afterEach(cleanup);

describe('useModel', function useModelSuite() {
	it('creates model instance using model constructor', function constructor() {
		const view = render(h(ModelCounter));
		const button = view.container.querySelector('button')!;
		expect(button.textContent).toBe('0');
		fireEvent.click(button);
		expect(button.textContent).toBe('1');
	});
});
