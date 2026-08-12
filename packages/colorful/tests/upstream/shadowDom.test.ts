import { expect, it } from 'vitest';
import { createRoot, flushSync } from 'octane';
import { HexHarness } from './_fixtures/RuntimeHarness.tsrx';

// Per packages/react-colorful/upstream/tag/tests/shadowDom.test.js

it('Injects styles into the closest ShadowRoot when mounted inside one', function injectsIntoShadowRoot() {
	const host = document.createElement('div');
	document.body.appendChild(host);
	const shadow = host.attachShadow({ mode: 'open' });
	const mount = document.createElement('div');
	shadow.appendChild(mount);

	const root = createRoot(mount);
	root.render(HexHarness, { color: '#F00' });
	flushSync(function flush() {});

	expect(shadow.querySelector('style')).not.toBeNull();
	root.unmount();
	host.remove();
});
