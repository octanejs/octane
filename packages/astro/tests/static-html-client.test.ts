/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, flushSync } from 'octane';
import createHydrator from '../src/client.js';

function Host(props: { label: string; children?: unknown }) {
	return createElement(
		'div',
		{ id: 'host' },
		createElement('span', { id: 'host-label' }, props.label),
		props.children,
	);
}

describe('StaticHtml client bailout', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('preserves nested slot DOM identity across hydrator re-invokes', () => {
		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		document.body.append(island);

		const hydrate = createHydrator(island);
		const slotted = '<em id="slot-node">from-astro</em>';
		hydrate(Host, { label: 'one' }, { default: slotted }, { client: 'only' });

		const slotNode = island.querySelector('#slot-node');
		expect(slotNode?.textContent).toBe('from-astro');

		// Fresh slot HTML string, same content — without memo bailout, rewriting
		// dangerouslySetInnerHTML would destroy the nested node.
		hydrate(Host, { label: 'two' }, { default: slotted }, { client: 'only' });
		flushSync(() => {});

		expect(island.querySelector('#host-label')?.textContent).toBe('two');
		expect(island.querySelector('#slot-node')).toBe(slotNode);
		expect(slotNode?.isConnected).toBe(true);
	});
});
