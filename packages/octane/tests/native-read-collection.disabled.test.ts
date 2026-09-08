import { describe, expect, it } from 'vitest';
import { createElement, flushSync } from '../src/runtime.js';
import { createScope } from '../src/signals/index.js';
import { mount } from './_helpers.js';

// No native compiler fixture or capability bootstrap may enter this file. Test
// isolation keeps this renderer instance representative of the default build.
describe('ordinary rendering without native read collection', () => {
	it('samples a native handle without subscribing the component', () => {
		const scope = createScope({ scopeKey: 'native-collection-disabled' });
		const count$ = scope.signal$('count', 1);
		function Reader() {
			return createElement('p', null, String(count$.get()));
		}
		const rendered = mount(Reader);
		try {
			expect(rendered.find('p').textContent).toBe('1');
			flushSync(() => count$.set(2));
			expect(rendered.find('p').textContent).toBe('1');
			expect(scope.inspect().nodes[0].subscribers).toBe(0);
			rendered.update(Reader);
			expect(rendered.find('p').textContent).toBe('2');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});
});
