import { describe, expect, it } from 'vitest';
import { createScopedElement, renderToString } from 'octane/server';

// A scoped component descriptor defers its children: they resolve in the scope
// of the component that reads them, never in the parent that created them.
describe('server scoped component children', () => {
	it('resolves deferred children only inside the component that reads them', () => {
		const resolvedIn: string[] = [];
		let current = 'parent';
		function Card(props: { children?: unknown }) {
			current = 'card';
			const children = props.children;
			current = 'parent';
			return children as any;
		}
		function App() {
			return createScopedElement(Card, null, () => {
				resolvedIn.push(current);
				return 'body';
			});
		}
		for (const entry of [App, createScopedElement(App, null, () => null)] as const) {
			resolvedIn.length = 0;
			const { html } = renderToString(entry as any);
			expect(html).toContain('body');
			expect(resolvedIn).toEqual(['card']);
		}
	});
});
