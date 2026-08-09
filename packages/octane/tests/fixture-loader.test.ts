/**
 * Loader-level contract: `loadCompiledFixtureSource` must keep every
 * `export function` as a real module-scope function declaration. Compiled
 * modules reference exported components by name after their declaration —
 * the compiler's module tail stamps metadata on them, and sibling components
 * call each other directly — so a rewrite into a function *expression*
 * assignment (which has no module-scope binding) makes evaluation throw
 * `ReferenceError: <Component> is not defined` even though the compiled
 * module is correct under a real bundler.
 */
import { describe, expect, it } from 'vitest';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Two exported components where the second renders the first by name; both
// are single-root, so the compiled module tail references both names.
const source = `
export function Item({ label }: { label: string }) {
	return <li>{label as string}</li>;
}

export function List() {
	return (
		<ul>
			<Item label="a" />
			<Item label="b" />
		</ul>
	);
}
`;

describe('loadCompiledFixtureSource', () => {
	it('evaluates client modules whose tail and siblings reference exported components by name', () => {
		const mod = loadCompiledFixtureSource(source, {
			id: '/packages/octane/tests/_fixtures/fixture-loader-exports.tsx',
			mode: 'client',
		});

		expect(typeof mod.Item).toBe('function');
		expect(typeof mod.List).toBe('function');

		const { container, unmount } = mount(mod.List);
		try {
			const items = Array.from(container.querySelectorAll('ul > li'), (li) => li.textContent);
			expect(items).toEqual(['a', 'b']);
		} finally {
			unmount();
		}
	});
});
