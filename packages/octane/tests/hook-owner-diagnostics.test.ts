import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync } from '../src/index.js';
// Load the fixture loader at collection time; the copy below re-imports it from cache.
import { loadCompiledFixtureSource } from './_server-fixture.js';

// A component compiled against a second loaded copy of Octane imports that copy's
// hooks and octane/internal/client, while this copy's root renders it (#2287).
const widgets = {
	'a direct hook': `"use strong"; import { useState } from 'octane';
		export function Widget() @{ const [value] = useState('ready'); <span>{value}</span>; }`,
	'a custom hook': `"use strong"; import { useState } from 'octane';
		function useValue() { const [value] = useState('ready'); return value; }
		export function Widget() @{ const value = useValue(); <span>{value}</span>; }`,
};

let copy: {
	runtime: typeof import('../src/index.js');
	load: typeof loadCompiledFixtureSource;
};

beforeAll(async () => {
	vi.resetModules();
	const [runtime, fixtures] = await Promise.all([
		import('../src/index.js'),
		import('./_server-fixture.js'),
	]);
	copy = { runtime, load: fixtures.loadCompiledFixtureSource };
}, 30_000);

describe.each(Object.entries(widgets))('a component calling %s', (_name, source) => {
	const loadWidget = () => copy.load(source, { id: 'widget.tsrx', mode: 'client' })['Widget'];

	it('names a duplicate Octane copy when another copy renders it', () => {
		const container = document.createElement('div');
		const errors: unknown[] = [];
		const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
		try {
			flushSync(() => root.render(loadWidget(), {}));
			expect(container.textContent).toBe('');
			expect(errors).toHaveLength(1);
			expect(errors[0]).not.toBeInstanceOf(TypeError);
			expect(String(errors[0])).toMatch(/more than one copy of Octane, even at the same version/);
			expect(String(errors[0])).toMatch(/octane\/internal\/client/);
		} finally {
			root.unmount();
		}
	});

	it('renders under the root of its own copy', () => {
		const container = document.createElement('div');
		const root = copy.runtime.createRoot(container);
		try {
			copy.runtime.flushSync(() => root.render(loadWidget(), {}));
			expect(container.textContent).toBe('ready');
		} finally {
			root.unmount();
		}
	});
});
