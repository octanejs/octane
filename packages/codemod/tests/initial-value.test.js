// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { collectDiagnostics } from 'octane/compiler';
import { renderToStaticMarkup } from 'octane/server';
import { mount } from '../../octane/tests/_helpers.js';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { strengthen } from '../dist/strong.js';
import { transformModule } from '../dist/transform.js';

function migrate(body, props = '{ initial }: { initial: string }') {
	const source = `import { useState as state, useRef } from 'react';
export function Example(${props}) {
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

it.each(['value', 'factory'])(
	'evaluates eager %s inputs on every render and keeps the initial result',
	(kind) => {
		const result = migrate(
			`const [value] = state(source.input); return <p>{value}</p>;`,
			'{ source }: { source: { input: string | (() => string) } }',
		);
		expect(result.strong).toBe(true);
		const id = 'example.tsrx';
		const { Example: ServerExample } = loadCompiledFixtureSource(result.code, {
			id,
			mode: 'server',
		});
		const { Example } = loadCompiledFixtureSource(result.code, { id, mode: 'client' });
		const firstFactory = vi.fn(function () {
			expect(this).toBeUndefined();
			return 'first';
		});
		const nextFactory = vi.fn(() => 'next');
		const firstRead = vi.fn(() => (kind === 'factory' ? firstFactory : 'first'));
		const nextRead = vi.fn(() => (kind === 'factory' ? 'next' : nextFactory));
		const first = {
			source: {
				get input() {
					return firstRead();
				},
			},
		};
		const next = {
			source: {
				get input() {
					return nextRead();
				},
			},
		};
		expect(renderToStaticMarkup(ServerExample, first).html).toContain('<p>first</p>');
		const view = mount(Example, first);
		try {
			expect(view.find('p').textContent).toBe('first');
			view.update(Example, next);
			expect(view.find('p').textContent).toBe('first');
			expect(firstRead).toHaveBeenCalledTimes(2);
			expect(nextRead).toHaveBeenCalledTimes(1);
			expect(firstFactory).toHaveBeenCalledTimes(kind === 'factory' ? 2 : 0);
			expect(nextFactory).not.toHaveBeenCalled();
		} finally {
			view.unmount();
		}
	},
);

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
		'spread arguments',
		`const args: [string] = [initial];
		const [value] = state(...args);
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
