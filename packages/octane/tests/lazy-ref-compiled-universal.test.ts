import { describe, expect, it, vi } from 'vitest';
import * as Universal from '../src/universal.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const renderer = {
	id: 'object',
	module: 'octane/universal',
	target: 'universal',
	text: 'host',
} as const;

describe('compiled universal lazy refs', () => {
	it('preserves distinct ref cells across updates', () => {
		const source = `import { useLazyRef } from 'octane';
			export function Scene(props) @{
				const first = useLazyRef(props.first);
				const second = useLazyRef(props.second);
				<view first={first.current as string} second={second.current as string} />
			}`;
		const { Scene } = loadCompiledFixtureSource(source, {
			id: '/src/lazy.object.tsrx',
			mode: 'client',
			compileOptions: { renderer, hmr: false },
			runtimeModules: { 'octane/universal': Universal },
		});
		const first = vi.fn(() => 'one');
		const second = vi.fn(() => 'two');
		const container = Universal.createObjectContainer();
		const root = Universal.createUniversalRoot(container, Universal.createObjectDriver());
		try {
			root.render(Scene, { first, second });
			root.render(Scene, { first, second });
			expect(container.children[0].props).toMatchObject({ first: 'one', second: 'two' });
			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);
		} finally {
			root.unmount();
		}
	});
});
