import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { makeOctaneCompatControl } from './octane-compat-control.js';

/** The measured library is a real, live public OctaneCompat consumer. */
export async function verifyOctaneCompatControl() {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	let cleanups = 0;
	const cleanup = () => {
		cleanups++;
	};
	flushSync(() => root.render(makeOctaneCompatControl('before', cleanup)));
	const button = container.querySelector('button');
	if (String(button?.textContent) !== 'before') throw new Error('OctaneCompat control mount');
	flushSync(() => root.render(makeOctaneCompatControl('after', cleanup)));
	if (container.querySelector('button') !== button || button?.textContent !== 'after') {
		throw new Error('OctaneCompat control update identity');
	}
	flushSync(() => root.unmount());
	// OctaneCompat publishes disposal in the commit's microtask, not a timer.
	await Promise.resolve();
	if (cleanups !== 1 || container.childNodes.length !== 0)
		throw new Error('OctaneCompat control cleanup');
	container.remove();
	return { mount: 'before', update: 'after', identityPreserved: true, cleanups };
}
