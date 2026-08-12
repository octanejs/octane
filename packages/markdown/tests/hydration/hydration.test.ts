// @vitest-environment jsdom
import { cleanup, render } from '@octanejs/testing-library';
import type { Element, Root } from 'hast';
import type { ComponentBody } from 'octane';
import { createElement } from 'octane';
import { prerender } from 'octane/static';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Markdown, { type Components, type Options } from '../../src/index';

afterEach(cleanup);

async function hydrateMarkdown(props: Options) {
	const server = await prerender(Markdown as ComponentBody<Options>, props);
	const container = document.body.appendChild(document.createElement('div'));
	container.innerHTML = server.html;
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const result = render(Markdown as ComponentBody<Options>, {
		container,
		hydrate: true,
		props,
	});
	return { ...result, errors };
}

describe('Markdown hydration', () => {
	it('adopts default nodes, emits no diagnostics, and updates in place', async () => {
		const view = await hydrateMarkdown({ children: '# before\n\nparagraph' });
		const heading = view.container.querySelector('h1');
		try {
			expect(view.errors).not.toHaveBeenCalled();
			expect(heading?.textContent).toBe('before');
			view.rerender(Markdown as ComponentBody<Options>, {
				props: { children: '# after\n\nparagraph' },
			});
			expect(view.container.querySelector('h1')).toBe(heading);
			expect(heading?.textContent).toBe('after');
			expect(view.errors).not.toHaveBeenCalled();
		} finally {
			view.errors.mockRestore();
		}
	});

	it('adopts plugin, filtering, URL, and component-override output', async () => {
		const decorate = () => (tree: Root) => {
			const heading = tree.children[0] as Element;
			heading.properties.dataPlugin = 'yes';
		};
		const Mapped = ((props: Record<string, unknown>) =>
			createElement('section', {
				id: 'mapped',
				'data-plugin': props['data-plugin'],
				children: props.children,
			})) as unknown as ComponentBody<Record<string, unknown>>;
		const props: Options = {
			children: '# title\n\n[unsafe](javascript:alert(1))\n\nremoved',
			rehypePlugins: [decorate],
			disallowedElements: ['p'],
			components: { h1: Mapped } as unknown as Components,
		};
		const view = await hydrateMarkdown(props);
		const mapped = view.container.querySelector('#mapped');
		try {
			expect(view.errors).not.toHaveBeenCalled();
			expect(mapped?.getAttribute('data-plugin')).toBe('yes');
			expect(view.container.querySelector('p')).toBeNull();
			view.rerender(Markdown as ComponentBody<Options>, { props });
			expect(view.container.querySelector('#mapped')).toBe(mapped);
			expect(view.errors).not.toHaveBeenCalled();
		} finally {
			view.errors.mockRestore();
		}
	});
});
