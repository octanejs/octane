import { expect, it } from 'vitest';
import { createElement, createRoot, flushSync } from 'octane';
import { Frame } from './_fixtures/opaque-signal-child-host.js';

// Nothing in this file or the renderer module imports signals, so no compiled
// module enables signal bindings. The handle arrives from a module loaded after
// the first render.
it('renders and updates a handle passed through an opaque child by a lazily imported module', async () => {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(createElement(Frame, null, 'idle'));
	expect(container.innerHTML).toBe('<p>idle</p>');

	const { count$, scope } = await import('./_fixtures/opaque-signal-child-source.js');
	try {
		flushSync(() => root.render(createElement(Frame, null, count$)));
		const host = container.querySelector('p')!;
		expect(host.textContent).toBe('1');

		flushSync(() => count$.set(2));
		expect(container.querySelector('p')).toBe(host);
		expect(host.textContent).toBe('2');

		root.unmount();
		expect(scope.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
	} finally {
		scope.dispose();
		container.remove();
	}
});
