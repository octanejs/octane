/**
 * Embedded components + the components-mapping surface. Provider semantics are
 * ports of @mdx-js/react (lib/index.js + test/index.jsx, v3): context merge,
 * function-form `components`, `disableParentContext`, and MDX's `wrapper`
 * layout convention.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'octane';
import { render, renderHook, cleanup, fireEvent, screen } from '@octanejs/testing-library';
import { MDXProvider, useMDXComponents, type MDXComponents } from '@octanejs/mdx';
// @ts-expect-error — .mdx modules are produced by the vite plugin; no ambient types in tests.
import ComponentsDoc, { answer } from './_fixtures/components.mdx';
// @ts-expect-error — see above.
import BasicDoc from './_fixtures/basic.mdx';

afterEach(cleanup);

// Mapping components are plain-`.ts` value-position components (host
// descriptors returned from a function) — the same authoring form RTL tests use.
function FancyH1(props: { children?: unknown }): unknown {
	return createElement('h1', { className: 'fancy', 'data-testid': 'fancy-h1' }, props.children);
}
function Layout(props: { children?: unknown }): unknown {
	return createElement('main', { 'data-testid': 'layout' }, props.children);
}

describe('embedded octane components', () => {
	it('renders an imported .tsrx component and keeps it interactive', () => {
		render(ComponentsDoc);
		const button = screen.getByTestId('counter');
		expect(button.textContent).toBe('count: 2');
		fireEvent.click(button);
		expect(button.textContent).toBe('count: 3');
	});

	it('evaluates inline expressions and re-exports mdx `export`s', () => {
		const { container } = render(ComponentsDoc);
		expect(answer).toBe(40);
		expect(container.textContent).toContain('The answer is 42.');
	});
});

describe('components mapping', () => {
	it('maps a markdown element to a component via the components prop', () => {
		render(BasicDoc, { props: { components: { h1: FancyH1 } } });
		expect(screen.getByTestId('fancy-h1').textContent).toBe('Hello, MDX');
	});

	it('maps a markdown element to another host tag via a string mapping', () => {
		const { container } = render(BasicDoc, { props: { components: { em: 'i' } } });
		expect(container.querySelector('i')?.textContent).toBe('emphasis');
		expect(container.querySelector('em')).toBeNull();
	});

	// Per @mdx-js/react lib/index.js: MDXProvider provides the mapping via context.
	it('maps components via MDXProvider', () => {
		render(MDXProvider, {
			props: { components: { h1: FancyH1 }, children: createElement(BasicDoc) },
		});
		expect(screen.getByTestId('fancy-h1').textContent).toBe('Hello, MDX');
	});

	// Per @mdx-js/react lib/index.js: nested providers MERGE (child over parent).
	it('merges nested providers', () => {
		const inner = createElement(MDXProvider, {
			components: { h1: FancyH1 },
			children: createElement(BasicDoc),
		});
		const { container } = render(MDXProvider, {
			props: { components: { em: 'i' }, children: inner },
		});
		expect(screen.getByTestId('fancy-h1')).toBeTruthy();
		expect(container.querySelector('i')?.textContent).toBe('emphasis');
	});

	// Per @mdx-js/react lib/index.js: disableParentContext ignores the inherited mapping.
	it('disableParentContext ignores the parent mapping', () => {
		const inner = createElement(MDXProvider, {
			components: { h1: FancyH1 },
			disableParentContext: true,
			children: createElement(BasicDoc),
		});
		const { container } = render(MDXProvider, {
			props: { components: { em: 'i' }, children: inner },
		});
		expect(screen.getByTestId('fancy-h1')).toBeTruthy();
		expect(container.querySelector('i')).toBeNull();
		expect(container.querySelector('em')?.textContent).toBe('emphasis');
	});

	// Per @mdx-js/react lib/index.js: `components` may be a function of the
	// inherited mapping — its return REPLACES the merge.
	it('accepts a function form that receives the inherited mapping', () => {
		const inherited: MDXComponents[] = [];
		const inner = createElement(MDXProvider, {
			components: (parent: MDXComponents) => {
				inherited.push(parent);
				return { h1: FancyH1 };
			},
			children: createElement(BasicDoc),
		});
		const { container } = render(MDXProvider, {
			props: { components: { em: 'i' }, children: inner },
		});
		expect(inherited[0]).toMatchObject({ em: 'i' });
		expect(screen.getByTestId('fancy-h1')).toBeTruthy();
		// Function return replaced the merge — the parent's em mapping is gone.
		expect(container.querySelector('i')).toBeNull();
	});

	// MDX convention: the `wrapper` component is the document layout (receives
	// the document as children).
	it('renders the wrapper component as the document layout', () => {
		render(BasicDoc, { props: { components: { wrapper: Layout } } });
		const layout = screen.getByTestId('layout');
		expect(layout.tagName).toBe('MAIN');
		expect(layout.querySelector('h1')?.textContent).toBe('Hello, MDX');
	});
});

describe('useMDXComponents', () => {
	// Per @mdx-js/react lib/index.js: context mapping merged with the argument.
	it('merges the provider mapping with the argument', () => {
		const wrapper = (props: { children?: unknown }): unknown =>
			createElement(MDXProvider, { components: { em: 'i' }, children: props.children });
		const { result } = renderHook(() => useMDXComponents({ h1: FancyH1 }), { wrapper });
		expect(result.current.em).toBe('i');
		expect(result.current.h1).toBe(FancyH1);
	});
});
