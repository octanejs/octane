// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { collectDiagnostics } from 'octane/compiler';
import { mount } from '../../octane/tests/_helpers.js';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { strengthen } from '../dist/strong.js';
import { transformModule } from '../dist/transform.js';

function migrate(body) {
	const source = `import { useState as state, useRef } from 'react';
export function Example({ initial }: { initial: string }) {
	${body}
}`;
	const { code } = transformModule(source, 'example.tsx', { strong: true });
	return strengthen({ collectDiagnostics, from: 'octane/compiler' }, code, 'example.tsrx');
}

it('preserves lazy initial values and removes the superseded import after both fixes', () => {
	const result = migrate(`
		const [first] = state<string>(() => initial);
		const [second] = state(() => initial.toUpperCase());
		return <p>{first + ':' + second}</p>;
	`);
	expect(result.strong).toBe(true);
	expect(result.code).not.toMatch(/\buseState\b/);
	const { Example } = loadCompiledFixtureSource(result.code, {
		id: 'example.tsrx',
		mode: 'client',
	});
	const view = mount(Example, { initial: 'first' });
	try {
		expect(view.find('p').textContent).toBe('first:FIRST');
		view.update(Example, { initial: 'second' });
		expect(view.find('p').textContent).toBe('first:FIRST');
	} finally {
		view.unmount();
	}
});

it.each([
	[
		'ref read in the initializer',
		`const ref = useRef('initial');
		const [value] = state(() => ref.current);
		return <p>{value}</p>;`,
		'OCTANE_STRONG_RENDER_REF_READ',
	],
	[
		'mutation of a nested snapshot',
		`const [value] = state(() => ({ nested: { values: [initial] } }));
		return <button onClick={() => value.nested.values.push('new')}>{value.nested.values[0]}</button>;`,
		'OCTANE_STRONG_SNAPSHOT_MUTATION',
	],
	[
		'initializer whose value is eager',
		`const [value] = state(initial);
		return <p>{value}</p>;`,
		'OCTANE_STRONG_READ_ONLY_STATE',
	],
	[
		'a shadowed target binding',
		`const useInitialValue = () => 'local';
		const [value] = state(() => initial);
		return <p>{value + useInitialValue()}</p>;`,
		'OCTANE_STRONG_READ_ONLY_STATE',
	],
])('retains diagnostics for %s', (_, body, code) => {
	const result = migrate(body);
	expect(result.strong).toBe(false);
	expect(result.blockers.map((blocker) => blocker.code)).toContain(code);
});
