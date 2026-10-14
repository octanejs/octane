/**
 * Embedded components + the components-mapping surface. Provider semantics are
 * ports of @mdx-js/react (lib/index.js + test/index.jsx, v3): context merge,
 * function-form `components`, `disableParentContext`, and MDX's `wrapper`
 * layout convention.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'octane';
import * as Octane from 'octane';
import * as Provider from '@octanejs/mdx';
import { compileMdxSync } from '@octanejs/mdx/compile';
import Counter from './_fixtures/counter.tsrx';
import { evalModuleCode } from './_helpers';
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
	it.each([undefined, ['code']])(
		'preserves scalar code children with overridable tags %j',
		(overridableTags) => {
			const text = '// keep\n/* comment */\n<&>{}\n\tindent\n';
			const { code } = compileMdxSync('```txt\n' + text + '```', '/docs/code.mdx', {
				strong: true,
				overridableTags,
			});
			const Doc = evalModuleCode(code, { octane: Octane, '@octanejs/mdx': Provider }).default;
			let observed: unknown;
			function Code(props: { children?: unknown }) {
				observed = props.children;
				return createElement('code', null, props.children);
			}
			const { container } = render(Doc, { props: { components: { code: Code } } });
			expect(typeof observed).toBe('string');
			expect(observed).toBe(text);
			expect(container.querySelector('pre > code')?.textContent).toBe(text);
		},
	);

	it('keeps authored component references dynamic when generated hosts are fixed', () => {
		const { code } = compileMdxSync(
			'export const _components = { h1: "h4" };\n\n# Heading\n\n<_components.h1>Explicit</_components.h1>',
			'/docs/explicit.mdx',
			{
				strong: true,
				overridableTags: [],
			},
		);
		const Doc = evalModuleCode(code, { octane: Octane, '@octanejs/mdx': Provider }).default;
		const { container } = render(Doc, { props: { components: { h1: 'h3' } } });
		expect(container.querySelector('h1')?.textContent).toBe('Heading');
		expect(container.querySelector('h3')?.textContent).toBe('Explicit');
	});

	it.each([undefined, ['h1'], []])(
		'preserves mapping precedence and child state with overridable tags %j',
		(overridableTags) => {
			const source = `import Counter from './counter.tsrx';

# Heading

A *word*.

<h1>Literal</h1>
<Counter start={2} />
<Widget>Named</Widget>
`;
			const { code } = compileMdxSync(source, '/docs/overrides.mdx', {
				strong: true,
				overridableTags,
			});
			const Doc = evalModuleCode(code, {
				octane: Octane,
				'@octanejs/mdx': Provider,
				'./counter.tsrx': { default: Counter },
			}).default;
			const propsMapping = {
				h1: 'h3',
				em: 'b',
				Widget: 'small',
				Counter: 'aside',
				wrapper: Layout,
			};
			const { container, rerender } = render(MDXProvider, {
				props: {
					components: { h1: 'h2', em: 'i', Widget: 'strong', wrapper: 'section' },
					children: createElement(Doc, { components: propsMapping }),
				},
			});
			const headingTag = overridableTags?.length === 0 ? 'h1' : 'h3';
			expect(container.querySelector(headingTag)?.textContent).toBe('Heading');
			expect(
				[...container.querySelectorAll('h1')].some((node) => node.textContent === 'Literal'),
			).toBe(true);
			expect(container.querySelector(overridableTags === undefined ? 'b' : 'em')?.textContent).toBe(
				'word',
			);
			expect(container.querySelector('small')?.textContent).toBe('Named');
			expect(container.querySelector('section')).toBeNull();
			const layout = screen.getByTestId('layout');
			const button = screen.getByTestId('counter');
			fireEvent.click(button);
			expect(button.textContent).toBe('count: 3');

			const { h1: _, ...remaining } = propsMapping;
			rerender(MDXProvider, {
				props: {
					components: { h1: 'h4' },
					children: createElement(Doc, { components: remaining }),
				},
			});
			expect(
				container.querySelector(overridableTags?.length === 0 ? 'h1' : 'h4')?.textContent,
			).toBe('Heading');
			expect(screen.getByTestId('layout')).toBe(layout);
			expect(screen.getByTestId('counter')).toBe(button);
			expect(button.textContent).toBe('count: 3');
			fireEvent.click(button);
			expect(button.textContent).toBe('count: 4');
		},
	);

	it('keeps an explicit document layout ahead of a mapped wrapper', () => {
		const { code } = compileMdxSync(
			`export default function Layout(props) { return <article>{props.children}</article> }\n\n# Heading`,
			'/docs/layout.mdx',
			{ overridableTags: [] },
		);
		const Doc = evalModuleCode(code, { octane: Octane, '@octanejs/mdx': Provider }).default;
		const { container } = render(Doc, { props: { components: { wrapper: 'main', h1: 'h2' } } });
		expect(container.querySelector('article > h1')?.textContent).toBe('Heading');
		expect(container.querySelector('main')).toBeNull();
	});

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

	it('updates inherited mappings without remounting stable children', () => {
		const children = createElement(MDXProvider, {
			components: { wrapper: Layout },
			children: createElement(ComponentsDoc),
		});
		const { container, rerender } = render(MDXProvider, {
			props: { components: { h1: 'h2' }, children },
		});
		const layout = screen.getByTestId('layout');
		const button = screen.getByTestId('counter');
		expect(container.querySelector('h2')?.textContent).toBe('Interactive');
		fireEvent.click(button);
		expect(button.textContent).toBe('count: 3');

		rerender(MDXProvider, { props: { components: { h1: 'h3' }, children } });
		expect(container.querySelector('h3')?.textContent).toBe('Interactive');
		expect(container.querySelector('h2')).toBeNull();
		expect(screen.getByTestId('layout')).toBe(layout);
		expect(screen.getByTestId('counter')).toBe(button);
		expect(button.textContent).toBe('count: 3');

		rerender(MDXProvider, { props: { components: null, children } });
		expect(container.querySelector('h1')?.textContent).toBe('Interactive');
		expect(container.querySelector('h3')).toBeNull();
		expect(screen.getByTestId('counter')).toBe(button);
		fireEvent.click(button);
		expect(button.textContent).toBe('count: 4');
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
